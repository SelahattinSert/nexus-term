// Main-thread API for local, in-browser speech-to-text.
//
// Whisper runs inside a module Web Worker (./sttWorker.js) through
// @huggingface/transformers. This module owns the worker lifecycle, the shared
// status that UI components subscribe to, and every piece of pure logic
// (model table, dtype selection, prompt building, resampling, chunking,
// live-partial scheduling) so it can be unit-tested without Worker/AudioContext.

export const STT_SAMPLE_RATE = 16000;

/** Whisper's fixed input window is 30 s; keep chunks a bit below it. */
export const MAX_CHUNK_SECONDS = 28;

/** Anything shorter than this is treated as "nothing said". */
export const MIN_AUDIO_SECONDS = 0.3;

/** Prompt (vocabulary hint) budget, in characters, before tokenization. */
export const MAX_HINT_PROMPT_CHARS = 400;
export const MAX_CONTEXT_PROMPT_CHARS = 200;

/**
 * Available Whisper models. All repos are ONNX exports maintained by
 * onnx-community and ship encoder_model / decoder_model_merged files in
 * fp32, fp16, q8 (quantized), q4 (and q4f16 for large-v3-turbo) variants.
 */
export const STT_MODELS = [
  {
    id: 'onnx-community/whisper-base',
    label: 'Whisper Base',
    sizeHint: '~80-150 MB',
    recommended: false,
  },
  {
    id: 'onnx-community/whisper-small',
    label: 'Whisper Small',
    sizeHint: '~250-500 MB',
    recommended: true,
  },
  {
    id: 'onnx-community/whisper-large-v3-turbo',
    label: 'Whisper Large v3 Turbo (best accuracy)',
    sizeHint: '~1-1.6 GB',
    recommended: false,
  },
];

export const DEFAULT_STT_MODEL = 'onnx-community/whisper-small';

export function getSttModel(id) {
  return STT_MODELS.find((m) => m.id === id) ?? null;
}

export function resolveModelId(id) {
  return getSttModel(id) ? id : DEFAULT_STT_MODEL;
}

/**
 * Per-device dtypes for the two ONNX sessions Whisper uses.
 * - WebGPU: fp16 encoder (fp32 when the adapter lacks shader-f16) + q4 decoder,
 *   as recommended for the transformers.js Whisper WebGPU demos.
 * - WASM: q8 for both (the library's WASM default, smallest CPU-friendly files).
 */
export function selectDtypes(device, { fp16 = true } = {}) {
  if (device === 'webgpu') {
    return { encoder_model: fp16 ? 'fp16' : 'fp32', decoder_model_merged: 'q4' };
  }
  return { encoder_model: 'q8', decoder_model_merged: 'q8' };
}

/** Normalizes a language setting into a Whisper language code or null (auto). */
export function normalizeLanguage(language) {
  if (typeof language !== 'string') return null;
  const code = language.trim().toLowerCase();
  if (!code || code === 'auto') return null;
  // Accept 'tr-TR' / 'en_US' style tags as well.
  return code.split(/[-_]/)[0] || null;
}

/**
 * Builds Whisper prompt text from vocabulary hints. Whisper's prompt window is
 * ~220 tokens, so hints are deduplicated, kept in the given (relevance) order
 * and cut at a character budget. Optional context (the transcript of the
 * previous chunk) is appended last because Whisper weighs the end of the prompt most.
 */
export function buildPromptText(hints, { context = '', maxHintChars = MAX_HINT_PROMPT_CHARS, maxContextChars = MAX_CONTEXT_PROMPT_CHARS } = {}) {
  const seen = new Set();
  const picked = [];
  let used = 0;
  for (const raw of Array.isArray(hints) ? hints : []) {
    if (typeof raw !== 'string') continue;
    const hint = raw.replace(/\s+/g, ' ').trim();
    if (!hint) continue;
    const key = hint.toLowerCase();
    if (seen.has(key)) continue;
    const cost = hint.length + (picked.length ? 2 : 0);
    if (used + cost > maxHintChars) break;
    seen.add(key);
    picked.push(hint);
    used += cost;
  }
  let prompt = picked.join(', ');
  const ctx = typeof context === 'string' ? context.replace(/\s+/g, ' ').trim() : '';
  if (ctx) {
    const tail = ctx.length > maxContextChars ? ctx.slice(ctx.length - maxContextChars).replace(/^\S*\s/, '') : ctx;
    prompt = prompt ? `${prompt}. ${tail}` : tail;
  }
  return prompt;
}

/** Normalizes transcribe() options into the payload sent to the worker. */
export function buildTranscribeOptions({ model, language, hints, context } = {}) {
  const lang = normalizeLanguage(language);
  return {
    model: resolveModelId(model),
    language: lang,
    task: 'transcribe',
    prompt: buildPromptText(hints, { context }),
  };
}

