// Local neural text-to-speech for the voice assistant.
//
// Piper voices (VITS models exported to ONNX) run fully in the browser via
// @mintplex-labs/piper-tts-web inside a Web Worker. Models are downloaded on
// first use from Hugging Face and cached in the Origin Private File System, so
// later sessions work without re-downloading. Whenever the neural engine is
// unavailable or fails, speech falls back to window.speechSynthesis.
//
// Everything above the "Engine" section is pure logic and unit-tested.

export const SYSTEM_VOICE = 'system';

// Voices offered in the UI. Only voices whose MODEL_CARD license permits use
// in an MIT-licensed open-source app are listed. License strings are copied
// from each voice's MODEL_CARD in the Hugging Face mirror the engine
// downloads from (huggingface.co/diffusionstudio/piper-voices, a copy of
// rhasspy/piper-voices).
//
// `caveat` marks voices that were fine-tuned from the Piper "lessac"
// checkpoint, whose source dataset (Blizzard 2013) is under a research-only
// license. The voice data itself is permissive; the checkpoint lineage is a
// known open question in the Piper community. Voices trained from scratch on
// public-domain data have no caveat.
//
// Excluded on purpose:
//   tr_TR-dfki-medium         CC BY-NC-SA 4.0 (non-commercial)
//   en_US-ryan-*              CC BY-NC-SA 4.0 (non-commercial)
//   en_US-hfc_female/male-*   CC BY-NC-SA 4.0 (non-commercial)
//   en_US-lessac-*            Blizzard 2013 research-only license
//   en_US-amy-*, en_GB-alan-* "See URL" (Mimic 3 data, terms not stated)
//   en_US-libritts_r-medium   multi-speaker (904 voices), 79 MB, no fixed voice
const LESSAC_CAVEAT = 'Fine-tuned from the Piper "lessac" checkpoint (research-licensed source data).';

export const PIPER_VOICES = [
  {
    id: 'tr_TR-fahrettin-medium',
    language: 'tr',
    locale: 'tr-TR',
    label: 'Fahrettin (Türkçe, erkek)',
    quality: 'medium',
    sizeHint: '63 MB',
    license: 'CC0 1.0 (dataset: NabuCasa voice-datasets)',
    caveat: LESSAC_CAVEAT,
  },
  {
    id: 'tr_TR-fettah-medium',
    language: 'tr',
    locale: 'tr-TR',
    label: 'Fettah (Türkçe, erkek)',
    quality: 'medium',
    sizeHint: '63 MB',
    license: 'CC0 1.0 (dataset: NabuCasa voice-datasets)',
    caveat: LESSAC_CAVEAT,
  },
  {
    id: 'en_US-kristin-medium',
    language: 'en',
    locale: 'en-US',
    label: 'Kristin (US English, female)',
    quality: 'medium',
    sizeHint: '64 MB',
    license: 'Public domain (LibriVox recordings, trained from scratch)',
  },
  {
    id: 'en_GB-cori-medium',
    language: 'en',
    locale: 'en-GB',
    label: 'Cori (UK English, female)',
    quality: 'medium',
    sizeHint: '64 MB',
    license: 'Public domain (LibriVox recordings, trained from scratch)',
  },
  {
    id: 'en_US-joe-medium',
    language: 'en',
    locale: 'en-US',
    label: 'Joe (US English, male)',
    quality: 'medium',
    sizeHint: '63 MB',
    license: 'CC0 1.0 (dataset: NabuCasa voice-datasets)',
    caveat: LESSAC_CAVEAT,
  },
  {
    id: 'en_GB-northern_english_male-medium',
    language: 'en',
    locale: 'en-GB',
    label: 'Northern English (UK English, male)',
    quality: 'medium',
    sizeHint: '63 MB',
    license: 'CC BY-SA 4.0 (OpenSLR 83, Google)',
    caveat: LESSAC_CAVEAT,
  },
  {
    id: 'en_GB-alba-medium',
    language: 'en',
    locale: 'en-GB',
    label: 'Alba (Scottish English, female)',
    quality: 'medium',
    sizeHint: '63 MB',
    license: 'CC BY 4.0 (University of Edinburgh, datashare 10283/3270)',
    caveat: LESSAC_CAVEAT,
  },
];

