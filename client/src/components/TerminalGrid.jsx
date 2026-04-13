import React from 'react';
import { useStore } from '../store';
import NexusTerm from './NexusTerm';
import ErrorOverlay from './ErrorOverlay';

export default function TerminalGrid() {
  const { panes, focusedPane, setFocusedPane } = useStore();

  if (panes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-ctp-subtext0">
        No active terminals. Create one from the tab bar!
      </div>
    );
  }

  // Calculate grid layout based on number of panes
  const gridCols = panes.length === 1 ? 'grid-cols-1' : 'grid-cols-2';
  const gridRows = panes.length > 2 ? 'grid-rows-2' : 'grid-rows-1';

  return (
    <div className={`w-full h-full grid ${gridCols} ${gridRows} gap-1 bg-ctp-crust p-1`}>
      {panes.map((paneId) => (
        <div 
          key={paneId}
          onClickCapture={() => setFocusedPane(paneId)}
          className={`relative border ${focusedPane === paneId ? 'border-ctp-blue' : 'border-ctp-surface0'} bg-ctp-base overflow-hidden`}
        >
          <ErrorOverlay sessionId={paneId} />
          {/* Terminal Container - Absolute inset-0 forces strict height constraint for xterm.js fitAddon */}
          <div className="absolute inset-0 pl-2 pt-2">
            <NexusTerm sessionId={paneId} />
          </div>
        </div>
      ))}
    </div>
  );
}
