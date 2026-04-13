import React from 'react';
import { useStore } from '../store';
import { Plus, X, Sidebar } from 'lucide-react';

export default function TabBar() {
  const { sessions, panes, focusedPane, setFocusedPane, createSession, removeSession, swapPane, addPane } = useStore();

  const handleTabClick = (session) => {
    const isVisible = panes.includes(session.id);
    if (isVisible) {
      setFocusedPane(session.id);
    } else {
      // Tab Swapping Logic
      const focusedIndex = panes.indexOf(focusedPane);
      if (focusedIndex !== -1) {
        swapPane(focusedIndex, session.id);
      } else if (panes.length < 4) {
        addPane(session.id);
      } else {
        swapPane(0, session.id);
      }
    }
  };

  return (
    <div className="flex bg-ctp-crust h-10 items-center overflow-x-auto no-scrollbar border-b border-ctp-surface0 shrink-0 pl-2">
      {sessions.map((session) => {
        const isVisible = panes.includes(session.id);
        const isFocused = focusedPane === session.id;
        const folderName = session.pwd.split(/[/\\]/).pop() || '~';

        return (
          <div 
            key={session.id}
            onClick={() => handleTabClick(session)}
            className={`
              flex items-center h-full px-4 gap-2 border-r border-ctp-surface0 cursor-pointer min-w-[120px] max-w-[200px] select-none
              ${isFocused ? 'bg-ctp-base text-ctp-text border-t-2 border-t-ctp-blue' : 'text-ctp-subtext0 hover:bg-ctp-mantle border-t-2 border-t-transparent'}
            `}
          >
            <span className="truncate text-sm flex-1">{folderName}</span>
            {!isVisible && <span className="w-2 h-2 rounded-full bg-ctp-red shrink-0" title="Running in background"></span>}
            <button 
              onClick={(e) => { e.stopPropagation(); removeSession(session.id); }}
              className="p-1 hover:bg-ctp-surface0 rounded opacity-60 hover:opacity-100"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
      
      <button 
        onClick={() => createSession()}
        className="h-full px-4 text-ctp-subtext0 hover:text-ctp-text hover:bg-ctp-mantle flex items-center justify-center"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}
