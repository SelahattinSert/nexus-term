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
        if (data && data.provider) {
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
      if (aiConfig && aiConfig.provider) {
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
      const sid = useStore.getState().focusedPane;
      if (sid) formData.append('sessionId', sid);
      
      const res = await fetch(`/api/voice?token=${token}`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setLastText(data.text || 'Could not understand...');
      
      if (data.action) {
        const actions = data.action.type === 'multi_action' ? data.action.actions : [data.action];
        
        let hasTextResponse = false;
        
        for (const action of actions) {
          if (action.type === 'execute_terminal_command') {
            // Backend handled this
          } else if (action.type === 'execute_ui_action' || action.action) {
            const actionName = action.action || action.type;
            window.dispatchEvent(new CustomEvent('nexus-ui-action', { detail: actionName }));
            // Small delay for visual effect
            await new Promise(r => setTimeout(r, 400));
          } else if (action.type === 'text_response') {
            setLastText(action.response || data.text);
            hasTextResponse = true;
          }
        }
        
        if (!hasTextResponse) {
          setLastText("Done.");
        }
      }
      
      setTimeout(() => setStatus('idle'), 3000); // give time to read text
    } catch (err) {
      console.error(err);
      setLastText('Error occurred!');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const { startRecording, stopRecording } = useAudioCapture(onAudioReady);

  const handleClick = () => {
    if (status === 'unconfigured') {
      setSettingsOpen(true);
      return;
    }
    
    if (status === 'idle') {
      startRecording();
      setStatus('listening');
      setLastText('Listening...');
    } else if (status === 'listening') {
      stopRecording();
      // status changes to 'thinking' when onAudioReady is called by stopRecording
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center justify-center">
      {/* Wave animation rings */}
      {status === 'listening' && (
        <>
          <div className="absolute w-full h-full rounded-full opacity-30 animate-ping" style={{ animationDuration: '1.5s', backgroundColor: 'var(--ctp-blue)' }} />
          <div className="absolute w-full h-full rounded-full opacity-20 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s', backgroundColor: 'var(--ctp-blue)' }} />
        </>
      )}
      
      <div 
        onClick={handleClick}
        className={`relative w-16 h-16 rounded-full cursor-pointer flex items-center justify-center transition-all duration-300 ${
          status === 'listening' ? 'scale-110' : 
          status === 'thinking' ? 'animate-pulse' : 
          status === 'unconfigured' ? 'bg-gray-500' :
          'hover:scale-105'
        }`}
        style={{
          backgroundColor: status === 'listening' ? 'var(--ctp-blue)' : status === 'thinking' ? 'var(--ctp-yellow)' : status === 'unconfigured' ? '' : 'var(--ctp-blue)',
          boxShadow: status === 'listening' ? '0 0 30px color-mix(in srgb, var(--ctp-blue) 80%, transparent)' : status === 'unconfigured' ? '' : '0 0 20px color-mix(in srgb, var(--ctp-blue) 40%, transparent)'
        }}
      >
        <Mic className="w-8 h-8 pointer-events-none" style={{ color: 'var(--ctp-crust)' }} />
        {lastText && (
          <div className="absolute bottom-20 right-0 px-3 py-1 rounded text-sm whitespace-nowrap shadow-lg border" style={{ backgroundColor: 'var(--ctp-surface1)', color: 'var(--ctp-text)', borderColor: 'var(--ctp-surface0)' }}>
            {lastText}
          </div>
        )}
      </div>
    </div>
  );
}