/**
 * Linear-interpolation resampler to 16 kHz with a simple box low-pass when
 * downsampling (enough for speech; avoids heavy aliasing from 44.1/48 kHz mics).
 */
export function resampleTo16k(input, inputRate, targetRate = STT_SAMPLE_RATE) {
  if (!input || input.length === 0) return new Float32Array(0);
  if (!inputRate || inputRate === targetRate) return Float32Array.from(input);
  const ratio = inputRate / targetRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  if (ratio > 1) {
    // Average the source samples covered by each output sample.
    for (let i = 0; i < outLength; i++) {
      const start = i * ratio;
      const end = Math.min(start + ratio, input.length);
      let s = Math.floor(start);
      let sum = 0;
      let count = 0;
      for (; s < end; s++) {
        sum += input[s];
        count++;
      }
      out[i] = count ? sum / count : 0;
    }
  } else {
    for (let i = 0; i < outLength; i++) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, input.length - 1);
      const frac = pos - i0;
      out[i] = input[i0] * (1 - frac) + input[i1] * frac;
    }
  }
  return out;
}

/** Downmixes interleaved or planar channel data into one mono Float32Array. */
export function downmixToMono(channels) {
  if (!channels || channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return Float32Array.from(channels[0]);
  const len = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (const ch of channels) sum += ch[i];
    out[i] = sum / channels.length;
  }
  return out;
}

/** Concatenates Float32Array chunks; optionally keeps only the last `maxSamples`. */
export function concatFloat32(chunks, maxSamples = Infinity) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const keep = Math.min(total, maxSamples);
  const out = new Float32Array(keep);
  let skip = total - keep;
  let offset = 0;
  for (const c of chunks) {
    if (skip >= c.length) {
      skip -= c.length;
      continue;
    }
    const part = skip > 0 ? c.subarray(skip) : c;
    skip = 0;
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function rms(audio) {
  if (!audio || audio.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < audio.length; i++) sum += audio[i] * audio[i];
  return Math.sqrt(sum / audio.length);
}

/** True for audio that is too short or essentially digital silence. */
export function isNegligibleAudio(audio, sampleRate = STT_SAMPLE_RATE) {
  if (!audio || audio.length < MIN_AUDIO_SECONDS * sampleRate) return true;
  return rms(audio) < 0.001;
}

/**
 * Splits long audio into <= MAX_CHUNK_SECONDS pieces, cutting at the quietest
 * 100 ms frame within the last 4 s of each window so words are not split.
 */
export function splitAudioForWhisper(audio, sampleRate = STT_SAMPLE_RATE, maxSeconds = MAX_CHUNK_SECONDS) {
  const maxLen = Math.floor(maxSeconds * sampleRate);
  if (audio.length <= maxLen) return [audio];
  const frame = Math.floor(0.1 * sampleRate);
  const searchLen = Math.floor(4 * sampleRate);
  const chunks = [];
  let start = 0;
  while (audio.length - start > maxLen) {
    const windowEnd = start + maxLen;
    let bestCut = windowEnd;
    let bestEnergy = Infinity;
    for (let f = windowEnd - searchLen; f + frame <= windowEnd; f += frame) {
      const e = rms(audio.subarray(f, f + frame));
      if (e < bestEnergy) {
        bestEnergy = e;
        bestCut = f + Math.floor(frame / 2);
      }
    }
    chunks.push(audio.subarray(start, bestCut));
    start = bestCut;
  }
  if (audio.length - start > 0) chunks.push(audio.subarray(start));
  return chunks;
}

/**
 * Live-partial scheduler. `tick()` is meant to be called on an interval; it
 * starts at most one partial transcription at a time and only when the
 * engine is ready and idle and there is enough new audio.
 */
export function createPartialScheduler({
  getAudio, // () => Float32Array (16 kHz, already window-capped)
  isReady, // () => boolean
  isBusy, // () => boolean
  run, // (audio) => Promise<{ text }>
  onResult, // (text) => void
  minSamples = Math.floor(0.8 * STT_SAMPLE_RATE),
  minNewSamples = Math.floor(0.4 * STT_SAMPLE_RATE),
}) {
  let inFlight = false;
  let stopped = false;
  let lastLength = 0;
  let lastText = '';

  return {
    get inFlight() {
      return inFlight;
    },
    stop() {
      stopped = true;
    },
    /** Returns the in-flight promise when a partial was started, otherwise null. */
    tick(totalSamples) {
      if (stopped || inFlight) return null;
      if (!isReady() || isBusy()) return null;
      if (totalSamples < minSamples) return null;
      if (totalSamples - lastLength < minNewSamples) return null;
      const audio = getAudio();
      if (!audio || audio.length < minSamples) return null;
      inFlight = true;
      lastLength = totalSamples;
      return Promise.resolve()
        .then(() => run(audio))
        .then((res) => {
          const text = (res?.text ?? '').trim();
          if (!stopped && text && text !== lastText) {
            lastText = text;
            onResult(text);
          }
        })
        .catch(() => {
          // Partials are best effort; the final transcription reports errors.
        })
        .finally(() => {
          inFlight = false;
        });
    },
  };
}

// ---------------------------------------------------------------------------
// Worker-backed engine
// ---------------------------------------------------------------------------

let worker = null;
let nextId = 1;
const pending = new Map();
const listeners = new Set();
let status = { state: 'idle', progress: null, device: null, model: null, error: null };
let loadedModel = null;
let loadPromise = null;
let loadPromiseModel = null;
let busyCount = 0;

function setStatus(patch) {
  status = { ...status, ...patch };
  for (const cb of listeners) {
    try {
      cb(status);
    } catch (err) {
      console.error('STT status listener failed:', err);
    }
  }
}

export function getSttStatus() {
  return status;
}

function failAll(error) {
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
}

function handleMessage(event) {
  const msg = event.data || {};
  if (msg.type === 'status') {
    const { state, progress = null, device = null, model = null, error = null } = msg;
    if (state === 'ready') loadedModel = model;
    setStatus({ state, progress, device, model, error });
    return;
  }
  const entry = pending.get(msg.id);
  if (!entry) return;
  pending.delete(msg.id);
  if (msg.type === 'error') entry.reject(new Error(msg.error || 'Speech recognition failed'));
  else entry.resolve(msg.result);
}

function getWorker() {
  if (worker) return worker;
  if (typeof Worker === 'undefined') throw new Error('Web Workers are not available in this environment');
  worker = new Worker(new URL('./sttWorker.js', import.meta.url), { type: 'module', name: 'stt-worker' });
  worker.addEventListener('message', handleMessage);
  worker.addEventListener('error', (event) => {
    const error = new Error(event?.message || 'Speech recognition worker crashed');
    setStatus({ state: 'error', progress: null, error: error.message });
    failAll(error);
    worker?.terminate();
    worker = null;
    loadedModel = null;
    loadPromise = null;
    loadPromiseModel = null;
  });
  return worker;
}

function request(type, payload, transfer = []) {
  const w = getWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type, ...payload }, transfer);
  });
}

