import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save } from 'lucide-react';
import { useStore } from '../store';

export default function VisualCommandBuilder({ onClose, initialData }) {
  const { addSnippet, snippets, removeSnippet } = useStore();
  const [name, setName] = useState('');
  const [baseCmd, setBaseCmd] = useState('');
  const [parts, setParts] = useState([]);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      // Try to parse command into parts (simple split by space for now)
      const tokens = initialData.command.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      if (tokens.length > 0) {
        setBaseCmd(tokens[0]);
        const newParts = tokens.slice(1).map(t => {
          if (t.startsWith('--') && t.includes('=')) {
            const [key, ...val] = t.split('=');
            return { type: 'kv', key, value: val.join('='), id: crypto.randomUUID() };
          } else if (t.startsWith('-')) {
            return { type: 'flag', key: t, value: '', id: crypto.randomUUID() };
          } else {
            return { type: 'arg', key: '', value: t, id: crypto.randomUUID() };
          }
        });
        setParts(newParts);
      }
    }
  }, [initialData]);

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
      alert("Name and Base Command are required.");
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
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-[#181825] border border-[#313244] rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#313244]">
          <h2 className="text-lg font-semibold text-[#cdd6f4]">
            {initialData ? 'Edit Snippet' : 'Visual CLI Builder'}
          </h2>
          <button onClick={onClose} className="text-[#a6adc8] hover:text-[#f38ba8] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#a6adc8] mb-1">Snippet Name</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Start Docker Dev DB"
                className="w-full bg-[#11111b] border border-[#313244] rounded px-3 py-2 text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa] text-sm"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-[#a6adc8] mb-1">Base Command</label>
              <input 
                type="text" 
                value={baseCmd}
                onChange={e => setBaseCmd(e.target.value)}
                placeholder="e.g. docker run"
                className="w-full bg-[#11111b] border border-[#313244] rounded px-3 py-2 text-[#a6e3a1] font-mono focus:outline-none focus:border-[#89b4fa] text-sm"
              />
            </div>
          </div>

          {/* Builder Parts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-xs font-medium text-[#a6adc8]">Parameters & Arguments</label>
              <div className="flex gap-2">
                <button onClick={() => addPart('flag')} className="text-xs bg-[#313244] hover:bg-[#45475a] px-2 py-1 rounded text-[#cdd6f4] transition-colors flex items-center gap-1">
                  <Plus size={12} /> Flag (-f)
                </button>
                <button onClick={() => addPart('kv')} className="text-xs bg-[#313244] hover:bg-[#45475a] px-2 py-1 rounded text-[#cdd6f4] transition-colors flex items-center gap-1">
                  <Plus size={12} /> Key-Value (--k=v)
                </button>
                <button onClick={() => addPart('arg')} className="text-xs bg-[#313244] hover:bg-[#45475a] px-2 py-1 rounded text-[#cdd6f4] transition-colors flex items-center gap-1">
                  <Plus size={12} /> Argument ("str")
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {parts.length === 0 && (
                <div className="text-center py-6 text-[#6c7086] border border-dashed border-[#313244] rounded-lg text-sm">
                  No parameters added. Click above to add flags or arguments.
                </div>
              )}
              {parts.map((p, index) => (
                <div key={p.id} className="flex gap-2 items-center bg-[#11111b] p-2 rounded border border-[#313244]">
                  {p.type === 'flag' && (
                    <>
                      <span className="text-[#a6adc8] text-xs font-mono w-16 text-center bg-[#181825] px-2 py-1 rounded">Flag</span>
                      <input 
                        type="text" 
                        value={p.key} 
                        onChange={e => updatePart(p.id, 'key', e.target.value)} 
                        placeholder="-f or --force"
                        className="flex-1 bg-transparent text-[#f9e2af] font-mono text-sm focus:outline-none"
                      />
                    </>
                  )}
                  
                  {p.type === 'arg' && (
                    <>
                      <span className="text-[#a6adc8] text-xs font-mono w-16 text-center bg-[#181825] px-2 py-1 rounded">Arg</span>
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
                      <span className="text-[#a6adc8] text-xs font-mono w-16 text-center bg-[#181825] px-2 py-1 rounded">K=V</span>
                      <input 
                        type="text" 
                        value={p.key} 
                        onChange={e => updatePart(p.id, 'key', e.target.value)} 
                        placeholder="--port"
                        className="w-1/3 bg-transparent text-[#f9e2af] font-mono text-sm focus:outline-none border-r border-[#313244] pr-2"
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

                  <button onClick={() => removePart(p.id)} className="p-1 text-[#6c7086] hover:text-[#f38ba8] transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer & Live Preview */}
        <div className="p-4 border-t border-[#313244] bg-[#11111b] rounded-b-xl flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[#a6adc8] text-xs font-medium">Live Preview</span>
            <div className="bg-[#181825] p-3 rounded border border-[#313244] text-[#cdd6f4] font-mono text-sm overflow-x-auto whitespace-nowrap">
              {generateCommand() || <span className="text-[#6c7086]">Command will appear here...</span>}
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded text-[#cdd6f4] hover:bg-[#313244] transition-colors text-sm font-medium">
              Cancel
            </button>
            <button onClick={handleSave} className="px-4 py-2 rounded bg-[#89b4fa] text-[#11111b] hover:bg-[#b4befe] transition-colors flex items-center gap-2 text-sm font-medium">
              <Save size={16} /> Save Snippet
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
