import React, { useState } from 'react';
import { useStore } from '../store';
import { Play, Trash2, Plus, Edit } from 'lucide-react';
import VisualCommandBuilder from './VisualCommandBuilder';

export default function SnippetsPanel() {
  const { isSidebarOpen, activeSidebarTab, snippets, removeSnippet, focusedPane } = useStore();
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState(null);

  if (!isSidebarOpen || activeSidebarTab !== 'snippets') return null;

  const handleRun = (command) => {
    if (!focusedPane) {
      alert("Please focus a terminal pane first.");
      return;
    }
    
    // We need to send the command to the focused terminal
    // We can do this by using a custom event or a store method
    // Since we don't have a direct reference to the terminal's websocket here,
    // let's dispatch a custom event that NexusTerm can listen to.
    const event = new CustomEvent('nexus-execute-command', { 
      detail: { sessionId: focusedPane, command } 
    });
    window.dispatchEvent(event);
  };

  const handleEdit = (snippet) => {
    setEditingSnippet(snippet);
    setIsBuilderOpen(true);
  };

  const handleCreate = () => {
    setEditingSnippet(null);
    setIsBuilderOpen(true);
  };

  return (
    <div className="w-64 bg-[#181825] border-r border-[#313244] flex flex-col h-full text-sm shrink-0">
      <div className="p-3 border-b border-[#313244] flex justify-between items-center text-[#cdd6f4] font-medium">
        <span>Saved Snippets</span>
        <button 
          onClick={handleCreate}
          className="text-[#89b4fa] hover:text-[#b4befe] transition-colors"
          title="Create New Snippet"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {snippets.length === 0 ? (
          <div className="text-[#6c7086] text-center p-4">
            No snippets saved yet. Click + to create one visually.
          </div>
        ) : (
          snippets.map(snippet => (
            <div key={snippet.id} className="bg-[#1e1e2e] p-3 rounded-lg border border-[#313244] group">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-[#cdd6f4]">{snippet.name}</span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleEdit(snippet)}
                    className="text-[#f9e2af] hover:text-[#fab387]"
                    title="Edit"
                  >
                    <Edit size={14} />
                  </button>
                  <button 
                    onClick={() => removeSnippet(snippet.id)}
                    className="text-[#f38ba8] hover:text-[#eba0ac]"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="text-[#a6adc8] font-mono text-xs break-all truncate mb-3">
                {snippet.command}
              </div>
              <button 
                onClick={() => handleRun(snippet.command)}
                className="w-full flex items-center justify-center gap-2 bg-[#89b4fa] text-[#11111b] py-1.5 rounded font-medium hover:bg-[#b4befe] transition-colors"
              >
                <Play size={14} /> Run
              </button>
            </div>
          ))
        )}
      </div>

      {isBuilderOpen && (
        <VisualCommandBuilder 
          onClose={() => setIsBuilderOpen(false)} 
          initialData={editingSnippet} 
        />
      )}
    </div>
  );
}
