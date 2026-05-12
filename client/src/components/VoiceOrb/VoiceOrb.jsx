import React, { useState, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { useAudioCapture } from './useAudioCapture';
import { useStore } from '../../store';

export default function VoiceOrb() {
  const [status, setStatus] = useState('unconfigured'); // unconfigured, idle, listening, thinking
  const [lastText, setLastText] = useState('');
  
  const setSettingsOpen = useStore(state => state.setSettingsOpen);
  const aiConfig = useStore(state => state.aiConfig);
  const setAiConfig = useStore(state => state.setAiConfig);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    // Fetch settings on mount
    fetch(`/api/settings?token=${token}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.aiProvider) {
          setAiConfig(data);
          setTimeout(() => setStatus('idle'), 0);
        } else {
          setTimeout(() => setStatus('unconfigured'), 0);
        }
      })
      .catch(() => {
        setTimeout(() => setStatus('unconfigured'), 0);
      });
  }, [setAiConfig]);

  useEffect(() => {
    // Update status if config changes globally
    const timer = setTimeout(() => {
      if (aiConfig && aiConfig.aiProvider) {
        if (status === 'unconfigured') setStatus('idle');
      } else {
        setStatus('unconfigured');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [aiConfig, status]);

  const onAudioReady = async (blob) => {
    setStatus('thinking');
    const formData = new FormData();
    formData.append('audio', blob, 'voice.webm');

    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const sid = sessionStorage.getItem('nexus_sid');
      
      const res = await fetch(`/api/voice/process?token=${token}&sid=${sid}`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setLastText(data.text || '');
      
      if (data.action === 'execute_terminal_command') {
        // Backend handles injecting the command directly into the PTY now!
      } else if (data.action === 'execute_ui_action') {
        // Dispatch custom event for UI changes
        window.dispatchEvent(new CustomEvent('nexus-ui-action', { detail: data.result }));
      }
      
      setTimeout(() => setStatus('idle'), 2000); // give time to read text
    } catch (err) {
      console.error(err);
      setStatus('idle');
    }
  };

  const { startRecording, stopRecording } = useAudioCapture(onAudioReady);

  return (
    <div 
      onPointerDown={() => {
        if (status === 'unconfigured') {
          setSettingsOpen(true);
          return;
        }
        if(status === 'idle') startRecording();
        setStatus('listening');
      }}
      onPointerUp={() => {
        if(status === 'listening') stopRecording();
      }}
      onPointerCancel={() => {
        if(status === 'listening') stopRecording();
      }}
      className={`fixed bottom-6 right-6 w-16 h-16 rounded-full cursor-pointer flex items-center justify-center shadow-[0_0_20px_rgba(203,166,247,0.4)] z-50 transition-all duration-300 ${
        status === 'listening' ? 'bg-[#89dceb] scale-110' : status === 'thinking' ? 'bg-[#f9e2af]' : 'bg-[#cba6f7]'
      }`}
    >
      <Mic className="text-[#11111b] w-8 h-8 pointer-events-none" />
      {lastText && (
        <div className="absolute bottom-20 right-0 bg-[#313244] text-[#cdd6f4] px-3 py-1 rounded text-xs whitespace-nowrap">
          {lastText}
        </div>
      )}
    </div>
  );
}
