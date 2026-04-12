import React, { useState } from 'react';
import { useStore } from '../store';
import { Play, Trash2, Plus, Edit } from 'lucide-react';
import VisualCommandBuilder from './VisualCommandBuilder';
import { toast } from 'sonner';

export default function SnippetsPanel() {
  const { isSidebarOpen, activeSidebarTab, snippets, removeSnippet, focusedPane } = useStore();
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState(null);

  if (!isSidebarOpen || activeSidebarTab !== 'snippets') return null;

  const handleRun = (command) => {
    if (!focusedPane) {
      toast.error("Please focus a terminal pane first.");
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
    <div className="w-64 bg-ctp-mantle border-r border-ctp-surface0 flex flex-col h-full text-sm shrink-0">
      <div className="p-3 border-b border-ctp-surface0 flex justify-between items-center text-ctp-text font-medium">
        <span>Saved Snippets</span>
        <button 
          onClick={handleCreate}
          className="text-ctp-blue hover:text-ctp-lavender transition-colors"
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
            <div key={snippet.id} className="bg-ctp-base p-3 rounded-lg border border-ctp-surface0 group">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-ctp-text">{snippet.name}</span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleEdit(snippet)}
                    className="text-ctp-yellow hover:text-ctp-peach"
                    title="Edit"
                  >
                    <Edit size={14} />
                  </button>
                  <button 
                    onClick={() => removeSnippet(snippet.id)}
                    className="text-ctp-red hover:text-ctp-maroon"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="text-ctp-subtext0 font-mono text-xs break-all truncate mb-3">
                {snippet.command}
              </div>
              <button 
                onClick={() => handleRun(snippet.command)}
                className="w-full flex items-center justify-center gap-2 bg-ctp-blue text-ctp-crust py-1.5 rounded font-medium hover:bg-ctp-lavender transition-colors"
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
