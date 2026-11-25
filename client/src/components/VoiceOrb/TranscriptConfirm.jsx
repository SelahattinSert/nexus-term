import React, { useEffect, useRef, useState } from 'react';
import { Send, X, Wand2 } from 'lucide-react';

const AUTO_SEND_MS = 3000;

/**
 * Shows what the speech recognizer understood before it is sent to the assistant.
 * It sends itself after a short countdown unless the user starts editing; Enter sends, Esc cancels.
 */
export default function TranscriptConfirm({ transcript, onSend, onCancel }) {
  const [text, setText] = useState(transcript.text);
  const [editing, setEditing] = useState(false);
  const [remaining, setRemaining] = useState(AUTO_SEND_MS);
  const sentRef = useRef(false);

  const send = (value) => {
    if (sentRef.current) return;
    const clean = value.trim();
    if (!clean) return onCancel();
    sentRef.current = true;
    onSend(clean);
  };

  useEffect(() => {
    if (editing) return undefined;
    const started = Date.now();
    const timer = setInterval(() => {
      const left = AUTO_SEND_MS - (Date.now() - started);
      setRemaining(Math.max(0, left));
      if (left <= 0) {
        clearInterval(timer);
        send(text);
      }
    }, 100);
    return () => clearInterval(timer);
    // the countdown restarts only when editing toggles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  return (
    <div
      className="absolute bottom-28 left-1/2 -translate-x-1/2 w-80 md:w-[28rem] rounded-xl border shadow-2xl p-3 space-y-2 text-sm"
      style={{ backgroundColor: 'color-mix(in srgb, var(--ctp-mantle) 92%, transparent)', borderColor: 'color-mix(in srgb, var(--ctp-surface1) 60%, transparent)', color: 'var(--ctp-text)' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ctp-subtext0)' }}>I heard</div>
      <input
        value={text}
        onChange={(e) => { setText(e.target.value); setEditing(true); }}
        onFocus={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') send(text);
          if (e.key === 'Escape') onCancel();
        }}
        className="w-full rounded-lg px-3 py-2 outline-none border font-medium"
        style={{ backgroundColor: 'var(--ctp-base)', borderColor: 'var(--ctp-surface0)', color: 'var(--ctp-text)' }}
        aria-label="Recognized speech, editable"
      />
      {transcript.corrections?.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: 'var(--ctp-subtext0)' }}>
          <Wand2 size={12} style={{ color: 'var(--ctp-lavender)' }} />
          {transcript.corrections.slice(0, 5).map((c, i) => (
            <span key={i}><s>{c.from}</s> → <b style={{ color: 'var(--ctp-text)' }}>{c.to}</b></span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        {!editing && (
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--ctp-surface0)' }}>
            <div className="h-full motion-reduce:transition-none transition-[width] duration-100" style={{ width: `${(remaining / AUTO_SEND_MS) * 100}%`, backgroundColor: 'var(--ctp-blue)' }} />
          </div>
        )}
        {editing && <span className="flex-1 text-[11px]" style={{ color: 'var(--ctp-subtext0)' }}>Edit, then press Enter</span>}
        <button onClick={onCancel} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs border" style={{ borderColor: 'var(--ctp-surface0)', color: 'var(--ctp-subtext0)' }}>
          <X size={12} /> Cancel
        </button>
        <button onClick={() => send(text)} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold" style={{ backgroundColor: 'var(--ctp-blue)', color: 'var(--ctp-crust)' }}>
          <Send size={12} /> Send
        </button>
      </div>
    </div>
  );
}
