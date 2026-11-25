import { useState, useRef, useCallback, useEffect } from 'react';
import {
  STT_SAMPLE_RATE,
  concatFloat32,
  createPartialScheduler,
  isSttBusy,
  isSttReady,
  resampleTo16k,
  transcribe,
} from '../../voice/stt';

const PARTIAL_INTERVAL_MS = 1200;
const PARTIAL_WINDOW_SECONDS = 25;
const MIN_FINAL_SECONDS = 0.3;

const WORKLET_NAME = 'nexus-pcm-capture';
// Inline AudioWorklet: forwards the first input channel to the main thread.
const WORKLET_SOURCE = `
class NexusPcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length) {
      this.port.postMessage(input[0].slice(0));
    }
    return true;
  }
}
registerProcessor('${WORKLET_NAME}', NexusPcmCapture);
`;

const MIC_CONSTRAINTS = {
  audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

async function createCaptureNode(ctx, onChunk) {
  if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(ctx, WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
      });
      node.port.onmessage = (e) => onChunk(e.data);
      return {
        node,
        dispose: () => {
          node.port.onmessage = null;
          node.disconnect();
        },
      };
    } catch (err) {
      console.warn('AudioWorklet unavailable, falling back to ScriptProcessor:', err);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const node = ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (e) => {
    onChunk(new Float32Array(e.inputBuffer.getChannelData(0)));
    // Keep the output silent; the node is only connected so it keeps firing.
    e.outputBuffer.getChannelData(0).fill(0);
  };
  return {
    node,
    dispose: () => {
      node.onaudioprocess = null;
      node.disconnect();
    },
  };
}

function teardownSession(session) {
  if (!session || session.closed) return;
  session.closed = true;
  session.scheduler?.stop();
  if (session.timer) clearInterval(session.timer);
  try {
    session.capture?.dispose();
  } catch {
    // ignore
  }
  try {
    session.source?.disconnect();
  } catch {
    // ignore
  }
  session.stream?.getTracks().forEach((t) => t.stop());
  if (session.ctx && session.ctx.state !== 'closed') session.ctx.close().catch(() => {});
}

/** Stops capture and delivers the 16 kHz recording exactly once. */
function finishSession(session, onFinal) {
  if (!session || session.finalized) return;
  session.finalized = true;
  teardownSession(session);
  const rate = session.ctx?.sampleRate || STT_SAMPLE_RATE;
  let audio = new Float32Array(0);
  if (session.totalSamples >= MIN_FINAL_SECONDS * rate) {
    audio = resampleTo16k(concatFloat32(session.chunks), rate);
  }
  session.chunks = [];
  onFinal?.(audio);
}

/**
 * Captures microphone PCM, streams live partial transcripts and hands the full
 * 16 kHz mono recording to `onFinal` when recording stops.
 */
export function useAudioCapture({ onPartial, onFinal, getOptions } = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const callbacksRef = useRef({ onPartial, onFinal, getOptions });
  const sessionRef = useRef(null);

  useEffect(() => {
    callbacksRef.current = { onPartial, onFinal, getOptions };
  }, [onPartial, onFinal, getOptions]);

  const startRecording = useCallback(async () => {
    if (sessionRef.current && !sessionRef.current.finalized) return true;
    const session = { chunks: [], totalSamples: 0, closed: false, finalized: false };
    const readOptions = () => {
      try {
        return callbacksRef.current.getOptions?.() ?? {};
      } catch {
        return {};
      }
    };
    const finish = () => finishSession(session, callbacksRef.current.onFinal);
    sessionRef.current = session;
    setIsRecording(true);

    try {
      session.stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
      if (session.closed) {
        session.stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      session.ctx = new AudioCtx();
      if (session.ctx.state === 'suspended') await session.ctx.resume().catch(() => {});
      session.source = session.ctx.createMediaStreamSource(session.stream);
      session.capture = await createCaptureNode(session.ctx, (chunk) => {
        if (session.closed) return;
        session.chunks.push(chunk);
        session.totalSamples += chunk.length;
      });
      if (session.closed) return false;
      session.source.connect(session.capture.node);
      session.capture.node.connect(session.ctx.destination);

      const rate = session.ctx.sampleRate;
      const windowSamples = Math.floor(PARTIAL_WINDOW_SECONDS * rate);
      session.scheduler = createPartialScheduler({
        getAudio: () => resampleTo16k(concatFloat32(session.chunks, windowSamples), rate),
        isReady: () => isSttReady(readOptions().model),
        isBusy: isSttBusy,
        run: (audio) => transcribe(audio, readOptions()),
        onResult: (text) => {
          if (!session.closed) callbacksRef.current.onPartial?.(text);
        },
      });
      session.timer = setInterval(() => {
        session.scheduler.tick(Math.floor((session.totalSamples * STT_SAMPLE_RATE) / rate));
      }, PARTIAL_INTERVAL_MS);
      return true;
    } catch (err) {
      console.error('Microphone capture failed:', err);
      if (sessionRef.current === session) {
        sessionRef.current = null;
        setIsRecording(false);
      }
      session.chunks = [];
      finish();
      return false;
    }
  }, []);

  const stopRecording = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.finalized) return;
    sessionRef.current = null;
    setIsRecording(false);
    // If capture is still starting up, startRecording notices `closed` and bails out.
    finishSession(session, callbacksRef.current.onFinal);
  }, []);

  useEffect(
    () => () => {
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) {
        session.finalized = true; // unmount: no onFinal
        teardownSession(session);
      }
    },
    [],
  );

  return { isRecording, startRecording, stopRecording };
}
