import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PIPER_VOICES,
  SYSTEM_VOICE,
  defaultVoiceFor,
  shouldUseSystemVoice,
  sanitizeForSpeech,
  splitSentences,
  detectLanguage,
  speak,
  stopSpeaking,
  preloadVoice,
  subscribeTtsStatus,
  __setTtsTestHooks,
} from '../voice/tts';

const SUPPORTED_ENV = {
  Worker: function Worker() {},
  WebAssembly: {},
  navigator: { storage: { getDirectory: () => Promise.resolve({}) } },
};

const TR = 'tr_TR-fahrettin-medium';
const EN = 'en_US-kristin-medium';

describe('voice table', () => {
  it('has unique ids and the documented fields', () => {
    const ids = PIPER_VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of PIPER_VOICES) {
      expect(v.id).toMatch(/^[a-z]{2}_[A-Z]{2}-[a-z_]+-(x_low|low|medium|high)$/);
      expect(v.id.startsWith(v.language)).toBe(true);
      expect(typeof v.label).toBe('string');
      expect(v.quality).toBe(v.id.split('-').pop());
      expect(v.sizeHint).toMatch(/MB$/);
      expect(v.license).toBeTruthy();
    }
  });

  it('covers Turkish and English', () => {
    expect(PIPER_VOICES.some((v) => v.language === 'tr')).toBe(true);
    expect(PIPER_VOICES.some((v) => v.language === 'en')).toBe(true);
  });

  it('contains no non-commercial or research-only voices', () => {
    for (const v of PIPER_VOICES) {
      expect(v.license).not.toMatch(/\bNC\b|non-commercial|research/i);
      expect(v.id).not.toMatch(/dfki|ryan|hfc_|lessac/);
    }
  });
});

describe('defaultVoiceFor', () => {
  it('picks a voice of the requested language', () => {
    expect(defaultVoiceFor('tr')).toBe(TR);
    expect(defaultVoiceFor('en')).toBe(EN);
    expect(defaultVoiceFor('tr-TR')).toBe(TR);
    expect(defaultVoiceFor('EN_us')).toBe(EN);
  });

  it('follows the browser language for auto', () => {
    expect(defaultVoiceFor('auto', 'tr-TR')).toBe(TR);
    expect(defaultVoiceFor('auto', 'en-GB')).toBe(EN);
    expect(defaultVoiceFor('auto', 'de-DE')).toBe(EN);
    expect(defaultVoiceFor(undefined, 'tr')).toBe(TR);
  });

  it('uses the system voice for languages without a Piper voice', () => {
    expect(defaultVoiceFor('de')).toBe(SYSTEM_VOICE);
  });

  it('only returns ids that exist in the table', () => {
    for (const lang of ['tr', 'en']) {
      expect(PIPER_VOICES.some((v) => v.id === defaultVoiceFor(lang))).toBe(true);
    }
  });
});

describe('shouldUseSystemVoice', () => {
  it('is true for the system sentinel and unknown voices', () => {
    expect(shouldUseSystemVoice(SYSTEM_VOICE, SUPPORTED_ENV)).toBe(true);
    expect(shouldUseSystemVoice('', SUPPORTED_ENV)).toBe(true);
    expect(shouldUseSystemVoice('xx_XX-nobody-medium', SUPPORTED_ENV)).toBe(true);
  });

  it('is true when the runtime lacks Worker, WebAssembly or OPFS', () => {
    expect(shouldUseSystemVoice(TR, { ...SUPPORTED_ENV, Worker: undefined })).toBe(true);
    expect(shouldUseSystemVoice(TR, { ...SUPPORTED_ENV, WebAssembly: undefined })).toBe(true);
    expect(shouldUseSystemVoice(TR, { ...SUPPORTED_ENV, navigator: { storage: {} } })).toBe(true);
    expect(shouldUseSystemVoice(TR, null)).toBe(true);
  });

  it('is false for a known voice in a capable runtime', () => {
    expect(shouldUseSystemVoice(TR, SUPPORTED_ENV)).toBe(false);
    expect(shouldUseSystemVoice(EN, SUPPORTED_ENV)).toBe(false);
  });

  it('falls back in jsdom (no Worker)', () => {
    expect(shouldUseSystemVoice(TR)).toBe(true);
  });
});

