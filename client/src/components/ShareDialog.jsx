import React, { useEffect, useState } from 'react';
import { Radio, Copy, X, Keyboard, KeyboardOff, Globe, AlertTriangle, StopCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '../store';

const DURATIONS = [
  { label: '30 min', value: 30 },
  { label: '2 hours', value: 120 },
  { label: '8 hours', value: 480 },
];

function shareUrl(base, token) {
  return `${base.replace(/\/$/, '')}/share/${token}`;
}

export default function ShareDialog() {
  const sessionId = useStore(state => state.shareDialogSessionId);
  const session = useStore(state => state.sessions.find(s => s.id === state.shareDialogSessionId));
  const share = useStore(state => state.shares[state.shareDialogSessionId]);
  const network = useStore(state => state.shareNetwork);
  const closeShareDialog = useStore(state => state.closeShareDialog);
  const createShare = useStore(state => state.createShare);
  const endShare = useStore(state => state.endShare);
  const setShareController = useStore(state => state.setShareController);
  const fetchShareNetwork = useStore(state => state.fetchShareNetwork);
  const openPublicShare = useStore(state => state.openPublicShare);
  const stopPublicShare = useStore(state => state.stopPublicShare);
  const [ttl, setTtl] = useState(120);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sessionId) fetchShareNetwork().catch(() => {});
  }, [sessionId, fetchShareNetwork]);

  if (!sessionId) return null;

  const copy = async (url) => {
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  };

  const start = async () => {
    setBusy(true);
    try {
      const s = await createShare(sessionId, ttl);
      await navigator.clipboard.writeText(shareUrl(window.location.origin, s.token)).catch(() => {});
      toast.success('Sharing started — link copied');
    } catch (err) {
      toast.error(err.message || 'Could not start sharing');
    } finally {
      setBusy(false);
    }
  };

  const goPublic = async () => {
    setBusy(true);
    try {
      await openPublicShare();
      toast.success('Public link ready');
    } catch (err) {
      toast.error(err.message || 'Could not open a public link');
    } finally {
      setBusy(false);
    }
  };

  const links = share ? [
    { label: 'This computer', url: shareUrl(window.location.origin, share.token) },
    ...(network?.lanUrls || []).map(u => ({ label: 'Local network', url: shareUrl(u, share.token) })),
    ...(network?.publicUrl ? [{ label: 'Internet (tunnel)', url: shareUrl(network.publicUrl, share.token), public: true }] : []),
  ] : [];

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center p-4" style={{ backgroundColor: 'color-mix(in srgb, var(--ctp-crust) 60%, transparent)' }} onClick={closeShareDialog}>
      <div className="w-full max-w-lg rounded-2xl border border-ctp-surface0 bg-ctp-mantle text-ctp-text shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-ctp-surface0">
          <Radio size={16} className={share ? 'text-ctp-red animate-pulse' : 'text-ctp-subtext0'} />
          <h2 className="text-sm font-bold">Live share · {session?.name || 'Terminal'}</h2>
          <button onClick={closeShareDialog} className="ml-auto p-1 rounded hover:bg-ctp-surface0 text-ctp-subtext0"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4 text-sm">
          {!share ? (
            <>
              <p className="text-ctp-subtext0">
                Anyone with the link can <b className="text-ctp-text">watch</b> this terminal live: what is on screen right now and
                everything that happens while sharing (earlier, scrolled-away output is not shared). Nobody can type unless you hand
                them control. You can stop sharing at any time.
              </p>
              <div className="flex gap-1.5">
                {DURATIONS.map(d => (
                  <button key={d.value} onClick={() => setTtl(d.value)}
                    className={`px-3 py-1 rounded-full text-xs border ${ttl === d.value ? 'border-ctp-blue text-ctp-blue' : 'border-ctp-surface0 text-ctp-subtext0'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
              <button disabled={busy} onClick={start} className="w-full py-2 rounded-xl bg-ctp-red text-ctp-crust font-bold disabled:opacity-60 flex items-center justify-center gap-2">
                <Radio size={14} /> Start sharing
              </button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                {links.map(l => (
                  <div key={l.url} className="space-y-1">
                    <div className="text-[11px] font-bold text-ctp-subtext0">{l.label}</div>
                    <div className="flex gap-1.5">
                      <input readOnly value={l.url} onFocus={(e) => e.target.select()}
                        className="flex-1 min-w-0 font-mono text-[11px] bg-ctp-crust border border-ctp-surface0 rounded px-2 py-1.5" />
                      <button onClick={() => copy(l.url)} className="px-2 rounded border border-ctp-surface0 hover:bg-ctp-surface0" title="Copy"><Copy size={13} /></button>
                    </div>
                  </div>
                ))}
                {network?.loopbackOnly && !network?.publicUrl && (
                  <div className="flex gap-2 text-[11px] text-ctp-yellow">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>NexusTerm only listens on this computer. For teammates on your network start it with <code>HOST=0.0.0.0</code>, or create an internet link below.</span>
                  </div>
                )}
                {network?.publicUrl && (
                  <button onClick={() => stopPublicShare().then(() => toast.success('Internet link closed'))} className="flex items-center gap-1.5 text-xs text-ctp-red hover:underline">
                    <Globe size={13} /> Close the internet link (it also closes when sharing stops)
                  </button>
                )}
                {!network?.publicUrl && (
                  network?.tunnelProviders?.length ? (
                    <button disabled={busy} onClick={goPublic} className="flex items-center gap-1.5 text-xs text-ctp-blue hover:underline disabled:opacity-60">
                      <Globe size={13} /> Create an internet link ({network.tunnelProviders[0]})
                    </button>
                  ) : (
                    <p className="text-[11px] text-ctp-surface2 flex items-center gap-1.5"><Globe size={12} /> Install cloudflared or ngrok to share over the internet.</p>
                  )
                )}
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase text-ctp-surface2">Viewers ({share.guests?.length || 0})</div>
                {(!share.guests || share.guests.length === 0) && <p className="text-xs text-ctp-surface2">Nobody has joined yet.</p>}
                {(share.guests || []).map(g => {
                  const color = `var(${g.color}, var(--ctp-blue))`;
                  const hasControl = share.controllerId === g.id;
                  return (
                    <div key={g.id} className="flex items-center gap-2 p-1.5 rounded-lg border border-ctp-surface0">
                      <span className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold border-2" style={{ borderColor: color, color }}>{g.name.slice(0, 2).toUpperCase()}</span>
                      <span className="text-xs flex-1 truncate">{g.name}</span>
                      {g.wantsControl && !hasControl && <span className="text-[10px] text-ctp-yellow">wants control</span>}
                      {hasControl ? (
                        <button onClick={() => setShareController(share.id, null)} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-ctp-green text-ctp-crust font-bold">
                          <KeyboardOff size={12} /> Take back
                        </button>
                      ) : (
                        <button onClick={() => setShareController(share.id, g.id)} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-ctp-surface0 hover:bg-ctp-surface0">
                          <Keyboard size={12} /> Give control
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[11px] text-ctp-surface2">
                <span>Link expires at {new Date(share.expiresAt).toLocaleTimeString()}</span>
                <button onClick={() => endShare(share.id).then(() => toast.success('Sharing stopped'))}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-ctp-red text-ctp-crust">
                  <StopCircle size={13} /> Stop sharing
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
