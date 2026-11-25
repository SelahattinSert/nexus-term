// Web worker that runs Piper (VITS/ONNX) inference off the main thread.
//
// Protocol (main -> worker):
//   { id, type: 'load',  voiceId }
//   { id, type: 'synth', voiceId, text }
// Protocol (worker -> main):
//   { id, type: 'progress', loaded, total }
//   { id, type: 'done', audio?: ArrayBuffer, mime?: string }
//   { id, type: 'error', message }
//
// Requests are processed strictly one at a time: the underlying library keeps
// a single global session and is not safe for interleaved calls.

import { TtsSession, INFERENCE_PROGRESS_URL } from '@mintplex-labs/piper-tts-web';
// Serve the ONNX runtime wasm from our own bundle so its version always
// matches the installed onnxruntime-web JS (the library's default points at
// an older CDN build).
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

// Phonemizer (espeak-ng compiled to wasm). Not shipped in the npm package, so
// it is loaded from the CDN the library was built against.
const PIPER_WASM_BASE = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';

const WASM_PATHS = {
  onnxWasm: { wasm: ortWasmUrl },
  piperData: `${PIPER_WASM_BASE}.data`,
  piperWasm: `${PIPER_WASM_BASE}.wasm`,
};

// The phonemizer's Emscripten glue detects "am I in a worker?" through
// `typeof importScripts === 'function'`. Module workers (used in dev, and
// requested by `type: 'module'`) do not define it, which would make the glue
// think it runs in a JS shell. It never actually calls it for this build, so
// a stub restores the correct environment detection. The library imports the
// glue lazily, so this runs before it is evaluated.
if (typeof self.importScripts !== 'function') {
  self.importScripts = () => {
    throw new Error('importScripts is not available in module workers');
  };
}

let session = null;
let sessionVoice = null;
let currentRequestId = null;

function post(msg, transfer) {
  self.postMessage(msg, transfer || []);
}

function onProgress(p) {
  if (currentRequestId == null || !p || p.url === INFERENCE_PROGRESS_URL) return;
  post({ id: currentRequestId, type: 'progress', loaded: p.loaded || 0, total: p.total || 0 });
}

async function ensureSession(voiceId) {
  if (session && sessionVoice === voiceId) {
    await session.waitReady;
    return session;
  }
  // The library caches one global instance and silently reuses it (with the
  // old model) for a new voice id. Drop it so the new voice really loads.
  TtsSession._instance = null;
  session = null;
  sessionVoice = null;
  const created = await TtsSession.create({ voiceId, progress: onProgress, wasmPaths: WASM_PATHS });
  session = created;
  sessionVoice = voiceId;
  return created;
}

async function handle(msg) {
  const { id, type, voiceId } = msg;
  currentRequestId = id;
  try {
    const s = await ensureSession(voiceId);
    if (type === 'load') {
      post({ id, type: 'done' });
      return;
    }
    if (type === 'synth') {
      const blob = await s.predict(msg.text);
      const audio = await blob.arrayBuffer();
      post({ id, type: 'done', audio, mime: blob.type || 'audio/wav' }, [audio]);
      return;
    }
    post({ id, type: 'error', message: `Unknown request type: ${type}` });
  } catch (err) {
    // A failed init leaves the library's singleton in a broken state.
    if (!session || sessionVoice !== voiceId) TtsSession._instance = null;
    post({ id, type: 'error', message: err?.message || String(err) });
  } finally {
    currentRequestId = null;
  }
}

let queue = Promise.resolve();
self.onmessage = (event) => {
  const msg = event.data;
  queue = queue.then(() => handle(msg));
};
