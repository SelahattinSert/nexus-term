import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Plus, X, Sidebar, ChevronDown } from 'lucide-react';

export default function TabBar() {
  const { sessions, panes, focusedPane, setFocusedPane, createSession, removeSession, swapPane, addPane } = useStore();
  const [availableShells, setAvailableShells] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return;

    fetch(`/api/shells?token=${token}`)
      .then(res => res.json())
      .then(data => setAvailableShells(data.shells || []))
      .catch(err => console.error("Failed to fetch shells", err));
  }, []);

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
      
      <div className="flex relative items-center h-full">
        <button 
          onClick={() => createSession()}
          className="h-full px-3 text-ctp-subtext0 hover:text-ctp-text hover:bg-ctp-mantle flex items-center justify-center"
          title="New Terminal"
        >
          <Plus size={18} />
        </button>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="h-full px-2 text-ctp-subtext0 hover:text-ctp-text hover:bg-ctp-mantle flex items-center justify-center border-l border-ctp-surface0"
          title="Select Shell"
        >
          <ChevronDown size={14} />
        </button>
        
        {isDropdownOpen && (
          <div className="absolute top-full right-0 mt-1 w-48 bg-ctp-mantle border border-ctp-surface0 rounded shadow-lg z-50">
            {availableShells.map(shell => (
              <div 
                key={shell.path}
                className="px-3 py-2 text-sm text-ctp-text hover:bg-ctp-surface0 cursor-pointer"
                onClick={() => {
                  createSession({ shellPath: shell.path });
                  setIsDropdownOpen(false);
                }}
              >
                {shell.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