const DEFAULT_VOICE_BY_LANGUAGE = {
  tr: 'tr_TR-fahrettin-medium',
  en: 'en_US-kristin-medium',
};

export const SAMPLE_TEXT = {
  tr: 'Merhaba! Ben NexusTerm sesli asistanı. Komutlarını dinlemeye hazırım.',
  en: 'Hello! I am the NexusTerm voice assistant. Ready when you are.',
};

export function getPiperVoice(voiceId) {
  return PIPER_VOICES.find((v) => v.id === voiceId) || null;
}

function normalizeLanguage(language) {
  if (!language || typeof language !== 'string') return 'auto';
  return language.toLowerCase().split(/[-_]/)[0];
}

/**
 * Pick the default voice for a language ('tr' | 'en' | 'auto', locales such as
 * 'tr-TR' are accepted). 'auto' follows the browser language. Languages
 * without a bundled Piper voice use the system voice.
 */
export function defaultVoiceFor(language, navigatorLanguage) {
  let lang = normalizeLanguage(language);
  if (lang === 'auto') {
    const navLang = navigatorLanguage ?? (typeof navigator !== 'undefined' ? navigator.language : '');
    lang = normalizeLanguage(navLang) === 'tr' ? 'tr' : 'en';
  }
  return DEFAULT_VOICE_BY_LANGUAGE[lang] || SYSTEM_VOICE;
}

/** Rough language guess, used only when nothing else tells us the language. */
export function detectLanguage(text) {
  return /[çğışöüÇĞİŞÖÜ]/.test(text || '') ? 'tr' : 'en';
}

/**
 * Decide whether speech must go through window.speechSynthesis instead of the
 * neural engine. `env` defaults to the global scope; tests pass a fake.
 */
export function shouldUseSystemVoice(voiceId, env = globalThis) {
  if (!voiceId || voiceId === SYSTEM_VOICE) return true;
  if (!getPiperVoice(voiceId)) return true;
  if (!env || typeof env.Worker !== 'function') return true;
  if (typeof env.WebAssembly !== 'object' || env.WebAssembly === null) return true;
  // The engine caches models in the Origin Private File System.
  if (typeof env.navigator?.storage?.getDirectory !== 'function') return true;
  return false;
}

// eslint-disable-next-line no-control-regex
const ANSI_CSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
// eslint-disable-next-line no-control-regex
const ANSI_OSC = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
// eslint-disable-next-line no-control-regex
const OTHER_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const CODE_BLOCK_PHRASE = {
  tr: ' Kod bloğu ekranda. ',
  en: ' Code block shown on screen. ',
};

function urlToSpeech(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host || 'link';
  } catch {
    return 'link';
  }
}

/**
 * Turn assistant output (markdown, terminal output) into plain speakable
 * text: drop ANSI escapes, code fences, markdown syntax and HTML, and replace
 * URLs with their host name so they are not spelled out.
 */
