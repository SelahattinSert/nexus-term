import React, { useState, useEffect, useRef } from 'react';
import { Search, Terminal, Star, Plus, Settings, X } from 'lucide-react';
import { useStore } from '../store';
import VisualCommandBuilder from './VisualCommandBuilder';

export default function CommandPalette() {
  const { snippets, focusedPane, createSession, toggleSidebar } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+P or Cmd+P
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setIsOpen(true);
      }
      
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setSearch('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  if (!isOpen && !isBuilderOpen) return null;

  const defaultCommands = [
    { id: 'new_term', name: 'Terminal: Create New Session', icon: Terminal, action: () => { createSession(); setIsOpen(false); } },
    { id: 'toggle_sidebar', name: 'View: Toggle Sidebar', icon: Settings, action: () => { toggleSidebar(); setIsOpen(false); } },
    { id: 'create_snippet', name: 'Snippets: Create Visual Command', icon: Plus, action: () => { setIsOpen(false); setIsBuilderOpen(true); } }
  ];

  const snippetCommands = snippets.map(s => ({
    id: `snippet_${s.id}`,
    name: `Snippet: ${s.name}`,
    description: s.command,
    icon: Star,
    action: () => {
      if (focusedPane) {
        const event = new CustomEvent('nexus-execute-command', { 
          detail: { sessionId: focusedPane, command: s.command } 
        });
        window.dispatchEvent(event);
      }
      setIsOpen(false);
    }
  }));

  const allCommands = [...snippetCommands, ...defaultCommands];
  
  const filteredCommands = allCommands.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.description && c.description.toLowerCase().includes(search.toLowerCase()))
  );

  const handleCommandKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filteredCommands.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
      }
    }
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50 p-4 backdrop-blur-sm" onClick={() => setIsOpen(false)}>
          <div 
            className="bg-[#181825] border border-[#313244] rounded-xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center border-b border-[#313244] px-4 py-3 gap-3 text-[#cdd6f4]">
              <Search size={18} className="text-[#6c7086]" />
              <input 
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setSelectedIndex(0); }}
                onKeyDown={handleCommandKeyDown}
                placeholder="Search commands, snippets..."
                className="bg-transparent flex-1 focus:outline-none text-sm"
              />
              <button onClick={() => setIsOpen(false)} className="text-[#a6adc8] hover:text-[#f38ba8] transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto py-2">
              {filteredCommands.length === 0 ? (
                <div className="text-[#6c7086] text-center py-6 text-sm">No results found</div>
              ) : (
                filteredCommands.map((cmd, idx) => (
                  <div 
                    key={cmd.id}
                    onClick={() => cmd.action()}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm transition-colors ${idx === selectedIndex ? 'bg-[#313244] text-[#cdd6f4]' : 'text-[#a6adc8] hover:bg-[#1e1e2e]'}`}
                  >
                    <cmd.icon size={16} className={idx === selectedIndex ? 'text-[#89b4fa]' : 'text-[#6c7086]'} />
                    <div className="flex flex-col">
                      <span>{cmd.name}</span>
                      {cmd.description && (
                        <span className="text-xs text-[#6c7086] font-mono mt-0.5 truncate max-w-[400px]">
                          {cmd.description}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {isBuilderOpen && (
        <VisualCommandBuilder onClose={() => setIsBuilderOpen(false)} />
      )}
    </>
  );
}
