import React, { useState } from 'react';
import { X, Plus, Trash2, Save } from 'lucide-react';
import { useStore } from '../store';
import { toast } from 'sonner';

export default function VisualCommandBuilder({ onClose, initialData }) {
  const { addSnippet, removeSnippet } = useStore();
  
  const [name, setName] = useState(initialData?.name || '');
  const [baseCmd, setBaseCmd] = useState(() => {
    if (!initialData) return '';
    const tokens = initialData.command.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    return tokens.length > 0 ? tokens[0] : '';
  });
  
  const [parts, setParts] = useState(() => {
    if (!initialData) return [];
    const tokens = initialData.command.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    if (tokens.length > 0) {
      return tokens.slice(1).map(t => {
        if (t.startsWith('--') && t.includes('=')) {
          const [key, ...val] = t.split('=');
          return { type: 'kv', key, value: val.join('='), id: crypto.randomUUID() };
        } else if (t.startsWith('-')) {
          return { type: 'flag', key: t, value: '', id: crypto.randomUUID() };
        } else {
          return { type: 'arg', key: '', value: t, id: crypto.randomUUID() };
        }
      });
    }
    return [];
  });

  const addPart = (type) => {
    setParts([...parts, { type, key: type === 'flag' ? '-' : '', value: '', id: crypto.randomUUID() }]);
  };

  const updatePart = (id, field, value) => {
    setParts(parts.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const removePart = (id) => {
    setParts(parts.filter(p => p.id !== id));
  };

  const generateCommand = () => {
    let cmd = baseCmd.trim();
    parts.forEach(p => {
      if (p.type === 'flag' && p.key) {
        cmd += ` ${p.key}`;
      } else if (p.type === 'arg' && p.value) {
        cmd += ` ${p.value.includes(' ') ? `"${p.value}"` : p.value}`;
      } else if (p.type === 'kv' && p.key) {
        const val = p.value.includes(' ') ? `"${p.value}"` : p.value;
        cmd += ` ${p.key}${val ? `=${val}` : ''}`;
      }
    });
    return cmd;
  };

  const handleSave = () => {
    if (!name.trim() || !baseCmd.trim()) {
      toast.error("Name and Base Command are required.");
      return;
    }
    
    if (initialData) {
      removeSnippet(initialData.id);
    }
    
    addSnippet({
      name: name.trim(),
      command: generateCommand(),
    });
    onClose();
    toast.success("Snippet saved successfully.");
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-ctp-mantle border border-ctp-surface0 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ctp-surface0">
          <h2 className="text-lg font-semibold text-ctp-text">
            {initialData ? 'Edit Snippet' : 'Visual CLI Builder'}
          </h2>
          <button onClick={onClose} className="text-ctp-subtext0 hover:text-ctp-red transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ctp-subtext0 mb-1">Snippet Name</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Start Docker Dev DB"
                className="w-full bg-ctp-crust border border-ctp-surface0 rounded px-3 py-2 text-ctp-text focus:outline-none focus:border-ctp-blue text-sm"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-ctp-subtext0 mb-1">Base Command</label>
              <input 
                type="text" 
                value={baseCmd}
                onChange={e => setBaseCmd(e.target.value)}
                placeholder="e.g. docker run"
                className="w-full bg-ctp-crust border border-ctp-surface0 rounded px-3 py-2 text-ctp-green font-mono focus:outline-none focus:border-ctp-blue text-sm"
              />
            </div>
          </div>

          {/* Builder Parts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-xs font-medium text-ctp-subtext0">Parameters & Arguments</label>
              <div className="flex gap-2">
                <button onClick={() => addPart('flag')} className="text-xs bg-ctp-surface0 hover:bg-ctp-surface1 px-2 py-1 rounded text-ctp-text transition-colors flex items-center gap-1">
                  <Plus size={12} /> Flag (-f)
                </button>
                <button onClick={() => addPart('kv')} className="text-xs bg-ctp-surface0 hover:bg-ctp-surface1 px-2 py-1 rounded text-ctp-text transition-colors flex items-center gap-1">
                  <Plus size={12} /> Key-Value (--k=v)
                </button>
                <button onClick={() => addPart('arg')} className="text-xs bg-ctp-surface0 hover:bg-ctp-surface1 px-2 py-1 rounded text-ctp-text transition-colors flex items-center gap-1">
                  <Plus size={12} /> Argument ("str")
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {parts.length === 0 && (
                <div className="text-center py-6 text-[#6c7086] border border-dashed border-ctp-surface0 rounded-lg text-sm">
                  No parameters added. Click above to add flags or arguments.
                </div>
              )}
              {parts.map((p) => (
                <div key={p.id} className="flex gap-2 items-center bg-ctp-crust p-2 rounded border border-ctp-surface0">
                  {p.type === 'flag' && (
                    <>
                      <span className="text-ctp-subtext0 text-xs font-mono w-16 text-center bg-ctp-mantle px-2 py-1 rounded">Flag</span>
                      <input 
                        type="text" 
                        value={p.key} 
                        onChange={e => updatePart(p.id, 'key', e.target.value)} 
                        placeholder="-f or --force"
                        className="flex-1 bg-transparent text-ctp-yellow font-mono text-sm focus:outline-none"
                      />
                    </>
                  )}
                  
                  {p.type === 'arg' && (
                    <>
                      <span className="text-ctp-subtext0 text-xs font-mono w-16 text-center bg-ctp-mantle px-2 py-1 rounded">Arg</span>
                      <input 
                        type="text" 
                        value={p.value} 
                        onChange={e => updatePart(p.id, 'value', e.target.value)} 
                        placeholder="value (spaces will be quoted)"
                        className="flex-1 bg-transparent text-[#89dceb] font-mono text-sm focus:outline-none"
                      />
                    </>
                  )}

                  {p.type === 'kv' && (
                    <>
                      <span className="text-ctp-subtext0 text-xs font-mono w-16 text-center bg-ctp-mantle px-2 py-1 rounded">K=V</span>
                      <input 
                        type="text" 
                        value={p.key} 
                        onChange={e => updatePart(p.id, 'key', e.target.value)} 
                        placeholder="--port"
                        className="w-1/3 bg-transparent text-ctp-yellow font-mono text-sm focus:outline-none border-r border-ctp-surface0 pr-2"
                      />
                      <span className="text-[#6c7086] px-1">=</span>
                      <input 
                        type="text" 
                        value={p.value} 
                        onChange={e => updatePart(p.id, 'value', e.target.value)} 
                        placeholder="8080"
                        className="flex-1 bg-transparent text-[#89dceb] font-mono text-sm focus:outline-none pl-1"
                      />
                    </>
                  )}

                  <button onClick={() => removePart(p.id)} className="p-1 text-[#6c7086] hover:text-ctp-red transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer & Live Preview */}
        <div className="p-4 border-t border-ctp-surface0 bg-ctp-crust rounded-b-xl flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-ctp-subtext0 text-xs font-medium">Live Preview</span>
            <div className="bg-ctp-mantle p-3 rounded border border-ctp-surface0 text-ctp-text font-mono text-sm overflow-x-auto whitespace-nowrap">
              {generateCommand() || <span className="text-[#6c7086]">Command will appear here...</span>}
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded text-ctp-text hover:bg-ctp-surface0 transition-colors text-sm font-medium">
              Cancel
            </button>
            <button onClick={handleSave} className="px-4 py-2 rounded bg-ctp-blue text-ctp-crust hover:bg-ctp-lavender transition-colors flex items-center gap-2 text-sm font-medium">
              <Save size={16} /> Save Snippet
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