export function sanitizeForSpeech(text, { language } = {}) {
  if (!text) return '';
  const lang = normalizeLanguage(language) === 'tr' ? 'tr' : normalizeLanguage(language) === 'en' ? 'en' : detectLanguage(text);
  let s = String(text);

  s = s.replace(ANSI_OSC, '').replace(ANSI_CSI, '').replace(OTHER_CONTROL, '');
  s = s.replace(/\r\n?/g, '\n');

  // Fenced code blocks (``` or ~~~), including an unterminated trailing one.
  s = s.replace(/(```|~~~)[^\n]*\n[\s\S]*?(?:\1|$)/g, CODE_BLOCK_PHRASE[lang]);
  // Images and links: keep the human-readable part.
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]+)\]\((?:[^)(]|\([^)]*\))*\)/g, '$1');
  // Autolinks <https://...>, then bare URLs.
  s = s.replace(/<((?:https?|ftp):\/\/[^>\s]+)>/gi, (_, url) => urlToSpeech(url));
  s = s.replace(/\b(?:https?|ftp):\/\/[^\s<>"')\]]+/gi, (url) => urlToSpeech(url));
  s = s.replace(/\bwww\.[^\s<>"')\]]+/gi, (url) => urlToSpeech(`http://${url}`));
  // HTML tags.
  s = s.replace(/<\/?[a-z][^>]*>/gi, ' ');
  // Inline code: keep the content without backticks.
  s = s.replace(/`+([^`\n]+?)`+/g, '$1').replace(/`/g, '');
  // Block-level markdown at line start: headings, quotes, list markers, rules.
  s = s.replace(/^[ \t]*#{1,6}[ \t]+/gm, '');
  s = s.replace(/^[ \t]*>+[ \t]?/gm, '');
  s = s.replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '');
  s = s.replace(/^[ \t]*[-*+][ \t]+(?:\[[ xX]\][ \t]+)?/gm, '');
  s = s.replace(/^[ \t]*(\d+)[.)][ \t]+/gm, '$1. ');
  // Tables: drop separator rows, turn cell borders into pauses.
  s = s.replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, '');
  s = s.replace(/[ \t]*\|[ \t]*/g, ', ').replace(/^, |, $/gm, '');
  // Emphasis: **x**, __x__, *x*, _x_, ~~x~~ (keep snake_case identifiers).
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2');
  s = s.replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1$2');
  s = s.replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2');
  s = s.replace(/~~(.+?)~~/g, '$1');
  // Leftover markup characters that would be read aloud.
  s = s.replace(/[*#]{2,}/g, ' ');

  // Paragraph and line breaks become sentence boundaries.
  s = s
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (/[.!?…:;,]$/.test(line) ? line : `${line}.`))
    .join(' ');
  s = s.replace(/\s+/g, ' ').replace(/\s+([.,!?;:])/g, '$1').replace(/([.!?])\.+/g, '$1').trim();
  return s;
}

function splitLong(sentence, maxLength) {
  if (sentence.length <= maxLength) return [sentence];
  const out = [];
  // Prefer clause boundaries, then words.
  const clauses = sentence.match(/[^,;:]+[,;:]?\s*/g) || [sentence];
  let current = '';
  const flush = () => {
    const c = current.trim();
    if (c) out.push(c);
    current = '';
  };
  for (const clause of clauses) {
    if ((current + clause).length <= maxLength) {
      current += clause;
      continue;
    }
    flush();
    if (clause.length <= maxLength) {
      current = clause;
      continue;
    }
    for (const word of clause.split(/\s+/).filter(Boolean)) {
      if (current && (current + ' ' + word).length > maxLength) flush();
      current = current ? `${current} ${word}` : word;
    }
  }
  flush();
  return out;
}

/**
 * Split plain text into sentence-sized chunks for incremental synthesis.
 * Very short fragments are merged with their neighbour to avoid choppy
 * playback; overly long sentences are split at clauses or words.
 */
