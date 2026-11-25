import React, { useEffect, useState } from 'react';
import { Bot, Copy, Eye, EyeOff, RefreshCw, ShieldCheck, ShieldOff, CheckCircle2, XCircle, AlertTriangle, CircleDot } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '../../store';

const DECISION_STYLE = {
  allowed: { icon: CircleDot, color: 'text-ctp-subtext0', label: 'allowed' },
  approved: { icon: CheckCircle2, color: 'text-ctp-green', label: 'approved' },
  rejected: { icon: XCircle, color: 'text-ctp-red', label: 'rejected' },
  'denied-policy': { icon: ShieldOff, color: 'text-ctp-yellow', label: 'read-only' },
  error: { icon: AlertTriangle, color: 'text-ctp-peach', label: 'error' },
};

function CopyBlock({ label, value, secret, revealSecret }) {
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };
  // Show the snippet with the token masked unless the user chose to reveal it; copying always uses the real value
  const display = secret && !revealSecret ? value.split(secret).join('•'.repeat(12)) : value;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-ctp-subtext0">{label}</span>
        <button onClick={copy} className="p-1 rounded hover:bg-ctp-surface0 text-ctp-surface2 hover:text-ctp-text" title="Copy"><Copy size={12} /></button>
      </div>
      <pre className="text-[10px] font-mono bg-ctp-crust border border-ctp-surface0 rounded p-2 whitespace-pre-wrap break-all text-ctp-subtext1 max-h-28 overflow-auto">{display}</pre>
    </div>
  );
}

