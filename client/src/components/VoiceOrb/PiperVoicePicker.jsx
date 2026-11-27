import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, Check, Loader2, Monitor, Play, Square, Trash2 } from 'lucide-react';
import {
  PIPER_VOICES,
  SAMPLE_TEXT,
  SYSTEM_VOICE,
  getTtsStatus,
  isVoiceLoaded,
  listCachedVoices,
  preloadVoice,
  removeCachedVoice,
  shouldUseSystemVoice,
  speak,
  stopSpeaking,
  subscribeTtsStatus,
} from '../../voice/tts';

const LANGUAGE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'tr', label: 'Türkçe' },
  { id: 'en', label: 'English' },
];

function cardStyle(selected) {
  return {
    borderColor: selected ? 'var(--ctp-blue)' : 'var(--ctp-surface0)',
    backgroundColor: selected
      ? 'color-mix(in srgb, var(--ctp-blue) 10%, transparent)'
      : 'color-mix(in srgb, var(--ctp-mantle) 40%, transparent)',
  };
}

function ProgressBar({ progress }) {
  const indeterminate = progress == null;
  return (
    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--ctp-surface0)' }}>
      <div
        className={`h-full rounded-full transition-[width] duration-200 ${indeterminate ? 'animate-pulse w-1/3' : ''}`}
        style={{
          backgroundColor: 'var(--ctp-blue)',
          ...(indeterminate ? {} : { width: `${Math.round(progress * 100)}%` }),
        }}
      />
    </div>
  );
}

function IconButton({ onClick, title, disabled, children, tone = 'blue' }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      aria-label={title}
      disabled={disabled}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        color: `var(--ctp-${tone})`,
        backgroundColor: `color-mix(in srgb, var(--ctp-${tone}) 12%, transparent)`,
      }}
    >
      {children}
    </button>
  );
}

/**
 * Settings UI for choosing the assistant's voice: local Piper neural voices
 * (downloaded on demand and cached in the browser) or the system voice.
 */