export function splitSentences(text, { maxLength = 220, minLength = 24 } = {}) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  // A boundary is terminal punctuation followed by whitespace, so decimals,
  // versions and host names ("3.5", "example.com") stay intact.
  const raw = clean.split(/(?<=[.!?…]["')\]]*)\s+/);
  const merged = [];
  for (const part of raw) {
    const sentence = part.trim();
    if (!sentence) continue;
    const last = merged[merged.length - 1];
    if (last !== undefined && last.length < minLength && (last + ' ' + sentence).length <= maxLength) {
      merged[merged.length - 1] = `${last} ${sentence}`;
    } else {
      merged.push(sentence);
    }
  }
  // A trailing fragment that is too short joins the previous chunk.
  if (merged.length > 1) {
    const tail = merged[merged.length - 1];
    const prev = merged[merged.length - 2];
    if (tail.length < minLength && (prev + ' ' + tail).length <= maxLength) {
      merged.splice(-2, 2, `${prev} ${tail}`);
    }
  }
  return merged.flatMap((s) => splitLong(s, maxLength));
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const IDLE_STATUS = { state: 'idle', progress: null, voiceId: null, error: null };
let status = IDLE_STATUS;
const listeners = new Set();

function setStatus(patch) {
  status = { ...status, ...patch };
  for (const cb of [...listeners]) {
    try {
      cb(status);
    } catch (err) {
      console.error('[tts] status listener failed', err);
    }
  }
}

export function getTtsStatus() {
  return status;
}

/** Subscribe to engine status. The callback is invoked immediately with the current status. */
export function subscribeTtsStatus(cb) {
  listeners.add(cb);
  cb(status);
  return () => listeners.delete(cb);
}

// ---------------------------------------------------------------------------
// Engine (Web Worker client) and audio playback
// ---------------------------------------------------------------------------

const LOAD_TIMEOUT_MS = 10 * 60 * 1000;
const SYNTH_TIMEOUT_MS = 60 * 1000;

function createWorkerEngine() {
  const worker = new Worker(new URL('./ttsWorker.js', import.meta.url), { type: 'module' });
  const pending = new Map();
  let seq = 0;
  let dead = false;

  const failAll = (err) => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
  };

  const kill = (err) => {
    if (dead) return;
    dead = true;
    worker.terminate();
    failAll(err);
    if (engine === api) engine = null;
  };

  worker.onmessage = (event) => {
    const msg = event.data || {};
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'progress') {
      p.onProgress?.(msg);
      return;
    }
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.type === 'done') p.resolve(msg);
    else p.reject(new Error(msg.message || 'TTS engine error'));
  };
  worker.onerror = (event) => {
    event.preventDefault?.();
    kill(new Error(event.message || 'TTS worker crashed'));
  };

  const request = (msg, { onProgress, timeoutMs }) => {
    if (dead) return Promise.reject(new Error('TTS worker is not running'));
    const id = ++seq;
    return new Promise((resolve, reject) => {
      // A stuck request (for example a phonemizer that never answers) would
      // block the worker's queue forever, so restart the worker on timeout.
      const timer = setTimeout(() => kill(new Error('TTS engine timed out')), timeoutMs);
      pending.set(id, { resolve, reject, onProgress, timer });
      worker.postMessage({ id, ...msg });
    });
  };

  const api = {
    load: (voiceId, onProgress) =>
      request({ type: 'load', voiceId }, { onProgress, timeoutMs: LOAD_TIMEOUT_MS }).then(() => undefined),
    synthesize: (voiceId, text) =>
      request({ type: 'synth', voiceId, text }, { timeoutMs: SYNTH_TIMEOUT_MS }).then(
        (msg) => new Blob([msg.audio], { type: msg.mime || 'audio/wav' }),
      ),
    dispose: () => kill(new Error('TTS engine disposed')),
  };
  return api;
}

function playBlobWithAudioElement(blob, { rate = 1, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = rate;
    audio.preservesPitch = true;
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      audio.onended = null;
      audio.onerror = null;
      URL.revokeObjectURL(url);
    };
    const onAbort = () => {
      audio.pause();
      cleanup();
      resolve();
    };
    signal?.addEventListener('abort', onAbort);
    audio.onended = () => {
      cleanup();
      resolve();
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error('Audio playback failed'));
    };
    audio.play().catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

function toSpeechLocale(lang) {
  const l = normalizeLanguage(lang);
  if (l === 'tr') return 'tr-TR';
  if (l === 'en') return 'en-US';
  return typeof lang === 'string' && lang !== 'auto' ? lang : '';
}

