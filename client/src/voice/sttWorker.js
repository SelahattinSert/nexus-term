// Module Web Worker that runs Whisper locally via @huggingface/transformers.
//
// Messages in:
//   { id, type: 'load', model, dtypes: { webgpu, webgpuNoFp16, wasm } }
//   { id, type: 'transcribe', audio: Float32Array(16 kHz mono), options: { model, language, task, prompt }, loadOptions }
// Messages out:
//   { type: 'status', state, progress, device, model, error }
//   { id, type: 'result', result } | { id, type: 'error', error }
//
// Requests are processed strictly one at a time.

import {
  env,
  AutoProcessor,
  WhisperForConditionalGeneration,
  LogitsProcessor,
  LogitsProcessorList,
} from '@huggingface/transformers';

env.allowLocalModels = false;
env.allowRemoteModels = true;

// Serve the ONNX Runtime WebAssembly files from our own build instead of the jsdelivr CDN, so after
// the one-time model download speech recognition works completely offline.
import ortWasmUrl from '../../node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm?url';
import ortMjsUrl from '../../node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs?url';

if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = { wasm: ortWasmUrl, mjs: ortMjsUrl };
}

/** Whisper's prompt (previous-context) window is max_target_positions / 2 - 1 = 223 tokens. */
const MAX_PROMPT_TOKENS = 200;
/** Decoder context is 448 positions. */
const MAX_DECODER_POSITIONS = 448;

let current = null; // { model, device, processor, tokenizer, whisper }
let queue = Promise.resolve();

function postStatus(state, extra = {}) {
  self.postMessage({
    type: 'status',
    state,
    progress: null,
    device: current?.device ?? null,
    model: current?.model ?? null,
    error: null,
    ...extra,
  });
}

async function detectWebGpu() {
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    return { fp16: adapter.features?.has?.('shader-f16') ?? false };
  } catch {
    return null;
  }
}

async function disposeCurrent() {
  if (!current) return;
  const old = current;
  current = null;
  try {
    await old.whisper?.dispose?.();
  } catch {
    // ignore dispose failures
  }
}

async function loadOnDevice(model, device, dtype) {
  let lastProgress = -1;
  const progress_callback = (info) => {
    if (info?.status === 'progress_total') {
      const p = Math.max(0, Math.min(1, (info.progress ?? 0) / 100));
      if (p - lastProgress >= 0.01 || p === 1) {
        lastProgress = p;
        postStatus(p >= 1 ? 'loading' : 'downloading', { progress: p, device, model });
      }
    }
  };

  postStatus('downloading', { progress: 0, device, model });
  const processor = await AutoProcessor.from_pretrained(model, { progress_callback });
  const whisper = await WhisperForConditionalGeneration.from_pretrained(model, {
    device,
    dtype,
    progress_callback,
  });
  postStatus('loading', { progress: null, device, model });

  // Warm-up run: compiles WebGPU shaders / initializes WASM kernels so the
  // first real transcription is not penalized.
  const silence = new Float32Array(16000);
  const inputs = await processor(silence);
  await whisper.generate({ ...inputs, max_new_tokens: 1 });

  return { model, device, processor, tokenizer: processor.tokenizer, whisper };
}

async function ensureLoaded(model, dtypes) {
  if (current?.model === model) return current;
  await disposeCurrent();

  const gpu = await detectWebGpu();
  if (gpu) {
    try {
      const dtype = gpu.fp16 ? dtypes.webgpu : dtypes.webgpuNoFp16;
      current = await loadOnDevice(model, 'webgpu', dtype);
      postStatus('ready', { device: 'webgpu', model });
      return current;
    } catch (err) {
      console.warn('[stt] WebGPU load failed, falling back to WASM:', err);
      current = null;
    }
  }

  try {
    current = await loadOnDevice(model, 'wasm', dtypes.wasm);
    postStatus('ready', { device: 'wasm', model });
    return current;
  } catch (err) {
    current = null;
    postStatus('error', { device: null, model, error: String(err?.message || err) });
    throw err;
  }
}

/**
 * Forces Whisper's task header after an explicit prefix when the language is
 * unknown: step 1 may only pick a language token, step 2 is <|transcribe|>,
 * step 3 is <|notimestamps|>; begin-suppress tokens then apply to the first text token.
 */
class AutoLanguageHeaderProcessor extends LogitsProcessor {
  constructor(beginIndex, languageIds, transcribeId, noTimestampsId, beginSuppressIds = []) {
    super();
    this.beginSuppressIds = beginSuppressIds;
    this.beginIndex = beginIndex;
    this.languageIds = languageIds;
    this.transcribeId = transcribeId;
    this.noTimestampsId = noTimestampsId;
  }