export default function PiperVoicePicker({ value, onChange, language = 'all' }) {
  const status = useSyncExternalStore(subscribeTtsStatus, getTtsStatus, getTtsStatus);
  const [filter, setFilter] = useState(language === 'tr' || language === 'en' ? language : 'all');
  const [cached, setCached] = useState(() => new Set());
  const [previewing, setPreviewing] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  const neuralSupported = useMemo(() => !shouldUseSystemVoice(PIPER_VOICES[0]?.id), []);
  const selected = value || SYSTEM_VOICE;

  const refreshCached = useCallback(() => {
    listCachedVoices().then((ids) => setCached(new Set(ids)));
  }, []);

  useEffect(() => {
    refreshCached();
  }, [refreshCached]);

  // Refresh the "downloaded" badges once a download finishes.
  useEffect(() => {
    if (status.state === 'ready') refreshCached();
  }, [status.state, refreshCached]);

  // Stop a running preview (but not unrelated assistant speech) on unmount.
  const previewingRef = useRef(null);
  useEffect(() => {
    previewingRef.current = previewing;
  }, [previewing]);
  useEffect(
    () => () => {
      if (previewingRef.current) stopSpeaking();
    },
    [],
  );

  const visibleVoices = PIPER_VOICES.filter((v) => filter === 'all' || v.language === filter);

  const handlePreview = async (voiceId, lang) => {
    if (previewing === voiceId) {
      stopSpeaking();
      setPreviewing(null);
      return;
    }
    setPreviewError(null);
    setPreviewing(voiceId);
    if (voiceId !== SYSTEM_VOICE) {
      try {
        await preloadVoice(voiceId);
      } catch (err) {
        setPreviewError({ voiceId, message: err?.message || String(err) });
        setPreviewing((cur) => (cur === voiceId ? null : cur));
        return;
      }
      refreshCached();
    }
    await speak(SAMPLE_TEXT[lang] || SAMPLE_TEXT.en, {
      voiceId,
      lang,
      onEnd: () => setPreviewing((cur) => (cur === voiceId ? null : cur)),
    });
  };

  const handleDelete = async (voiceId) => {
    if (previewing === voiceId) {
      stopSpeaking();
      setPreviewing(null);
    }
    await removeCachedVoice(voiceId);
    refreshCached();
  };

  const systemLang = filter === 'all' ? 'auto' : filter;

  return (
    <div className="space-y-3 text-ctp-text">
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: 'var(--ctp-surface0)' }}>
        {LANGUAGE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
            style={{
              backgroundColor: filter === f.id ? 'var(--ctp-base)' : 'transparent',
              color: filter === f.id ? 'var(--ctp-blue)' : 'var(--ctp-subtext0)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!neuralSupported && (
        <div
          className="flex items-start gap-2 text-xs rounded-xl px-3 py-2"
          style={{ color: 'var(--ctp-yellow)', backgroundColor: 'color-mix(in srgb, var(--ctp-yellow) 10%, transparent)' }}
        >
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          This browser cannot run local neural voices (needs Web Workers, WebAssembly and the Origin Private File
          System). The system voice will be used.
        </div>
      )}

      <div role="radiogroup" aria-label="Assistant voice" className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {visibleVoices.map((voice) => {
          const isSelected = selected === voice.id;
          const isDownloaded = cached.has(voice.id) || isVoiceLoaded(voice.id);
          const isDownloading = status.state === 'downloading' && status.voiceId === voice.id;
          const isPreviewing = previewing === voice.id;
          const error = previewError?.voiceId === voice.id ? previewError.message : null;
          return (
            <div
              key={voice.id}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onClick={() => onChange?.(voice.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange?.(voice.id);
                }
              }}
              className="rounded-xl border px-3 py-2.5 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ctp-blue"
              style={cardStyle(isSelected)}
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                  style={{ borderColor: isSelected ? 'var(--ctp-blue)' : 'var(--ctp-surface2)' }}
                >
                  {isSelected && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--ctp-blue)' }} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold truncate">{voice.label}</span>
                    <span className="text-[10px] uppercase tracking-wider text-ctp-subtext0">
                      {voice.language} · {voice.quality} · {voice.sizeHint}
                    </span>
                    {isDownloaded && (
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: 'var(--ctp-green)' }}>
                        <Check size={11} /> downloaded
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-ctp-subtext0 mt-0.5">License: {voice.license}</div>
                  {voice.caveat && (
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--ctp-yellow)' }}>
                      {voice.caveat}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <IconButton
                    onClick={() => handlePreview(voice.id, voice.language)}
                    title={isPreviewing ? 'Stop preview' : isDownloaded ? 'Preview' : `Download (${voice.sizeHint}) and preview`}
                    disabled={!neuralSupported || (isDownloading && !isPreviewing)}
                  >
                    {isDownloading ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : isPreviewing ? (
                      <Square size={13} />
                    ) : (
                      <Play size={13} />
                    )}
                    {isPreviewing && !isDownloading ? 'Stop' : 'Preview'}
                  </IconButton>
                  {isDownloaded && (
                    <IconButton onClick={() => handleDelete(voice.id)} title="Delete downloaded model" tone="red">
                      <Trash2 size={13} />
                    </IconButton>
                  )}
                </div>
              </div>
              {isDownloading && (
                <div className="mt-2 space-y-1">
                  <ProgressBar progress={status.progress} />
                  <div className="text-[10px] text-ctp-subtext0">
                    Downloading voice model{status.progress != null ? ` · ${Math.round(status.progress * 100)}%` : '…'}
                  </div>
                </div>
              )}
              {error && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px]" style={{ color: 'var(--ctp-red)' }}>
                  <AlertTriangle size={12} /> Could not load this voice: {error}
                </div>
              )}
            </div>
          );
        })}

        <div
          role="radio"
          aria-checked={selected === SYSTEM_VOICE}
          tabIndex={0}
          onClick={() => onChange?.(SYSTEM_VOICE)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onChange?.(SYSTEM_VOICE);
            }
          }}
          className="rounded-xl border px-3 py-2.5 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ctp-blue"
          style={cardStyle(selected === SYSTEM_VOICE)}
        >
          <div className="flex items-center gap-3">
            <span
              className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
              style={{ borderColor: selected === SYSTEM_VOICE ? 'var(--ctp-blue)' : 'var(--ctp-surface2)' }}
            >
              {selected === SYSTEM_VOICE && (
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--ctp-blue)' }} />
              )}
            </span>
            <Monitor size={15} className="text-ctp-subtext0 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Use system voice instead</div>
              <div className="text-[11px] text-ctp-subtext0">
                Your browser or OS voice. No download, but usually sounds robotic.
              </div>
            </div>
            <IconButton
              onClick={() => handlePreview(SYSTEM_VOICE, systemLang === 'auto' ? 'en' : systemLang)}
              title={previewing === SYSTEM_VOICE ? 'Stop preview' : 'Preview'}
            >
              {previewing === SYSTEM_VOICE ? <Square size={13} /> : <Play size={13} />}
              {previewing === SYSTEM_VOICE ? 'Stop' : 'Preview'}
            </IconButton>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-ctp-subtext0 ml-1">
        Neural voices are Piper models that run locally in your browser. Each is downloaded once from Hugging Face
        and cached; if a voice fails to load, the system voice is used automatically.
      </p>
    </div>
  );
}