function speakWithSystemVoice(text, { lang, rate = 1, voiceURI, signal, onStart } = {}) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined' || !text) return Promise.resolve();
  if (signal?.aborted) return Promise.resolve();

  const locale = toSpeechLocale(lang);
  const voices = synth.getVoices?.() || [];
  let voice = voiceURI ? voices.find((v) => v.voiceURI === voiceURI) : null;
  if (!voice && locale) {
    const prefix = locale.slice(0, 2).toLowerCase();
    voice =
      voices.find((v) => v.lang?.toLowerCase().startsWith(prefix) && !v.name?.includes('Google')) ||
      voices.find((v) => v.lang?.toLowerCase().startsWith(prefix)) ||
      null;
  }

  // Chrome stops long utterances after ~15 s, so queue one per sentence.
  const parts = splitSentences(text);
  return new Promise((resolve) => {
    let remaining = parts.length;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = () => {
      synth.cancel();
      done();
    };
    signal?.addEventListener('abort', onAbort);
    parts.forEach((part, index) => {
      const u = new SpeechSynthesisUtterance(part);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else if (locale) {
        u.lang = locale;
      }
      u.rate = rate;
      if (index === 0) u.onstart = () => onStart?.();
      u.onend = () => {
        remaining -= 1;
        if (remaining <= 0) done();
      };
      u.onerror = done;
      synth.speak(u);
    });
  });
}

let engine = null;
let testHooks = null;
const loadPromises = new Map();
const loadedVoices = new Set();
let activeSession = null;

function getEngine() {
  if (testHooks?.engine) return testHooks.engine;
  if (!engine) engine = createWorkerEngine();
  return engine;
}

function runtimeEnv() {
  return testHooks?.env ?? globalThis;
}

function playBlob(blob, opts) {
  return (testHooks?.player ?? playBlobWithAudioElement)(blob, opts);
}

function systemSpeak(text, opts) {
  return (testHooks?.systemSpeak ?? speakWithSystemVoice)(text, opts);
}

/** Test-only: inject a fake engine/player/env. Pass null to reset. */
export function __setTtsTestHooks(hooks) {
  testHooks = hooks;
  loadPromises.clear();
  loadedVoices.clear();
  activeSession = null;
  status = IDLE_STATUS;
  listeners.clear();
}

function ensureVoiceLoaded(voiceId) {
  if (loadPromises.has(voiceId)) return loadPromises.get(voiceId);
  const alreadyLoaded = loadedVoices.has(voiceId);
  if (!alreadyLoaded) setStatus({ state: 'downloading', progress: 0, voiceId, error: null });
  const promise = getEngine()
    .load(voiceId, ({ loaded, total }) => {
      if (status.voiceId !== voiceId || status.state !== 'downloading') return;
      setStatus({ progress: total > 0 ? Math.min(1, loaded / total) : null });
    })
    .then(
      () => {
        loadedVoices.add(voiceId);
        if (status.voiceId === voiceId && status.state === 'downloading') {
          setStatus({ state: 'ready', progress: 1, error: null });
        }
      },
      (err) => {
        if (status.voiceId === voiceId && status.state === 'downloading') {
          setStatus({ state: 'error', progress: null, error: err?.message || String(err) });
        }
        throw err;
      },
    )
    .finally(() => {
      loadPromises.delete(voiceId);
    });
  loadPromises.set(voiceId, promise);
  return promise;
}

export function isVoiceLoaded(voiceId) {
  return loadedVoices.has(voiceId);
}

// The engine stores each model as OPFS file "piper/<voiceId>.onnx" (plus
// ".onnx.json"). Reading the directory directly avoids loading the engine.
async function getPiperCacheDir() {
  const storage = runtimeEnv().navigator?.storage;
  if (typeof storage?.getDirectory !== 'function') return null;
  const root = await storage.getDirectory();
  return root.getDirectoryHandle('piper', { create: true });
}

