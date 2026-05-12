import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { X, Settings, Database, Key, Server, Hash } from 'lucide-react';
import { useStore } from '../store';
import { toast } from 'sonner';

const PROVIDER_DEFAULTS = {
  openai: {
    url: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  groq: {
    url: 'https://api.groq.com/openai/v1',
    model: 'llama3-70b-8192'
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-1.5-flash'
  },
  ollama: {
    url: 'http://localhost:11434/v1',
    model: 'llama3'
  }
};

export default function SettingsModal() {
  const isOpen = useStore(state => state.isSettingsOpen);
  const setOpen = useStore(state => state.setSettingsOpen);
  const aiConfig = useStore(state => state.aiConfig);
  const setAiConfig = useStore(state => state.setAiConfig);

  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [url, setUrl] = useState('');

  // When config changes or modal opens, initialize state
  useEffect(() => {
    let timer;
    if (aiConfig && isOpen) {
      timer = setTimeout(() => {
        setProvider(aiConfig.provider || 'openai');
        setApiKey(aiConfig.apiKey || '');
        setModel(aiConfig.model || PROVIDER_DEFAULTS['openai'].model);
        setUrl(aiConfig.url || PROVIDER_DEFAULTS['openai'].url);
      }, 0);
    } else if (isOpen && !aiConfig) {
      timer = setTimeout(() => {
        setProvider('openai');
        setModel(PROVIDER_DEFAULTS['openai'].model);
        setUrl(PROVIDER_DEFAULTS['openai'].url);
        setApiKey('');
      }, 0);
    }
    return () => clearTimeout(timer);
  }, [isOpen, aiConfig]);

  const handleProviderChange = (e) => {
    const newProvider = e.target.value;
    setProvider(newProvider);
    setModel(PROVIDER_DEFAULTS[newProvider]?.model || '');
    setUrl(PROVIDER_DEFAULTS[newProvider]?.url || '');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const configData = { provider, apiKey, model, url };
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const res = await fetch(`/api/settings?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
      });
      const data = await res.json();
      if (res.ok) {
        setAiConfig(configData);
        toast.success('Settings saved successfully');
        setOpen(false);
      } else {
        toast.error(data.error || 'Failed to save settings');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to communicate with server');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <Motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* Modal */}
          <Motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-md bg-ctp-base/80 backdrop-blur-md border border-ctp-surface0/50 shadow-2xl rounded-xl overflow-hidden text-ctp-text"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-ctp-surface0/50 bg-ctp-crust/50">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-ctp-mauve" />
                <h2 className="text-lg font-semibold">AI Provider Settings</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-ctp-surface0 text-ctp-subtext0 hover:text-ctp-text transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-ctp-subtext0">
                  <Database className="w-4 h-4" />
                  Provider
                </label>
                <select
                  value={provider}
                  onChange={handleProviderChange}
                  className="w-full bg-ctp-mantle border border-ctp-surface0 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ctp-mauve focus:ring-1 focus:ring-ctp-mauve transition-all"
                >
                  <option value="openai">OpenAI</option>
                  <option value="groq">Groq</option>
                  <option value="gemini">Gemini</option>
                  <option value="ollama">Ollama</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-ctp-subtext0">
                  <Key className="w-4 h-4" />
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={provider === 'ollama' ? 'Leave empty for Ollama' : 'sk-...'}
                  className="w-full bg-ctp-mantle border border-ctp-surface0 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ctp-mauve focus:ring-1 focus:ring-ctp-mauve transition-all placeholder:text-ctp-surface1"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-ctp-subtext0">
                  <Hash className="w-4 h-4" />
                  Model Name
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="w-full bg-ctp-mantle border border-ctp-surface0 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ctp-mauve focus:ring-1 focus:ring-ctp-mauve transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-ctp-subtext0">
                  <Server className="w-4 h-4" />
                  Base URL
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  className="w-full bg-ctp-mantle border border-ctp-surface0 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ctp-mauve focus:ring-1 focus:ring-ctp-mauve transition-all"
                />
              </div>

              {/* Footer */}
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-ctp-subtext0 hover:text-ctp-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-ctp-mauve text-ctp-crust rounded-lg hover:bg-ctp-mauve/90 transition-colors shadow-[0_0_15px_rgba(203,166,247,0.3)] hover:shadow-[0_0_20px_rgba(203,166,247,0.5)]"
                >
                  Save Configuration
                </button>
              </div>
            </form>
          </Motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
