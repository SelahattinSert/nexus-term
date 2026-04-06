import React from 'react';
import { useStore } from '../store';
import { AlertTriangle, X, Play } from 'lucide-react';

export default function ErrorOverlay({ sessionId }) {
  const allErrors = useStore(state => state.errors || []);
  const errors = allErrors.filter(e => e.sessionId === sessionId);
  const dismissError = useStore(state => state.dismissError);
  
  if (errors.length === 0) return null;

  const handleAction = (command) => {
    // Send the action to the terminal via WebSocket
    // Since we don't have direct access to the ws instance here, we will dispatch a custom event
    // and let NexusTerm catch it and send it.
    window.dispatchEvent(new CustomEvent(`NEXUS_ACTION_${sessionId}`, { detail: command }));
  };

  return (
    <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {errors.map((error) => (
        <div key={error.id} className="bg-[#1e1e2e] border border-[#f38ba8] rounded-md shadow-lg p-3 pointer-events-auto flex flex-col animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-start mb-1">
            <div className="flex items-center gap-2 text-[#f38ba8] font-bold">
              <AlertTriangle size={16} />
              <span>{error.title}</span>
            </div>
            <button onClick={() => dismissError(error.id)} className="text-[#a6adc8] hover:text-[#cdd6f4]">
              <X size={16} />
            </button>
          </div>
          <p className="text-[#cdd6f4] text-sm mb-3">{error.description}</p>
          
          {error.actions && error.actions.length > 0 && (
            <div className="flex flex-col gap-2">
              {error.actions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    handleAction(action.command);
                    dismissError(error.id);
                  }}
                  className="flex items-center justify-center gap-2 bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] text-sm py-1.5 px-3 rounded transition-colors"
                >
                  <Play size={14} className="text-[#a6e3a1]" />
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
