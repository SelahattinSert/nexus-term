import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { X, Settings, Database, Key, Server, Hash, Monitor, Palette, TerminalSquare } from 'lucide-react';
import { useStore } from '../store';
import { themes, getThemesByCategory, applyTheme } from '../themes';
import { toast } from 'sonner';

const PROVIDER_DEFAULTS = {
  openai: { url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  groq: { url: 'https://api.groq.com/openai/v1', model: 'llama3-70b-8192' },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-2.5-flash' },
  ollama: { url: 'http://localhost:11434/v1', model: 'llama3' }
};

function ThemeCard({ id, themeData, isActive, onSelect, onPreview, onPreviewEnd }) {
  const ui = themeData.ui;
  return (
    <button
      onClick={() => onSelect(id)}
      onMouseEnter={() => onPreview(id)}
      onMouseLeave={onPreviewEnd}
      type="button"
      style={{
        borderColor: isActive ? ui.blue : ui.surface1,
        backgroundColor: isActive ? 'color-mix(in srgb, var(--ctp-surface0) 40%, transparent)' : 'transparent',
      }}
      className={`group relative flex flex-col gap-1.5 p-2 rounded-lg border transition-all duration-200 text-left ${
        isActive ? 'ring-1 shadow-md' : 'hover:shadow-sm'
      }`}
    >
      <div className="flex gap-0.5 h-4 rounded overflow-hidden">
        <div className="flex-1" style={{ background: ui.base }} />
        <div className="flex-1" style={{ background: ui.surface0 }} />
        <div className="flex-1" style={{ background: ui.blue }} />
        <div className="flex-1" style={{ background: ui.green }} />
        <div className="flex-1" style={{ background: ui.red }} />
      </div>
      <div className="flex gap-0.5 h-1.5 rounded-sm overflow-hidden opacity-40">
        {['black','red','green','yellow','blue'].map(c => (
          <div key={c} className="flex-1" style={{ background: themeData.terminal[c] }} />
        ))}
      </div>
      <span className="text-[10px] font-medium truncate" style={{ color: ui.text }}>
        {themeData.name}
      </span>
      {isActive && (
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full border" style={{ backgroundColor: ui.blue, borderColor: ui.base }} />
      )}
    </button>
  );
}

export default function SettingsModal() {
  const isOpen = useStore(state => state.isSettingsOpen);
  const setOpen = useStore(state => state.setSettingsOpen);
  const aiConfig = useStore(state => state.aiConfig);
  const setAiConfig = useStore(state => state.setAiConfig);
  const theme = useStore(state => state.theme);
  const setTheme = useStore(state => state.setTheme);

  const [activeTab, setActiveTab] = useState('general');
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [url, setUrl] = useState('');
  const [whisperModel, setWhisperModel] = useState('Xenova/whisper-base');
  const [whisperLanguage, setWhisperLanguage] = useState('auto');
  const [themeFilter, setThemeFilter] = useState('all');
  const [previewTheme, setPreviewTheme] = useState(null);
  const [savedTheme, setSavedTheme] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        setSavedTheme(theme);
        if (aiConfig) {
          setProvider(aiConfig.provider || 'openai');
          setApiKey(aiConfig.apiKey || '');
          setModel(aiConfig.model || '');
          setUrl(aiConfig.url || '');
          setWhisperModel(aiConfig.whisperModel || 'Xenova/whisper-base');
          setWhisperLanguage(aiConfig.whisperLanguage || 'auto');
        }
      }, 0);
    }
  }, [isOpen, aiConfig, theme]);

  const handlePreview = (themeId) => {
    setPreviewTheme(themeId);
    applyTheme(themeId);
  };

  const handlePreviewEnd = () => {
    if (previewTheme) {
      applyTheme(savedTheme || theme);
      setPreviewTheme(null);
    }
  };

  const handleThemeSelect = (themeId) => {
    setTheme(themeId);
    setSavedTheme(themeId);
    applyTheme(themeId);
    toast.success(`${themes[themeId].name} theme applied`);
  };

  const handleClose = () => {
    if (previewTheme || theme !== savedTheme) {
      applyTheme(savedTheme);
    }
    setOpen(false);
  };

  const handleSaveAI = async (e) => {
    e.preventDefault();
    const configData = { provider, apiKey, model, url, whisperModel, whisperLanguage };
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const res = await fetch(`/api/settings?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
      });
      if (res.ok) {
        setAiConfig(configData);
        toast.success(activeTab === 'voice' ? 'Voice Settings saved' : 'AI Settings saved');
        setOpen(false);
      } else {
        toast.error('Failed to save settings');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const { dark, light } = getThemesByCategory();
  const filteredThemes = themeFilter === 'dark' ? dark : themeFilter === 'light' ? light : [...dark, ...light];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <Motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-2xl shadow-2xl rounded-2xl overflow-hidden text-ctp-text flex h-[540px]"
            style={{ 
              backgroundColor: 'color-mix(in srgb, var(--ctp-base) 95%, transparent)',
              backdropFilter: 'blur(16px)',
              border: '1px solid color-mix(in srgb, var(--ctp-surface0) 50%, transparent)'
            }}
          >
            <div className="w-48 flex flex-col p-4 gap-2 border-r" style={{ backgroundColor: 'color-mix(in srgb, var(--ctp-crust) 60%, transparent)', borderColor: 'var(--ctp-surface0)' }}>
              <div className="flex items-center gap-2 px-2 mb-6 text-ctp-blue">
                <Settings size={20} />
                <span className="font-bold uppercase tracking-widest text-xs">NexusTerm</span>
              </div>
              <button onClick={() => setActiveTab('general')} 
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium"
                style={{
                  backgroundColor: activeTab === 'general' ? 'color-mix(in srgb, var(--ctp-blue) 15%, transparent)' : 'transparent',
                  color: activeTab === 'general' ? 'var(--ctp-blue)' : 'var(--ctp-subtext0)'
                }}
              >
                <Palette size={18} /> Appearance
              </button>
              <button onClick={() => setActiveTab('ai')} 
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium"
                style={{
                  backgroundColor: activeTab === 'ai' ? 'color-mix(in srgb, var(--ctp-blue) 15%, transparent)' : 'transparent',
                  color: activeTab === 'ai' ? 'var(--ctp-blue)' : 'var(--ctp-subtext0)'
                }}
              >
                <Database size={18} /> AI Provider
              </button>
              <button onClick={() => setActiveTab('voice')} 
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium"
                style={{
                  backgroundColor: activeTab === 'voice' ? 'color-mix(in srgb, var(--ctp-blue) 15%, transparent)' : 'transparent',
                  color: activeTab === 'voice' ? 'var(--ctp-blue)' : 'var(--ctp-subtext0)'
                }}
              >
                <Monitor size={18} /> Voice (STT)
              </button>
              </div>
            <div className="flex-1 flex flex-col" style={{ backgroundColor: 'color-mix(in srgb, var(--ctp-mantle) 40%, transparent)' }}>
              <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'color-mix(in srgb, var(--ctp-surface0) 50%, transparent)' }}>
                <h2 className="text-lg font-bold">{activeTab === 'ai' ? 'AI Configuration' : activeTab === 'voice' ? 'Voice (STT) Settings' : 'Appearance'}</h2>
                <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-ctp-red/10 hover:text-ctp-red transition-colors text-ctp-subtext0"><X size={20} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                {activeTab === 'general' ? (
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 p-1 rounded-lg w-fit border" style={{ backgroundColor: 'color-mix(in srgb, var(--ctp-crust) 60%, transparent)', borderColor: 'color-mix(in srgb, var(--ctp-surface0) 50%, transparent)' }}>
                      {['all','dark','light'].map(f => (
                        <button key={f} onClick={() => setThemeFilter(f)} 
                          className="px-4 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm"
                          style={{
                            backgroundColor: themeFilter === f ? 'var(--ctp-blue)' : 'transparent',
                            color: themeFilter === f ? 'var(--ctp-crust)' : 'var(--ctp-subtext0)'
                          }}
                        >
                          {f.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {filteredThemes.map(t => (
                        <ThemeCard key={t.id} id={t.id} themeData={t} isActive={savedTheme === t.id} onSelect={handleThemeSelect} onPreview={handlePreview} onPreviewEnd={handlePreviewEnd} />
                      ))}
                    </div>
                  </div>
                ) : activeTab === 'voice' ? (
                  <form onSubmit={handleSaveAI} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-ctp-surface2 uppercase ml-1 flex items-center gap-2"><Monitor size={14}/> Whisper Model</label>
                      <select value={whisperModel} onChange={(e) => setWhisperModel(e.target.value)} 
                      className="w-full border rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-ctp-blue"
                      style={{ borderColor: 'var(--ctp-surface0)', backgroundColor: 'var(--ctp-base)', color: 'var(--ctp-text)' }}>
                        <option value="Xenova/whisper-tiny">Tiny (Fastest, Low Accuracy)</option>
                        <option value="Xenova/whisper-base">Base (Balanced)</option>
                        <option value="Xenova/whisper-small">Small (Slower, High Accuracy)</option>
                        <option value="Xenova/whisper-base.en">Base.en (English Only - Very Accurate)</option>
                        <option value="Xenova/whisper-small.en">Small.en (English Only - Best Accuracy)</option>
                      </select>
                      <p className="text-xs text-ctp-subtext0 ml-1 mt-1">If you only speak English, selecting an '.en' model prevents hallucinations.</p>
                    </div>
                    <div className="space-y-1.5 mt-4">
                      <label className="text-xs font-bold text-ctp-surface2 uppercase ml-1 flex items-center gap-2"><Hash size={14}/> Forced Language</label>
                      <select value={whisperLanguage} onChange={(e) => setWhisperLanguage(e.target.value)} 
                      className="w-full border rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-ctp-blue"
                      style={{ borderColor: 'var(--ctp-surface0)', backgroundColor: 'var(--ctp-base)', color: 'var(--ctp-text)' }}>
                        <option value="auto">Auto-Detect Language</option>
                        <option value="en">English (en)</option>
                        <option value="tr">Turkish (tr)</option>
                        <option value="de">German (de)</option>
                        <option value="fr">French (fr)</option>
                      </select>
                      <p className="text-xs text-ctp-subtext0 ml-1 mt-1">Forces Whisper to transcribe in this language. Highly recommended if not using 'Auto'.</p>
                    </div>
                    <button type="submit" className="w-full text-ctp-crust font-bold py-3 rounded-xl shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all mt-6" style={{ backgroundColor: 'var(--ctp-blue)' }}>
                      Save Voice Settings
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleSaveAI} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-ctp-surface2 uppercase ml-1 flex items-center gap-2"><Database size={14}/> Provider</label>
                      <select value={provider} onChange={(e) => {
                        const p = e.target.value; setProvider(p);
                        setUrl(PROVIDER_DEFAULTS[p]?.url || ''); setModel(PROVIDER_DEFAULTS[p]?.model || '');
                      }} 
                      className="w-full border rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-ctp-blue text-ctp-text bg-ctp-base"
                      style={{ borderColor: 'var(--ctp-surface0)' }}>
                        <option value="openai">OpenAI</option><option value="groq">Groq</option><option value="gemini">Gemini</option><option value="ollama">Ollama</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-ctp-surface2 uppercase ml-1 flex items-center gap-2"><Key size={14}/> API Key</label>
                      <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." 
                      className="w-full border rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-ctp-blue text-ctp-text bg-ctp-base placeholder-ctp-surface2"
                      style={{ borderColor: 'var(--ctp-surface0)' }} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-ctp-surface2 uppercase ml-1 flex items-center gap-2"><Hash size={14}/> Model Name</label>
                      <input type="text" value={model} onChange={e => setModel(e.target.value)} 
                      className="w-full border rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-ctp-blue"
                      style={{ borderColor: 'var(--ctp-surface0)', backgroundColor: 'var(--ctp-base)', color: 'var(--ctp-text)' }} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-ctp-surface2 uppercase ml-1 flex items-center gap-2"><Server size={14}/> Base URL</label>
                      <input type="text" value={url} onChange={e => setUrl(e.target.value)} 
                      className="w-full border rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-ctp-blue"
                      style={{ borderColor: 'var(--ctp-surface0)', backgroundColor: 'var(--ctp-base)', color: 'var(--ctp-text)' }} />
                    </div>
                    <button type="submit" className="w-full text-ctp-crust font-bold py-3 rounded-xl shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all mt-4" style={{ backgroundColor: 'var(--ctp-blue)' }}>
                      Save AI Settings
                    </button>
                  </form>
                )}
              </div>
            </div>
          </Motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
