import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { ShieldAlert, Check, X, MessageSquareWarning, Bot } from 'lucide-react';

const RISK_LABELS = {
  execute: { label: 'Runs a command on this machine', color: 'var(--ctp-peach)' },
  remote: { label: 'Uses an SSH connection (remote server)', color: 'var(--ctp-red)' },
  network: { label: 'Exposes this machine to the internet', color: 'var(--ctp-red)' },
  'control-foreign': { label: 'Interrupts a terminal it did not open', color: 'var(--ctp-yellow)' },
  'read-private': { label: 'Reads your terminal output (may contain secrets) — once per connection', color: 'var(--ctp-yellow)' },
};
import { motion as Motion, AnimatePresence } from 'framer-motion';

export default function ApprovalModal() {
  const localCommand = useStore(state => state.pendingCommand);
  const clearPendingCommand = useStore(state => state.clearPendingCommand);
  const serverApprovals = useStore(state => state.serverApprovals);
  const answerServerApproval = useStore(state => state.answerServerApproval);

  // Local (voice assistant) requests first, then requests from MCP agents in arrival order
  const serverRequest = !localCommand ? serverApprovals[0] : null;
  const pendingCommand = localCommand || (serverRequest && {
    command: serverRequest.command || serverRequest.title,
    actionId: serverRequest.id,
    server: serverRequest,
  });
  const [feedbackMode, setFeedbackMode] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');

  // Reset state when a new command arrives
  const pendingId = pendingCommand?.actionId;
  useEffect(() => {
    if (pendingId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFeedbackMode(false);
      setFeedbackText('');
    }
  }, [pendingId]);

  if (!pendingCommand) return null;

  const server = pendingCommand.server;

  const answer = (approved, reason) => {
    if (server) {
      answerServerApproval(server.id, approved, reason);
      return true;
    }
    return false;
  };

  const handleApprove = () => {
    if (answer(true)) return;
    // Tell the backend to proceed
    window.dispatchEvent(new CustomEvent('nexus-agent-approval', { 
      detail: { 
        approved: true, 
        actionId: pendingCommand.actionId,
        sessionId: pendingCommand.sessionId,
        command: pendingCommand.command
      } 
    }));
    clearPendingCommand();
  };

  const handleReject = () => {
    if (answer(false, 'User rejected the command.')) return;
    // Tell the backend it was rejected
    window.dispatchEvent(new CustomEvent('nexus-agent-approval', { 
      detail: { 
        approved: false, 
        reason: "User rejected the command.",
        actionId: pendingCommand.actionId,
        sessionId: pendingCommand.sessionId
      } 
    }));
    clearPendingCommand();
  };

  const handleFeedbackSubmit = (e) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;
    if (answer(false, `User rejected the command. Feedback: "${feedbackText}"`)) return;
    
    // Tell the backend it was rejected with specific feedback to correct course
    window.dispatchEvent(new CustomEvent('nexus-agent-approval', { 
      detail: { 
        approved: false, 
        reason: `User rejected the command. Feedback: "${feedbackText}"`,
        actionId: pendingCommand.actionId,
        sessionId: pendingCommand.sessionId
      } 
    }));
    clearPendingCommand();
  };

  return (
    <div className="fixed bottom-36 left-1/2 -translate-x-1/2 z-[110] flex items-center justify-center">
      <AnimatePresence>
        <Motion.div 
          initial={{ opacity: 0, y: 20, scale: 0.95 }} 
          animate={{ opacity: 1, y: 0, scale: 1 }} 
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          className="w-full max-w-md shadow-2xl rounded-2xl overflow-hidden text-ctp-text flex flex-col border"
          style={{ 
            backgroundColor: 'color-mix(in srgb, var(--ctp-mantle) 95%, transparent)',
            backdropFilter: 'blur(16px)',
            borderColor: 'color-mix(in srgb, var(--ctp-red) 50%, transparent)'
          }}
        >
          <div className="p-4 border-b flex items-center gap-3" style={{ borderColor: 'color-mix(in srgb, var(--ctp-surface0) 50%, transparent)', backgroundColor: 'color-mix(in srgb, var(--ctp-crust) 50%, transparent)' }}>
            <ShieldAlert size={20} className="text-ctp-red animate-pulse" />
            <h2 className="text-sm font-bold text-ctp-red">Permission Required</h2>
          </div>

          <div className="p-5">
            {server ? (
              <div className="mb-3 space-y-1.5">
                <p className="text-sm text-ctp-subtext0 flex items-center gap-1.5">
                  <Bot size={14} className="text-ctp-lavender" />
                  <span className="font-bold text-ctp-text">{server.client}</span> wants to: {server.title}
                </p>
                {RISK_LABELS[server.risk] && (
                  <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border" style={{ color: RISK_LABELS[server.risk].color, borderColor: RISK_LABELS[server.risk].color }}>
                    {RISK_LABELS[server.risk].label}
                  </span>
                )}
                {server.details?.reason && <p className="text-xs text-ctp-subtext0 italic">“{server.details.reason}”</p>}
              </div>
            ) : (
              <p className="text-sm text-ctp-subtext0 mb-3">The assistant wants to execute the following command:</p>
            )}
            {(!server || server.command) && (
              <div className="bg-ctp-crust p-3 rounded-lg border border-ctp-surface0 font-mono text-sm break-all whitespace-pre-wrap text-ctp-green shadow-inner max-h-48 overflow-auto">
                {pendingCommand.command}
              </div>
            )}
            {pendingCommand.command && pendingCommand.command.includes('\n') && (
              <p className="text-[11px] text-ctp-yellow mt-1">{pendingCommand.command.split('\n').length} lines — scroll to review all of them</p>
            )}
            {server && serverApprovals.length > 1 && (
              <p className="text-[11px] text-ctp-surface2 mt-2">{serverApprovals.length - 1} more request(s) waiting</p>
            )}

            {feedbackMode ? (
              <form onSubmit={handleFeedbackSubmit} className="mt-5 animate-in slide-in-from-top-2">
                <p className="text-xs font-bold text-ctp-surface2 uppercase mb-2">Why are you rejecting this?</p>
                <input 
                  type="text" 
                  value={feedbackText} 
                  onChange={e => setFeedbackText(e.target.value)} 
                  placeholder="e.g., Use yarn instead of npm..." 
                  autoFocus
                  className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-ctp-red"
                  style={{ borderColor: 'var(--ctp-surface0)', backgroundColor: 'var(--ctp-base)', color: 'var(--ctp-text)' }} 
                />
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => setFeedbackMode(false)} className="flex-1 py-2 rounded-lg text-sm font-bold text-ctp-subtext0 hover:bg-ctp-surface0 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 py-2 rounded-lg text-sm font-bold bg-ctp-red text-ctp-crust hover:opacity-90 transition-opacity">
                    Send Feedback
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex gap-2 mt-5">
                <button 
                  onClick={handleApprove}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-ctp-green text-ctp-crust hover:opacity-90 transition-opacity shadow-lg"
                >
                  <Check size={16} /> Approve
                </button>
                <button 
                  onClick={handleReject}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border hover:bg-ctp-surface0 transition-colors"
                  style={{ borderColor: 'var(--ctp-surface0)', color: 'var(--ctp-subtext0)' }}
                >
                  <X size={16} /> Reject
                </button>
                <button 
                  onClick={() => setFeedbackMode(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border hover:bg-ctp-red/10 hover:text-ctp-red hover:border-ctp-red/30 transition-colors"
                  style={{ borderColor: 'var(--ctp-surface0)', color: 'var(--ctp-text)' }}
                >
                  <MessageSquareWarning size={16} /> Feedback
                </button>
              </div>
            )}
          </div>
        </Motion.div>
      </AnimatePresence>
    </div>
  );
}
