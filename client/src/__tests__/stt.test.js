import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  STT_MODELS,
  DEFAULT_STT_MODEL,
  STT_SAMPLE_RATE,
  selectDtypes,
  resolveModelId,
  normalizeLanguage,
  buildPromptText,
  buildTranscribeOptions,
  resampleTo16k,
  downmixToMono,
  concatFloat32,
  isNegligibleAudio,
  splitAudioForWhisper,
  createPartialScheduler,
  preloadStt,
  transcribe,
  subscribeSttStatus,
  isSttBusy,
  __resetSttForTests,
} from '../voice/stt';

function tone(seconds, rate = STT_SAMPLE_RATE, amp = 0.3, freq = 220) {
  const out = new Float32Array(Math.floor(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

describe('model table', () => {
  it('lists small (default, recommended) and large-v3-turbo', () => {
    const ids = STT_MODELS.map((m) => m.id);
    expect(ids).toContain('onnx-community/whisper-small');
    expect(ids).toContain('onnx-community/whisper-large-v3-turbo');
    expect(DEFAULT_STT_MODEL).toBe('onnx-community/whisper-small');
    expect(STT_MODELS.find((m) => m.id === DEFAULT_STT_MODEL).recommended).toBe(true);
    expect(STT_MODELS.filter((m) => m.recommended)).toHaveLength(1);
    for (const m of STT_MODELS) {
      expect(m.label).toBeTruthy();
      expect(m.sizeHint).toBeTruthy();
    }
  });

  it('resolves unknown model ids to the default', () => {
    expect(resolveModelId('nope')).toBe(DEFAULT_STT_MODEL);
    expect(resolveModelId(undefined)).toBe(DEFAULT_STT_MODEL);
    expect(resolveModelId('onnx-community/whisper-large-v3-turbo')).toBe('onnx-community/whisper-large-v3-turbo');
  });

  it('selects dtypes per device', () => {
    expect(selectDtypes('webgpu')).toEqual({ encoder_model: 'fp16', decoder_model_merged: 'q4' });
    expect(selectDtypes('webgpu', { fp16: false })).toEqual({ encoder_model: 'fp32', decoder_model_merged: 'q4' });
    expect(selectDtypes('wasm')).toEqual({ encoder_model: 'q8', decoder_model_merged: 'q8' });
  });
});

describe('option building', () => {
  it('normalizes languages', () => {
    expect(normalizeLanguage('auto')).toBeNull();
    expect(normalizeLanguage('')).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
    expect(normalizeLanguage('TR')).toBe('tr');
    expect(normalizeLanguage('en-US')).toBe('en');
  });

  it('builds a deduplicated, bounded prompt from hints', () => {
    expect(buildPromptText([])).toBe('');
    expect(buildPromptText(['  kubectl ', 'NexusTerm', 'kubectl', '', null, 'git  rebase'])).toBe('kubectl, NexusTerm, git rebase');
    const many = Array.from({ length: 200 }, (_, i) => `word${i}`);
    const prompt = buildPromptText(many, { maxHintChars: 50 });
    expect(prompt.length).toBeLessThanOrEqual(50);
    expect(prompt.startsWith('word0, word1')).toBe(true);
  });

  it('appends context tail after hints', () => {
    const ctx = 'a '.repeat(300) + 'last words';
    const prompt = buildPromptText(['docker'], { context: ctx, maxContextChars: 30 });
    expect(prompt.startsWith('docker. ')).toBe(true);
    expect(prompt.endsWith('last words')).toBe(true);
    expect(prompt.length).toBeLessThan(45);
  });

  it('builds transcribe options', () => {
    expect(buildTranscribeOptions({ model: 'x', language: 'auto', hints: ['npm'] })).toEqual({
      model: DEFAULT_STT_MODEL,
      language: null,
      task: 'transcribe',
      prompt: 'npm',
    });
    expect(buildTranscribeOptions({ model: 'onnx-community/whisper-base', language: 'tr' })).toMatchObject({
      model: 'onnx-community/whisper-base',
      language: 'tr',
      task: 'transcribe',
      prompt: '',
    });
  });
});

describe('audio helpers', () => {
  it('resamples 48 kHz to 16 kHz with the right length and content', () => {
    const input = tone(1, 48000, 0.5, 200);
    const out = resampleTo16k(input, 48000);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(16000);
    const ref = tone(1, 16000, 0.5, 200);
    let maxErr = 0;
    for (let i = 10; i < out.length - 10; i++) maxErr = Math.max(maxErr, Math.abs(out[i] - ref[i]));
    expect(maxErr).toBeLessThan(0.05);
  });

  it('resamples 44.1 kHz and upsamples 8 kHz', () => {
    expect(resampleTo16k(new Float32Array(44100), 44100).length).toBe(16000);
    expect(resampleTo16k(new Float32Array(8000), 8000).length).toBe(16000);
  });

  it('passes 16 kHz through as a copy and handles empty input', () => {
    const input = new Float32Array([0.1, 0.2]);
    const out = resampleTo16k(input, 16000);
    expect(Array.from(out)).toEqual(Array.from(input));
    expect(out).not.toBe(input);
    expect(resampleTo16k(new Float32Array(0), 48000).length).toBe(0);
  });

  it('downmixes channels and concatenates with a tail cap', () => {
    expect(Array.from(downmixToMono([new Float32Array([1, 0]), new Float32Array([0, 1])]))).toEqual([0.5, 0.5]);
    const chunks = [new Float32Array([1, 2]), new Float32Array([3, 4, 5])];
    expect(Array.from(concatFloat32(chunks))).toEqual([1, 2, 3, 4, 5]);
    expect(Array.from(concatFloat32(chunks, 2))).toEqual([4, 5]);
    expect(Array.from(concatFloat32(chunks, 4))).toEqual([2, 3, 4, 5]);
  });

  it('flags short or silent audio as negligible', () => {
    expect(isNegligibleAudio(new Float32Array(100))).toBe(true);
    expect(isNegligibleAudio(new Float32Array(16000))).toBe(true);
    expect(isNegligibleAudio(tone(1))).toBe(false);
  });

  it('splits long audio into <= 28 s chunks at quiet points', () => {
    const rate = STT_SAMPLE_RATE;
    const audio = tone(60);
    // Silence around 26 s so the first cut lands there.
    audio.fill(0, 26 * rate, Math.floor(26.3 * rate));
    const chunks = splitAudioForWhisper(audio);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.reduce((n, c) => n + c.length, 0)).toBe(audio.length);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(28 * rate);
    expect(chunks[0].length / rate).toBeGreaterThan(25.9);
    expect(chunks[0].length / rate).toBeLessThan(26.4);
    expect(splitAudioForWhisper(tone(5))).toHaveLength(1);
  });
});

describe('createPartialScheduler', () => {
  function deferred() {
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    return { promise, resolve };
  }

  it('runs at most one partial at a time and reports new text', async () => {
    const runs = [];
    const onResult = vi.fn();
    const s = createPartialScheduler({
      getAudio: () => new Float32Array(16000),
      isReady: () => true,
      isBusy: () => false,
      run: () => {
        const d = deferred();
        runs.push(d);
        return d.promise;
      },
      onResult,
    });
    const p = s.tick(16000);
    expect(p).not.toBeNull();
    expect(s.tick(32000)).toBeNull(); // still in flight
    await Promise.resolve();
    expect(runs).toHaveLength(1);
    runs[0].resolve({ text: ' hello ' });
    await p;
    expect(onResult).toHaveBeenCalledWith('hello');

    const p2 = s.tick(32000);
    await Promise.resolve();
    runs[1].resolve({ text: 'hello' }); // unchanged text is not re-emitted
    await p2;
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('skips when not ready, busy, too short, or no new audio', () => {
    let ready = false;
    let busy = false;
    const run = vi.fn(() => Promise.resolve({ text: 'x' }));
    const s = createPartialScheduler({
      getAudio: () => new Float32Array(16000),
      isReady: () => ready,
      isBusy: () => busy,
      run,
      onResult: () => {},
    });
    expect(s.tick(16000)).toBeNull();
    ready = true;
    busy = true;
    expect(s.tick(16000)).toBeNull();
    busy = false;
    expect(s.tick(1000)).toBeNull(); // too short
    expect(run).not.toHaveBeenCalled();
  });

  it('requires new audio between partials and stops emitting after stop()', async () => {
    const onResult = vi.fn();
    const s = createPartialScheduler({
      getAudio: () => new Float32Array(16000),
      isReady: () => true,
      isBusy: () => false,
      run: () => Promise.resolve({ text: 'a' }),
      onResult,
    });
    await s.tick(16000);
    expect(s.tick(16100)).toBeNull(); // < 0.4 s of new audio
    const p = s.tick(32000);
    s.stop();
    await p;
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(s.tick(64000)).toBeNull();
  });

  it('swallows run errors and frees the slot', async () => {
    const s = createPartialScheduler({
      getAudio: () => new Float32Array(16000),
      isReady: () => true,
      isBusy: () => false,
      run: () => Promise.reject(new Error('boom')),
      onResult: () => {},
    });
    await s.tick(16000);
    expect(s.inFlight).toBe(false);
  });
});

describe('worker-backed engine (mocked Worker)', () => {
  let instances;

  class FakeWorker {
    constructor(url, opts) {
      this.url = String(url);
      this.opts = opts;
      this.listeners = { message: [], error: [] };
      this.posted = [];
      instances.push(this);
    }
    addEventListener(type, cb) {
      this.listeners[type].push(cb);
    }
    postMessage(msg) {
      this.posted.push(msg);
      queueMicrotask(() => {
        if (msg.type === 'load') {
          this.emit({ type: 'status', state: 'ready', device: 'wasm', model: msg.model, progress: null });
          this.emit({ id: msg.id, type: 'result', result: null });
        } else if (msg.type === 'transcribe') {
          this.emit({ id: msg.id, type: 'result', result: { text: `chunk${msg.audio.length}` } });
        }
      });
    }
    emit(data) {
      for (const cb of this.listeners.message) cb({ data });
    }
    terminate() {}
  }

  beforeEach(() => {
    instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    __resetSttForTests();
  });

  afterEach(() => {
    __resetSttForTests();
    vi.unstubAllGlobals();
  });

  it('does not create the worker until first use', async () => {
    const statuses = [];
    const unsub = subscribeSttStatus((s) => statuses.push(s.state));
    expect(instances).toHaveLength(0);
    expect(statuses).toEqual(['idle']);
    await preloadStt({ model: DEFAULT_STT_MODEL });
    expect(instances).toHaveLength(1);
    expect(instances[0].opts).toMatchObject({ type: 'module' });
    expect(statuses.at(-1)).toBe('ready');
    await preloadStt({ model: DEFAULT_STT_MODEL }); // already ready: no new load
    expect(instances[0].posted.filter((m) => m.type === 'load')).toHaveLength(1);
    unsub();
  });

  it('dedupes concurrent preloads and sends dtypes for both devices', async () => {
    const a = preloadStt({});
    const b = preloadStt({ model: DEFAULT_STT_MODEL });
    expect(a).toBe(b);
    await a;
    const load = instances[0].posted.find((m) => m.type === 'load');
    expect(load.dtypes.webgpu.decoder_model_merged).toBe('q4');
    expect(load.dtypes.wasm.encoder_model).toBe('q8');
  });

  it('returns empty text for negligible audio without spawning the worker', async () => {
    expect(await transcribe(new Float32Array(10), {})).toEqual({ text: '' });
    expect(instances).toHaveLength(0);
  });

  it('transcribes long audio in chunks with hints and language, tracking busy state', async () => {
    const audio = tone(40);
    const p = transcribe(audio, { model: DEFAULT_STT_MODEL, language: 'tr', hints: ['kubectl'] });
    expect(isSttBusy()).toBe(true);
    const { text } = await p;
    expect(isSttBusy()).toBe(false);
    const sent = instances[0].posted.filter((m) => m.type === 'transcribe');
    expect(sent).toHaveLength(2);
    expect(sent[0].options).toMatchObject({ language: 'tr', task: 'transcribe', prompt: 'kubectl' });
    expect(sent[1].options.prompt.startsWith('kubectl. chunk')).toBe(true);
    expect(text.split(' ')).toHaveLength(2);
  });
});
