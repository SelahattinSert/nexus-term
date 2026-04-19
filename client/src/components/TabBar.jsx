import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Plus, X, ChevronDown, Terminal } from 'lucide-react';

export default function TabBar() {
  const { sessions, editors = [], panes, focusedPane, setFocusedPane, createSession, removeSession, removeEditor, swapPane, addPane } = useStore();
  const [availableShells, setAvailableShells] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return;

    fetch(`/api/shells?token=${token}`)
      .then(res => res.json())
      .then(data => setAvailableShells(data.shells || []))
      .catch(err => console.error("Failed to fetch shells", err));
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  const handleTabClick = (session) => {
    const isVisible = panes.includes(session.id);
    if (isVisible) {
      setFocusedPane(session.id);
    } else {
      // If grid is full (4 panes), swap the focused pane; otherwise add to grid
      const focusedIndex = panes.indexOf(focusedPane);
      if (panes.length >= 4 && focusedIndex !== -1) {
        swapPane(focusedIndex, session.id);
      } else if (panes.length < 4) {
        addPane(session.id);
        setFocusedPane(session.id);
      } else {
        swapPane(0, session.id);
      }
    }
  };

  const allTabs = [
    ...sessions.map(s => ({ ...s, type: 'terminal', title: s.pwd.split(/[/\\]/).pop() || '~' })),
    ...editors.map(e => ({ ...e, type: 'editor', title: e.path.split(/[/\\]/).pop() + (e.isDirty ? ' •' : '') }))
  ];

  return (
    <div className="flex bg-ctp-crust h-10 items-center border-b border-ctp-surface0 shrink-0">
      {/* Scrollable tab area - no flex-1, min-w-0 allows shrinking when many tabs exist */}
      <div className="flex items-center h-full overflow-x-auto no-scrollbar pl-2 min-w-0">
        {allTabs.map((tab) => {
          const isVisible = panes.includes(tab.id);
          const isFocused = focusedPane === tab.id;

          return (
            <div 
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              className={`
                flex items-center h-full px-4 gap-2 border-r border-ctp-surface0 cursor-pointer min-w-[120px] max-w-[200px] select-none shrink-0
                ${isFocused ? 'bg-ctp-base text-ctp-text border-t-2 border-t-ctp-blue' : 'text-ctp-subtext0 hover:bg-ctp-mantle border-t-2 border-t-transparent'}
              `}
            >
              <span className="truncate text-sm flex-1 font-mono">{tab.title}</span>
              {!isVisible && <span className="w-2 h-2 rounded-full bg-ctp-red shrink-0" title="Running in background"></span>}
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  tab.type === 'terminal' ? removeSession(tab.id) : removeEditor(tab.id); 
                }}
                className="p-1 hover:bg-ctp-surface0 rounded opacity-60 hover:opacity-100"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Fixed action buttons - sits directly next to the last tab */}
      <div className="flex items-center h-full shrink-0 relative" ref={dropdownRef}>
        <button 
          onClick={() => createSession()}
          className="h-full px-3 text-ctp-subtext0 hover:text-ctp-text hover:bg-ctp-mantle flex items-center justify-center border-r border-ctp-surface0"
          title="New Terminal"
        >
          <Plus size={18} />
        </button>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="h-full px-2 text-ctp-subtext0 hover:text-ctp-text hover:bg-ctp-mantle flex items-center justify-center"
          title="Select Shell"
        >
          <ChevronDown size={14} />
        </button>
        
        {isDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-ctp-mantle border border-ctp-surface0 rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-ctp-subtext0 border-b border-ctp-surface0">
              Select Shell
            </div>
            {availableShells.length > 0 ? (
              availableShells.map(shell => (
                <div 
                  key={shell.path}
                  className="px-3 py-2 text-sm text-ctp-text hover:bg-ctp-surface0 cursor-pointer flex items-center gap-2 transition-colors"
                  onClick={() => {
                    createSession({ shellPath: shell.path });
                    setIsDropdownOpen(false);
                  }}
                >
                  <Terminal size={14} className="text-ctp-blue shrink-0" />
                  <span>{shell.name}</span>
                </div>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-ctp-subtext0 italic">
                No shells detected
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