export default function AgentsPanel() {
  const isSidebarOpen = useStore(state => state.isSidebarOpen);
  const activeSidebarTab = useStore(state => state.activeSidebarTab);
  const agentInfo = useStore(state => state.agentInfo);
  const auditEntries = useStore(state => state.auditEntries);
  const pendingCount = useStore(state => state.serverApprovals.length);
  const fetchAgentInfo = useStore(state => state.fetchAgentInfo);
  const setAgentPolicy = useStore(state => state.setAgentPolicy);
  const rotateAgentToken = useStore(state => state.rotateAgentToken);
  const [showToken, setShowToken] = useState(false);
  const [setupTab, setSetupTab] = useState('claude');

  const isOpen = isSidebarOpen && activeSidebarTab === 'agents';

  useEffect(() => {
    if (isOpen) fetchAgentInfo().catch(() => toast.error('Could not load agent settings'));
  }, [isOpen, fetchAgentInfo]);

  if (!isOpen) return null;

  const policy = agentInfo?.policy || 'ask';
  const tabBtn = (id, label) => (
    <button
      onClick={() => setSetupTab(id)}
      className={`px-2 py-0.5 rounded text-[11px] ${setupTab === id ? 'bg-ctp-surface0 text-ctp-text' : 'text-ctp-subtext0 hover:text-ctp-text'}`}
    >{label}</button>
  );

  return (
    <div className="w-80 glass-panel-solid rounded-r-xl flex flex-col h-full text-sm shrink-0 shadow-lg">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-ctp-surface0">
        <Bot size={16} className="text-ctp-blue" />
        <h2 className="text-xs font-bold tracking-wide uppercase text-ctp-blue">Agents (MCP)</h2>
        {pendingCount > 0 && <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-ctp-red text-ctp-crust">{pendingCount} waiting</span>}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <p className="text-xs text-ctp-subtext0 leading-relaxed">
          AI agents (Claude Code, Codex, …) can use NexusTerm as their terminal. You see every command live,
          side effects wait for your approval here, and everything is written to the audit log.
        </p>

        <section className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase text-ctp-surface2">Permission mode</h3>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setAgentPolicy('ask').catch(() => toast.error('Could not change mode'))}
              className={`flex flex-col items-start gap-0.5 p-2 rounded-lg border text-left ${policy === 'ask' ? 'border-ctp-green bg-ctp-green/10' : 'border-ctp-surface0 hover:border-ctp-surface1'}`}
            >
              <span className="flex items-center gap-1 text-xs font-bold"><ShieldCheck size={12} className="text-ctp-green" /> Ask me</span>
              <span className="text-[10px] text-ctp-subtext0">Reads are free; commands, SSH and tunnels need approval</span>
            </button>
            <button
              onClick={() => setAgentPolicy('read-only').catch(() => toast.error('Could not change mode'))}
              className={`flex flex-col items-start gap-0.5 p-2 rounded-lg border text-left ${policy === 'read-only' ? 'border-ctp-yellow bg-ctp-yellow/10' : 'border-ctp-surface0 hover:border-ctp-surface1'}`}
            >
              <span className="flex items-center gap-1 text-xs font-bold"><ShieldOff size={12} className="text-ctp-yellow" /> Read-only</span>
              <span className="text-[10px] text-ctp-subtext0">Agents may only look: history, screens, git, ports</span>
            </button>
          </div>
        </section>

        {agentInfo && (
          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase text-ctp-surface2">Connect an agent</h3>
            <div className="flex gap-1">
              {tabBtn('claude', 'Claude Code')}
              {tabBtn('codex', 'Codex')}
              {tabBtn('json', 'Other (JSON)')}
            </div>
            {setupTab === 'claude' && (
              <>
                <CopyBlock label="Recommended (stdio, survives token changes)" value={agentInfo.setup.claudeCodeStdio} />
                <CopyBlock label="Or over HTTP" value={agentInfo.setup.claudeCode} secret={agentInfo.token} revealSecret={showToken} />
              </>
            )}
            {setupTab === 'codex' && <CopyBlock label="~/.codex/config.toml" value={agentInfo.setup.codex} />}
            {setupTab === 'json' && <CopyBlock label="mcpServers entry" value={agentInfo.setup.json} />}
            <p className="text-[10px] text-ctp-surface2">NexusTerm must be running with this window open for agents to work.</p>

            <div className="space-y-1">
              <div className="text-[11px] font-bold text-ctp-subtext0">Endpoint</div>
              <div className="text-[10px] font-mono text-ctp-subtext1 break-all">{agentInfo.mcpUrl}</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-ctp-subtext0">Access token</span>
                <div className="flex gap-0.5">
                  <button onClick={() => setShowToken(s => !s)} className="p-1 rounded hover:bg-ctp-surface0 text-ctp-surface2" title={showToken ? 'Hide' : 'Show'}>{showToken ? <EyeOff size={12} /> : <Eye size={12} />}</button>
                  <button onClick={async () => { await navigator.clipboard.writeText(agentInfo.token); toast.success('Token copied'); }} className="p-1 rounded hover:bg-ctp-surface0 text-ctp-surface2" title="Copy"><Copy size={12} /></button>
                  <button
                    onClick={() => rotateAgentToken().then(() => toast.success('New token created; reconnect HTTP agents')).catch(() => toast.error('Could not rotate token'))}
                    className="p-1 rounded hover:bg-ctp-surface0 text-ctp-surface2 hover:text-ctp-red"
                    title="Create a new token (disconnects agents using the old one)"
                  ><RefreshCw size={12} /></button>
                </div>
              </div>
              <div className="text-[10px] font-mono text-ctp-subtext1 break-all">{showToken ? agentInfo.token : '•'.repeat(24)}</div>
            </div>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase text-ctp-surface2">Audit log</h3>
          {auditEntries.length === 0 && <p className="text-xs text-ctp-surface2">No agent activity yet.</p>}
          <div className="space-y-1">
            {auditEntries.map(e => {
              const style = DECISION_STYLE[e.decision] || DECISION_STYLE.allowed;
              const Icon = style.icon;
              return (
                <div key={e.id} className="p-1.5 rounded border border-ctp-surface0 bg-ctp-crust/40">
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <Icon size={11} className={style.color} />
                    <span className={`font-bold ${style.color}`}>{style.label}</span>
                    <span className="text-ctp-subtext0 truncate">{e.client}</span>
                    <span className="text-ctp-surface2">· {e.tool}</span>
                    <span className="ml-auto text-ctp-surface2 shrink-0">{new Date(e.ts).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-[11px] font-mono text-ctp-text break-all line-clamp-2 mt-0.5" title={e.summary}>{e.summary}</div>
                  {(e.result?.exitCode !== undefined && e.result?.exitCode !== null) && (
                    <div className={`text-[10px] ${e.result.exitCode === 0 ? 'text-ctp-green' : 'text-ctp-red'}`}>exit {e.result.exitCode}{e.result.timedOut ? ' (timed out)' : ''}</div>
                  )}
                  {e.reason && <div className="text-[10px] text-ctp-subtext0 italic break-words">{e.reason}</div>}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
