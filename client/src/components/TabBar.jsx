import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Plus, X, ChevronDown, Terminal, TerminalSquare, FileCode, Server } from 'lucide-react';

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

  const handleTabClick = (id) => {
    const isVisible = panes.includes(id);
    if (isVisible) {
      setFocusedPane(id);
    } else {
      // If grid is full (4 panes), swap the focused pane; otherwise add to grid
      const focusedIndex = panes.indexOf(focusedPane);
      if (panes.length >= 4 && focusedIndex !== -1) {
        swapPane(focusedIndex, id);
      } else if (panes.length < 4) {
        addPane(id);
        setFocusedPane(id);
      } else {
        swapPane(0, id);
      }
    }
  };

  const allTabs = [...sessions, ...editors];

  return (
    <div className="h-10 bg-ctp-crust/50 backdrop-blur-md border-b border-ctp-surface0/50 flex items-center px-2 justify-between shrink-0 z-20 overflow-hidden">
      <div className="flex items-center gap-1 h-full overflow-x-auto scrollbar-none flex-1 pr-2">
        {allTabs.map((item) => {
          const id = item.id;
          const isSession = sessions.find(s => s.id === id);
          const isEditor = editors.find(e => e.id === id);
          const active = focusedPane === id;
          const label = isSession ? (isSession.name || `Terminal ${id.slice(-4)}`) : (isEditor?.path?.split(/[/\\]/).pop() || 'Editor');
          
          return (
            <div
              key={id}
              onClick={() => handleTabClick(id)}
              className={`group flex items-center justify-between h-8 px-2 rounded-md cursor-pointer transition-all duration-200 border text-xs gap-2 select-none flex-1 min-w-[80px] max-w-[160px] ${
                active 
                  ? 'bg-ctp-surface0/60 border-ctp-blue/50 text-ctp-text shadow-sm' 
                  : 'border-transparent text-ctp-subtext0 hover:bg-ctp-surface0/30 hover:text-ctp-text'
              }`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                {isSession?.isSsh ? <Server size={14} className={`shrink-0 ${active ? "text-ctp-green" : "text-ctp-surface2"}`} /> : isSession ? <TerminalSquare size={14} className={`shrink-0 ${active ? "text-ctp-blue" : "text-ctp-surface2"}`} /> : <FileCode size={14} className={`shrink-0 ${active ? "text-ctp-peach" : "text-ctp-surface2"}`} />}
                <span className="truncate">{label}</span>
              </div>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if (isSession) removeSession(id);
                  else removeEditor(id); 
                }}
                className={`p-0.5 shrink-0 rounded-full transition-opacity ${active ? 'opacity-100 hover:bg-ctp-red/20 hover:text-ctp-red' : 'opacity-0 group-hover:opacity-100 hover:bg-ctp-surface1'}`}
              >
                <X size={12} />
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
          <div className="absolute top-full right-0 mt-1 w-56 bg-ctp-mantle border border-ctp-surface0 rounded-lg shadow-xl z-50 overflow-hidden">
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