  _call(input_ids, logits) {
    for (let i = 0; i < input_ids.length; ++i) {
      const step = input_ids[i].length - this.beginIndex;
      if (step < 0 || step > 3) continue;
      const data = /** @type {Float32Array} */ (logits[i].data);
      if (step === 3) {
        // Whisper's begin_suppress_tokens normally apply to the first text token.
        for (const id of this.beginSuppressIds) data[id] = -Infinity;
      } else if (step === 0) {
        const keep = new Float32Array(this.languageIds.length);
        this.languageIds.forEach((id, k) => (keep[k] = data[id]));
        data.fill(-Infinity);
        this.languageIds.forEach((id, k) => (data[id] = keep[k]));
      } else {
        const forced = step === 1 ? this.transcribeId : this.noTimestampsId;
        if (forced == null) continue;
        data.fill(-Infinity);
        data[forced] = 0;
      }
    }
    return logits;
  }
}

function tokenId(tokenizer, token) {
  const id = tokenizer.convert_tokens_to_ids(token);
  return typeof id === 'number' && id >= 0 ? id : null;
}

function buildPrefix(state, { language, task, prompt }) {
  const { tokenizer, whisper } = state;
  const gen = whisper.generation_config ?? {};
  const prefix = [];

  if (prompt) {
    const prevId = tokenId(tokenizer, '<|startofprev|>');
    if (prevId != null) {
      let ids = tokenizer.encode(' ' + prompt.trim(), { add_special_tokens: false });
      if (ids.length > MAX_PROMPT_TOKENS) ids = ids.slice(ids.length - MAX_PROMPT_TOKENS);
      prefix.push(prevId, ...ids);
    }
  }

  const sot = gen.decoder_start_token_id ?? tokenId(tokenizer, '<|startoftranscript|>');
  prefix.push(sot);

  const taskId = gen.task_to_id?.[task ?? 'transcribe'] ?? tokenId(tokenizer, `<|${task ?? 'transcribe'}|>`);
  const noTs = gen.no_timestamps_token_id ?? tokenId(tokenizer, '<|notimestamps|>');
  const langId = language ? (gen.lang_to_id?.[`<|${language}|>`] ?? tokenId(tokenizer, `<|${language}|>`)) : null;

  let logits_processor = null;
  if (langId != null) {
    prefix.push(langId, taskId);
    if (noTs != null) prefix.push(noTs);
  } else {
    // Auto-detect: let the model choose the language token, then force the rest.
    const languageIds = Object.values(gen.lang_to_id ?? {}).filter((x) => typeof x === 'number');
    if (languageIds.length) {
      logits_processor = new LogitsProcessorList();
      logits_processor.push(new AutoLanguageHeaderProcessor(prefix.length, languageIds, taskId, noTs, gen.begin_suppress_tokens ?? []));
    } else {
      prefix.push(taskId);
      if (noTs != null) prefix.push(noTs);
    }
  }
  return { prefix: prefix.filter((x) => x != null), logits_processor };
}

async function runTranscribe(audio, options, loadOptions) {
  const state = await ensureLoaded(options.model, loadOptions.dtypes);
  if (!audio || audio.length === 0) return { text: '' };

  const inputs = await state.processor(audio);
  const { prefix, logits_processor } = buildPrefix(state, options);
  const max_new_tokens = Math.max(16, Math.min(440, MAX_DECODER_POSITIONS - prefix.length - 4));

  const output = await state.whisper.generate({
    ...inputs,
    decoder_input_ids: prefix,
    max_new_tokens,
    ...(logits_processor ? { logits_processor } : {}),
  });

  const sequence = (output.sequences ?? output).tolist()[0].map(Number);
  const generated = sequence.slice(prefix.length);
  const text = state.tokenizer.decode(generated, { skip_special_tokens: true }).trim();
  return { text };
}

function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  const { id, type } = msg;

  const reply = (promise) =>
    promise.then(
      (result) => self.postMessage({ id, type: 'result', result }),
      (err) => self.postMessage({ id, type: 'error', error: String(err?.message || err) }),
    );

  if (type === 'load') {
    reply(enqueue(() => ensureLoaded(msg.model, msg.dtypes).then(() => null)));
  } else if (type === 'transcribe') {
    reply(enqueue(() => runTranscribe(msg.audio, msg.options, msg.loadOptions)));
  } else if (id != null) {
    self.postMessage({ id, type: 'error', error: `Unknown message type: ${type}` });
  }
});