function loadPayload(model) {
  return {
    model,
    dtypes: {
      webgpu: selectDtypes('webgpu', { fp16: true }),
      webgpuNoFp16: selectDtypes('webgpu', { fp16: false }),
      wasm: selectDtypes('wasm'),
    },
  };
}

export function preloadStt({ model } = {}) {
  const id = resolveModelId(model);
  if (loadedModel === id && status.state === 'ready') return Promise.resolve();
  if (loadPromise && loadPromiseModel === id) return loadPromise;
  loadPromiseModel = id;
  const p = request('load', loadPayload(id)).then(
    () => {
      if (loadPromise === p) loadPromise = null;
    },
    (err) => {
      if (loadPromise === p) {
        loadPromise = null;
        loadPromiseModel = null;
      }
      throw err;
    },
  );
  loadPromise = p;
  return p;
}

export function subscribeSttStatus(cb) {
  listeners.add(cb);
  try {
    cb(status);
  } catch (err) {
    console.error('STT status listener failed:', err);
  }
  return () => {
    listeners.delete(cb);
  };
}

export function isSttReady(model) {
  return status.state === 'ready' && (!model || loadedModel === resolveModelId(model));
}

export function isSttBusy() {
  return busyCount > 0;
}

export async function transcribe(audio, { model, language, hints } = {}) {
  if (!(audio instanceof Float32Array) || isNegligibleAudio(audio)) return { text: '' };
  const base = buildTranscribeOptions({ model, language, hints });
  busyCount++;
  try {
    // The worker loads the model on demand; preload keeps status/progress in sync.
    await preloadStt({ model: base.model });
    const texts = [];
    for (const chunk of splitAudioForWhisper(audio)) {
      if (isNegligibleAudio(chunk)) continue;
      const opts = texts.length ? buildTranscribeOptions({ model, language, hints, context: texts.join(' ') }) : base;
      const copy = chunk.slice();
      const result = await request('transcribe', { audio: copy, options: opts, loadOptions: loadPayload(opts.model) }, [copy.buffer]);
      const text = (result?.text ?? '').trim();
      if (text) texts.push(text);
    }
    return { text: texts.join(' ').trim() };
  } finally {
    busyCount--;
  }
}

/** Test helper: drops the worker and resets module state. */
export function __resetSttForTests() {
  worker?.terminate?.();
  worker = null;
  failAll(new Error('reset'));
  listeners.clear();
  status = { state: 'idle', progress: null, device: null, model: null, error: null };
  loadedModel = null;
  loadPromise = null;
  loadPromiseModel = null;
  busyCount = 0;
}
