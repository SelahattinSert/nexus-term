import React from 'react';
import { useStore } from '../store';
import { AlertTriangle, X, Play, Wifi, WifiOff, KeyRound, ServerCrash } from 'lucide-react';

// Map error categories to icons and colors
const ERROR_STYLES = {
  NETWORK:    { icon: WifiOff,     color: 'text-ctp-peach',  label: 'Connection Issue' },
  AUTH:       { icon: KeyRound,    color: 'text-ctp-yellow', label: 'Authentication Error' },
  RATE_LIMIT: { icon: ServerCrash, color: 'text-ctp-maroon', label: 'Rate Limited' },
  SERVER:     { icon: ServerCrash, color: 'text-ctp-red',    label: 'Server Error' },
  DEFAULT:    { icon: AlertTriangle, color: 'text-ctp-red',  label: 'Error' },
};

function getErrorStyle(error) {
  if (error.category && ERROR_STYLES[error.category]) {
    return ERROR_STYLES[error.category];
  }
  return ERROR_STYLES.DEFAULT;
}

export default function ErrorOverlay({ sessionId }) {
  const allErrors = useStore(state => state.errors || []);
  const errors = allErrors.filter(e => e.sessionId === sessionId);
  const dismissError = useStore(state => state.dismissError);
  
  if (errors.length === 0) return null;

  const handleAction = (command) => {
    window.dispatchEvent(new CustomEvent(`NEXUS_ACTION_${sessionId}`, { detail: command }));
  };

  return (
    <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {errors.map((error) => {
        const style = getErrorStyle(error);
        const Icon = style.icon;

        return (
          <div
            key={error.id}
            className="glass-panel shadow-2xl p-3 pointer-events-auto flex flex-col animate-in fade-in slide-in-from-top-4"
          >
            <div className="flex justify-between items-start mb-1">
              <div className={`flex items-center gap-2 ${style.color} font-bold`}>
                <Icon size={16} />
                <span>{error.userMessage ? style.label : error.title}</span>
              </div>
              <button onClick={() => dismissError(error.id)} className="text-ctp-subtext0 hover:text-ctp-text transition-colors">
                <X size={16} />
              </button>
            </div>
            <p className="text-ctp-text text-sm mb-3">{error.userMessage || error.description}</p>
            
            {error.actions && error.actions.length > 0 && (
              <div className="flex flex-col gap-2">
                {error.actions.map((action, idx) => (
                  <button
                    key={action.command || idx}
                    onClick={() => {
                      handleAction(action.command);
                      dismissError(error.id);
                    }}
                    className="flex items-center justify-center gap-2 bg-ctp-surface0/50 hover:bg-ctp-surface1/50 text-ctp-text text-sm py-1.5 px-3 rounded-lg transition-colors backdrop-blur-sm"
                  >
                    <Play size={14} className="text-ctp-green" />
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