describe('sanitizeForSpeech', () => {
  it('strips ANSI escape sequences', () => {
    expect(sanitizeForSpeech('\u001b[1;32mBuild passed\u001b[0m', { language: 'en' })).toBe('Build passed.');
    expect(sanitizeForSpeech('\u001b]0;title\u0007Done', { language: 'en' })).toBe('Done.');
  });

  it('replaces fenced code blocks with a short phrase', () => {
    const out = sanitizeForSpeech('Run this:\n```bash\nnpm install\nnpm test\n```\nThen restart.', { language: 'en' });
    expect(out).not.toMatch(/npm|```/);
    expect(out).toContain('Code block shown on screen');
    expect(out).toContain('Then restart.');
    expect(sanitizeForSpeech('Şunu çalıştır:\n```\nls\n```', { language: 'tr' })).toContain('Kod bloğu');
  });

  it('handles an unterminated code fence', () => {
    expect(sanitizeForSpeech('Here:\n```js\nconst a = 1;', { language: 'en' })).not.toContain('const');
  });

  it('keeps link text and reads URLs as host names', () => {
    expect(sanitizeForSpeech('See [the docs](https://example.com/a/b?c=1).', { language: 'en' })).toBe('See the docs.');
    const out = sanitizeForSpeech('Open https://www.github.com/user/repo/pull/12 now', { language: 'en' });
    expect(out).toBe('Open github.com now.');
    expect(out).not.toContain('/');
  });

  it('removes markdown syntax but keeps identifiers', () => {
    const md = '# Title\n- **bold** item\n- *italic* and `my_var_name`\n> quote';
    const out = sanitizeForSpeech(md, { language: 'en' });
    expect(out).not.toMatch(/[#*`>]/);
    expect(out).toContain('Title.');
    expect(out).toContain('bold item.');
    expect(out).toContain('italic and my_var_name.');
    expect(out).toContain('quote.');
  });

  it('flattens tables and drops HTML tags', () => {
    const out = sanitizeForSpeech('| a | b |\n|---|---|\n| 1 | 2 |\n<b>x</b>', { language: 'en' });
    expect(out).not.toMatch(/[|<>-]{2,}|<b>/);
    expect(out).toContain('a, b');
  });

  it('returns empty string for empty or markup-only input', () => {
    expect(sanitizeForSpeech('')).toBe('');
    expect(sanitizeForSpeech(null)).toBe('');
    expect(sanitizeForSpeech('\u001b[0m   \n\n')).toBe('');
  });
});

describe('detectLanguage', () => {
  it('detects Turkish letters', () => {
    expect(detectLanguage('Dosya kaydedildi, şimdi çalıştır')).toBe('tr');
    expect(detectLanguage('File saved')).toBe('en');
  });
});

describe('splitSentences', () => {
  it('splits on sentence punctuation', () => {
    expect(
      splitSentences('The build finished successfully. All tests passed without errors! Shall I deploy it to staging now?'),
    ).toEqual([
      'The build finished successfully.',
      'All tests passed without errors!',
      'Shall I deploy it to staging now?',
    ]);
  });

  it('merges very short fragments', () => {
    const parts = splitSentences('Okay. Done. The server restarted on port 3000 and is healthy.');
    expect(parts).toEqual(['Okay. Done. The server restarted on port 3000 and is healthy.']);
  });

  it('keeps decimals, versions and host names inside one sentence', () => {
    expect(splitSentences('Node 20.11 is installed and version 3.5 works fine.', { minLength: 0 })).toHaveLength(1);
    expect(splitSentences('Fetched it from example.com right now.', { minLength: 0 })).toHaveLength(1);
  });

  it('splits long sentences below maxLength', () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ') + '.';
    const parts = splitSentences(long, { maxLength: 100 });
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(100);
    expect(parts.join(' ')).toBe(long);
  });

  it('returns no chunks for empty text', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   ')).toEqual([]);
  });
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeEngine({ failLoad = false, failOnChunk = -1 } = {}) {
  const calls = [];
  const engine = {
    load: vi.fn(async (voiceId, onProgress) => {
      onProgress?.({ loaded: 50, total: 100 });
      if (failLoad) throw new Error('network down');
    }),
    synthesize: vi.fn(async (voiceId, text) => {
      const index = calls.length;
      calls.push(text);
      if (index === failOnChunk) throw new Error('inference failed');
      return { audioFor: text };
    }),
  };
  return { engine, calls };
}

describe('speak / preload with a mocked engine', () => {
  const LONG = 'The first sentence is here now. The second sentence follows it. And this is the third one.';
  let systemSpeak;
  let played;
  let player;

  beforeEach(() => {
    played = [];
    player = vi.fn(async (blob) => {
      played.push(blob.audioFor);
    });
    systemSpeak = vi.fn(async (text, opts) => {
      opts?.onStart?.();
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    __setTtsTestHooks(null);
    vi.restoreAllMocks();
  });

  it('plays sentences in order and prefetches the next one', async () => {
    const { engine } = makeEngine();
    let synthCallsAtFirstPlay = null;
    player = vi.fn(async (blob) => {
      if (synthCallsAtFirstPlay === null) synthCallsAtFirstPlay = engine.synthesize.mock.calls.length;
      played.push(blob.audioFor);
    });
    __setTtsTestHooks({ engine, player, systemSpeak, env: SUPPORTED_ENV });
    const onStart = vi.fn();
    const onEnd = vi.fn();

    await speak(LONG, { voiceId: EN, onStart, onEnd, rate: 1.2 });

    expect(played).toEqual(splitSentences(LONG));
    expect(played).toHaveLength(3);
    expect(synthCallsAtFirstPlay).toBe(2);
    expect(player.mock.calls[0][1].rate).toBe(1.2);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(systemSpeak).not.toHaveBeenCalled();
  });

  it('sanitises text before synthesis', async () => {
    const { engine, calls } = makeEngine();
    __setTtsTestHooks({ engine, player, systemSpeak, env: SUPPORTED_ENV });
    await speak('**Done**: see https://example.com/x/y', { voiceId: EN });
    expect(calls.join(' ')).toBe('Done: see example.com.');
  });

  it('uses the system voice for SYSTEM_VOICE without touching the engine', async () => {
    const { engine } = makeEngine();
    __setTtsTestHooks({ engine, player, systemSpeak, env: SUPPORTED_ENV });
    const onStart = vi.fn();
    const onEnd = vi.fn();
    await speak('Hello there, how are you?', { voiceId: SYSTEM_VOICE, onStart, onEnd, lang: 'en' });
    expect(engine.load).not.toHaveBeenCalled();
    expect(systemSpeak).toHaveBeenCalledWith('Hello there, how are you?', expect.objectContaining({ lang: 'en' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('falls back to the system voice when the runtime is unsupported', async () => {
    const { engine } = makeEngine();
    __setTtsTestHooks({ engine, player, systemSpeak, env: {} });
    await speak('Merhaba dünya.', { voiceId: TR });
    expect(engine.load).not.toHaveBeenCalled();
    expect(systemSpeak).toHaveBeenCalledWith('Merhaba dünya.', expect.objectContaining({ lang: 'tr' }));
  });

  it('falls back to the system voice with the whole text when loading fails', async () => {
    const { engine } = makeEngine({ failLoad: true });
    __setTtsTestHooks({ engine, player, systemSpeak, env: SUPPORTED_ENV });
    const statuses = [];
    subscribeTtsStatus((s) => statuses.push(s.state));
    const onEnd = vi.fn();
    await speak(LONG, { voiceId: EN, onEnd });
    expect(systemSpeak).toHaveBeenCalledWith(LONG, expect.anything());
    expect(played).toEqual([]);
    expect(statuses).toContain('downloading');
    expect(statuses).toContain('error');
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('speaks only the remaining sentences with the system voice after a mid-stream error', async () => {
    const { engine } = makeEngine({ failOnChunk: 1 });
    __setTtsTestHooks({ engine, player, systemSpeak, env: SUPPORTED_ENV });
    const parts = splitSentences(LONG);
    await speak(LONG, { voiceId: EN });
    expect(played).toEqual([parts[0]]);
    expect(systemSpeak).toHaveBeenCalledTimes(1);
    expect(systemSpeak.mock.calls[0][0]).toBe(parts.slice(1).join(' '));
  });

  it('stopSpeaking ends playback, resolves speak and calls onEnd once', async () => {
    const { engine } = makeEngine();
    const gate = deferred();
    player = vi.fn((blob, { signal }) => {
      played.push(blob.audioFor);
      return new Promise((resolve) => {
        signal.addEventListener('abort', resolve);
        gate.promise.then(resolve);
      });
    });
    __setTtsTestHooks({ engine, player, systemSpeak, env: SUPPORTED_ENV });
    const onEnd = vi.fn();
    const done = speak(LONG, { voiceId: EN, onEnd });
    await vi.waitFor(() => expect(played).toHaveLength(1));
    stopSpeaking();
    expect(onEnd).toHaveBeenCalledTimes(1);
    await done;
    expect(played).toHaveLength(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(systemSpeak).not.toHaveBeenCalled();
  });

  it('a new speak call interrupts the previous one', async () => {
    const { engine } = makeEngine();
    player = vi.fn((blob, { signal }) => {
      played.push(blob.audioFor);
      if (played.length > 1) return Promise.resolve();
      return new Promise((resolve) => signal.addEventListener('abort', resolve));
    });
    __setTtsTestHooks({ engine, player, systemSpeak, env: SUPPORTED_ENV });
    const firstEnd = vi.fn();
    const first = speak(LONG, { voiceId: EN, onEnd: firstEnd });
    await vi.waitFor(() => expect(played).toHaveLength(1));
    const second = speak('A completely different reply here.', { voiceId: EN });
    expect(firstEnd).toHaveBeenCalledTimes(1);
    await Promise.all([first, second]);
    expect(played).toEqual([splitSentences(LONG)[0], 'A completely different reply here.']);
  });

  it('does nothing for text that is empty after sanitising', async () => {
    const { engine } = makeEngine();
    __setTtsTestHooks({ engine, player, systemSpeak, env: SUPPORTED_ENV });
    const onStart = vi.fn();
    await speak('\u001b[0m', { voiceId: EN, onStart });
    expect(engine.synthesize).not.toHaveBeenCalled();
    expect(systemSpeak).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('preloadVoice reports download progress and ready', async () => {
    const { engine } = makeEngine();
    __setTtsTestHooks({ engine, player, systemSpeak, env: SUPPORTED_ENV });
    const statuses = [];
    const unsubscribe = subscribeTtsStatus((s) => statuses.push({ ...s }));
    await preloadVoice(TR);
    unsubscribe();
    expect(statuses[0].state).toBe('idle');
    expect(statuses.some((s) => s.state === 'downloading' && s.progress === 0.5 && s.voiceId === TR)).toBe(true);
    expect(statuses.at(-1)).toMatchObject({ state: 'ready', voiceId: TR, progress: 1 });
    expect(engine.load).toHaveBeenCalledTimes(1);
  });

  it('preloadVoice deduplicates concurrent loads and rejects on failure', async () => {
    const ok = makeEngine();
    __setTtsTestHooks({ engine: ok.engine, player, systemSpeak, env: SUPPORTED_ENV });
    await Promise.all([preloadVoice(EN), preloadVoice(EN)]);
    expect(ok.engine.load).toHaveBeenCalledTimes(1);

    const bad = makeEngine({ failLoad: true });
    __setTtsTestHooks({ engine: bad.engine, player, systemSpeak, env: SUPPORTED_ENV });
    const statuses = [];
    subscribeTtsStatus((s) => statuses.push(s));
    await expect(preloadVoice(EN)).rejects.toThrow('network down');
    expect(statuses.at(-1)).toMatchObject({ state: 'error', error: 'network down' });
  });

  it('preloadVoice is a no-op for the system voice', async () => {
    const { engine } = makeEngine();
    __setTtsTestHooks({ engine, player, systemSpeak, env: SUPPORTED_ENV });
    await preloadVoice(SYSTEM_VOICE);
    expect(engine.load).not.toHaveBeenCalled();
  });
});