/** Ids of Piper voices whose model is already cached in this browser. */
export async function listCachedVoices() {
  try {
    const dir = await getPiperCacheDir();
    if (!dir) return [];
    const ids = [];
    for await (const name of dir.keys()) {
      if (!name.endsWith('.onnx')) continue;
      const id = name.slice(0, -'.onnx'.length);
      if (getPiperVoice(id)) ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

/** Delete a cached Piper model from this browser. */
export async function removeCachedVoice(voiceId) {
  const dir = await getPiperCacheDir();
  if (!dir || !getPiperVoice(voiceId)) return;
  for (const name of [`${voiceId}.onnx`, `${voiceId}.onnx.json`]) {
    try {
      await dir.removeEntry(name);
    } catch {
      // Not cached.
    }
  }
  loadedVoices.delete(voiceId);
}

/** Download (if needed) and initialise a Piper voice. Rejects if it cannot be loaded. */
export async function preloadVoice(voiceId) {
  if (shouldUseSystemVoice(voiceId, runtimeEnv())) return;
  try {
    await ensureVoiceLoaded(voiceId);
    if (!activeSession) setStatus({ state: 'ready', progress: 1, voiceId, error: null });
  } catch (err) {
    setStatus({ state: 'error', progress: null, voiceId, error: err?.message || String(err) });
    throw err;
  }
}

/** Stop any ongoing speech (neural or system). */
export function stopSpeaking() {
  const session = activeSession;
  activeSession = null;
  if (session) {
    session.controller.abort();
    session.finish();
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (session && status.state === 'speaking') {
    setStatus({ state: 'idle', progress: null });
  }
}

/**
 * Speak `text` with the given voice. Resolves when playback ends or is
 * stopped. Falls back to window.speechSynthesis for SYSTEM_VOICE, unsupported
 * environments and any engine error.
 *
 * Extra options beyond the core contract:
 *   lang            language hint for sanitising and the system voice
 *   systemVoiceURI  preferred speechSynthesis voice for the fallback
 */
export async function speak(text, { voiceId = SYSTEM_VOICE, rate = 1, onStart, onEnd, lang, systemVoiceURI } = {}) {
  stopSpeaking();

  const controller = new AbortController();
  const { signal } = controller;
  let started = false;
  let finished = false;
  const session = {
    controller,
    finish: () => {
      if (finished) return;
      finished = true;
      try {
        onEnd?.();
      } catch (err) {
        console.error('[tts] onEnd failed', err);
      }
    },
  };
  activeSession = session;

  const markStarted = (usedVoice) => {
    if (signal.aborted) return;
    setStatus({
      state: 'speaking',
      voiceId: usedVoice,
      progress: null,
      ...(usedVoice === SYSTEM_VOICE ? {} : { error: null }),
    });
    if (started) return;
    started = true;
    try {
      onStart?.();
    } catch (err) {
      console.error('[tts] onStart failed', err);
    }
  };

  const voice = getPiperVoice(voiceId);
  const language = lang && lang !== 'auto' ? lang : voice?.language || detectLanguage(text);
  const clean = sanitizeForSpeech(text, { language });
  const systemOpts = { lang: language, rate, voiceURI: systemVoiceURI, signal, onStart: () => markStarted(SYSTEM_VOICE) };

  try {
    if (!clean) return;

    if (shouldUseSystemVoice(voiceId, runtimeEnv())) {
      await systemSpeak(clean, systemOpts);
      return;
    }

    const chunks = splitSentences(clean);
    const eng = getEngine();
    let index = 0;
    try {
      await ensureVoiceLoaded(voiceId);
      if (signal.aborted) return;
      let next = eng.synthesize(voiceId, chunks[0]);
      for (index = 0; index < chunks.length; index++) {
        const blob = await next;
        if (signal.aborted) return;
        // Synthesize the following sentence while this one plays.
        next = index + 1 < chunks.length ? eng.synthesize(voiceId, chunks[index + 1]) : null;
        next?.catch(() => {});
        markStarted(voiceId);
        await playBlob(blob, { rate, signal });
        if (signal.aborted) return;
      }
    } catch (err) {
      if (signal.aborted) return;
      console.warn('[tts] Piper failed, falling back to system voice:', err);
      setStatus({ state: 'error', voiceId, progress: null, error: err?.message || String(err) });
      await systemSpeak(chunks.slice(index).join(' '), systemOpts);
    }
  } finally {
    if (activeSession === session) {
      activeSession = null;
      if (status.state === 'speaking') {
        setStatus({ state: 'idle', progress: null });
      }
    }
    session.finish();
  }
}
