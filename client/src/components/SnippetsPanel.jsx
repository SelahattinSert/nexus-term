import React, { useState, useRef } from 'react';
import { useStore } from '../store';
import { Play, Trash2, Plus, Edit, Download, Upload } from 'lucide-react';
import VisualCommandBuilder from './VisualCommandBuilder';
import { toast } from 'sonner';

export default function SnippetsPanel() {
  const { isSidebarOpen, activeSidebarTab, snippets, removeSnippet, focusedPane, addSnippet } = useStore();
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState(null);
  const fileInputRef = useRef(null);

  if (!isSidebarOpen || activeSidebarTab !== 'snippets') return null;

  const handleRun = (command) => {
    if (!focusedPane) {
      toast.error("Please focus a terminal pane first.");
      return;
    }
    
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

  const handleExport = () => {
    if (snippets.length === 0) {
      toast.error("No snippets to export.");
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(snippets, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "nexusterm-snippets.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success("Snippets exported successfully.");
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedSnippets = JSON.parse(event.target.result);
        if (!Array.isArray(importedSnippets)) {
          throw new Error("Invalid format: expected an array.");
        }
        
        let count = 0;
        importedSnippets.forEach(snippet => {
          if (snippet.name && snippet.command) {
            addSnippet({
              name: snippet.name,
              command: snippet.command
            });
            count++;
          }
        });
        
        toast.success(`Imported ${count} snippets successfully.`);
      } catch (err) {
        toast.error("Failed to parse snippets file.");
        console.error(err);
      }
      
      // Reset input so the same file can be selected again if needed
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="w-64 bg-ctp-mantle border-r border-ctp-surface0 flex flex-col h-full text-sm shrink-0">
      <div className="p-3 border-b border-ctp-surface0 flex justify-between items-center text-ctp-text font-medium">
        <span>Saved Snippets</span>
        <div className="flex gap-2">
          <input 
            type="file" 
            accept=".json" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
          />
          <button 
            onClick={handleImportClick}
            className="text-ctp-subtext0 hover:text-ctp-green transition-colors"
            title="Import Snippets"
          >
            <Upload size={16} />
          </button>
          <button 
            onClick={handleExport}
            className="text-ctp-subtext0 hover:text-ctp-peach transition-colors"
            title="Export Snippets"
          >
            <Download size={16} />
          </button>
          <button 
            onClick={handleCreate}
            className="text-ctp-blue hover:text-ctp-lavender transition-colors ml-1"
            title="Create New Snippet"
          >
            <Plus size={18} />
          </button>
        </div>
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
