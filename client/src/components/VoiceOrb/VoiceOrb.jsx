import React, { useState, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { useAudioCapture } from './useAudioCapture';
import { useStore } from '../../store';
import { motion as Motion } from 'framer-motion';

function TypewriterText({ text }) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    setDisplayedText('');
    if (!text) return;

    let i = 0;
    const intervalId = setInterval(() => {
      setDisplayedText(text.slice(0, i + 1));
      i++;
      if (i >= text.length) {
        clearInterval(intervalId);
      }
    }, 25); // Speed of typewriter (25ms per character)

    return () => clearInterval(intervalId);
  }, [text]);

  return <span>{displayedText}</span>;
}

export default function VoiceOrb() {
  const [status, setStatus] = useState('unconfigured'); // unconfigured, idle, listening, thinking, speaking
  const [lastText, setLastText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  
  const setSettingsOpen = useStore(state => state.setSettingsOpen);
  const aiConfig = useStore(state => state.aiConfig);
  const setAiConfig = useStore(state => state.setAiConfig);

  // --- TTS (Text to Speech) Implementation ---
  const speak = (text) => {
    if (!window.speechSynthesis) return;
    
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    
    if (aiConfig?.ttsVoice) {
      // Use the specific voice chosen by the user
      const preferredVoice = voices.find(v => v.voiceURI === aiConfig.ttsVoice);
      if (preferredVoice) {
        utterance.voice = preferredVoice;
        utterance.lang = preferredVoice.lang;
      }
    } else {
      // Fallback: Default to the whisper language setting or fallback to English
      const lang = aiConfig?.whisperLanguage === 'tr' ? 'tr-TR' : 'en-US';
      utterance.lang = lang;
      
      const preferredVoice = voices.find(v => v.lang.startsWith(lang) && !v.name.includes('Google'));
      if (preferredVoice) utterance.voice = preferredVoice;
    }
    
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onstart = () => setStatus('speaking');
    utterance.onend = () => setStatus('idle');
    utterance.onerror = () => setStatus('idle');

    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
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
      handleAgentResponse(data);
    } catch (err) {
      console.error(err);
      setLastText('Error occurred!');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const processReActLoop = async (messageContent) => {
    setStatus('thinking');
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const sid = useStore.getState().focusedPane;
      
      const res = await fetch(`/api/voice/react?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageContent, sessionId: sid })
      });
      const data = await res.json();
      handleAgentResponse(data);
    } catch (err) {
      console.error(err);
      setLastText('Error in autonomous loop!');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const handleAgentResponse = async (data) => {
    setLastText(data.text || 'Thinking...');
    
    if (data.action) {
      const actions = data.action.type === 'multi_action' ? data.action.actions : [data.action];
      let responseToSpeak = "";
      let executedCommands = [];
      let rejectedReason = null;
      
      for (const action of actions) {
        if (action.type === 'execute_terminal_command') {
          const sid = useStore.getState().focusedPane;
          if (!sid) {
            setLastText("No active terminal.");
            continue;
          }

          const executeCommand = async () => {
            setLastText(`Executing: ${action.command}`);
            // Fire command to terminal
            window.dispatchEvent(new CustomEvent('nexus-execute-command', { 
              detail: { sessionId: sid, command: action.command } 
            }));
            
            // Wait for terminal to process and output
            setStatus('listening'); // Pulse to show it's reading
            await new Promise(r => setTimeout(r, 2000));
            executedCommands.push(action.command);
          };

          if (aiConfig?.autoExecute) {
            await executeCommand();
          } else {
            // Ask for permission via Zustand store -> ApprovalModal
            const actionId = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `action-${new Date().getTime()}`;
            useStore.getState().setPendingCommand({
              command: action.command,
              sessionId: sid,
              actionId: actionId
            });

            // Wait for user resolution via event listener
            const resolution = await new Promise((resolve) => {
              const handler = (eventArg) => {
                if (eventArg.detail.actionId === actionId) {
                  window.removeEventListener('nexus-agent-approval', handler);
                  resolve(eventArg.detail);
                }
              };
              window.addEventListener('nexus-agent-approval', handler);
            });

            if (resolution.approved) {
              await executeCommand();
            } else {
              setLastText("Command rejected.");
              rejectedReason = resolution.reason;
              break; // Halt the execution chain if user rejects
            }
          }
        } else if (action.type === 'ssh_connect') {
          const store = useStore.getState();
          const profile = store.sshProfiles.find(p => p.name.toLowerCase() === action.profile_name.toLowerCase());
          if (profile) {
            setLastText(`Connecting to ${profile.name}...`);
            try {
              await store.connectToSshProfile(profile.id);
              store.setActiveSidebarTab('ssh');
              executedCommands.push(`ssh_connect to ${profile.name}`);
            } catch (err) {
              setLastText(`Failed to connect: ${err.message}`);
              rejectedReason = `System Error: Failed to connect to SSH profile '${profile.name}'. Error: ${err.message}`;
              break;
            }
          } else {
            setLastText(`SSH profile '${action.profile_name}' not found.`);
            rejectedReason = `System Error: SSH profile '${action.profile_name}' not found.`;
            break;
          }
        } else if (action.type === 'ssh_run_on') {
          const store = useStore.getState();
          const profile = store.sshProfiles.find(p => p.name.toLowerCase() === action.profile_name.toLowerCase());
          if (profile) {
            setLastText(`Running on ${profile.name}...`);
            try {
              // 1. Check if connected, if not connect
              let status = store.sshConnections[profile.id];
              if (status !== 'connected') {
                await store.connectToSshProfile(profile.id);
                store.setActiveSidebarTab('ssh');
              }
              // 2. Find the session that corresponds to this SSH profile
              // Wait for the new session to be fully created and added to the store
              await new Promise(r => setTimeout(r, 1000));
              const updatedStore = useStore.getState();
              const sshSession = updatedStore.sessions.find(s => s.sshProfileId === profile.id);
              
              if (sshSession) {
                window.dispatchEvent(new CustomEvent('nexus-execute-command', { 
                  detail: { sessionId: sshSession.id, command: action.command } 
                }));
                setStatus('listening');
                await new Promise(r => setTimeout(r, 2000));
                executedCommands.push(`ssh_run_on ${profile.name}: ${action.command}`);
              } else {
                 throw new Error("Terminal session for SSH not found");
              }
            } catch (err) {
              setLastText(`Failed to run command: ${err.message}`);
              rejectedReason = `System Error: Failed to run command on SSH profile '${profile.name}'. Error: ${err.message}`;
              break;
            }
          } else {
            setLastText(`SSH profile '${action.profile_name}' not found.`);
            rejectedReason = `System Error: SSH profile '${action.profile_name}' not found.`;
            break;
          }
        } else if (action.type === 'execute_ui_action' || action.action) {
          const actionName = action.action || action.type;
          
          if (actionName.startsWith('tunnel_port||')) {
            const portStr = actionName.split('||')[1];
            const port = parseInt(portStr);
            const store = useStore.getState();
            store.setActiveSidebarTab('ports');
            setLastText(`Tunneling port ${port}...`);
            try {
              await store.startTunnel(port, null);
              setLastText(`Tunnel started for port ${port}`);
              executedCommands.push(`Tunnel started for port ${port}`);
            } catch (err) {
              setLastText(`Tunnel failed: ${err.message}`);
              rejectedReason = `System Error: Failed to start tunnel for port ${port}. Error: ${err.message}`;
              break;
            }
          } else if (actionName.startsWith('env_switch_profile||')) {
            const profileName = actionName.split('||')[1];
            const store = useStore.getState();
            store.setActiveSidebarTab('env');
            
            const targetFile = store.envFiles.find(f => f.profileName === profileName);
            if (!targetFile) {
              setLastText(`Environment profile '${profileName}' not found.`);
              rejectedReason = `System Error: Environment profile '${profileName}' not found.`;
              break;
            }

            // Must request approval
            const actionId = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `action-${new Date().getTime()}`;
            store.setPendingCommand({
              command: `Switch active .env to profile: ${profileName}`,
              sessionId: useStore.getState().focusedPane || 'global',
              actionId: actionId
            });

            const resolution = await new Promise((resolve) => {
              const handler = (eventArg) => {
                if (eventArg.detail.actionId === actionId) {
                  window.removeEventListener('nexus-agent-approval', handler);
                  resolve(eventArg.detail);
                }
              };
              window.addEventListener('nexus-agent-approval', handler);
            });

            if (resolution.approved) {
              setLastText(`Switching env to ${profileName}...`);
              try {
                const token = new URLSearchParams(window.location.search).get('token');
                const cwd = store.sessions.find(s => s.id === store.focusedPane)?.cwd;
                const url = new URL('/api/env/switch', window.location.origin);
                url.searchParams.set('token', token);
                if (cwd) url.searchParams.set('cwd', cwd);
                
                await fetch(url.toString(), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: targetFile.id })
                });
                
                await store.fetchEnvFiles(cwd);
                setLastText(`Switched to ${profileName}`);
                executedCommands.push(`Switched env to ${profileName}`);
              } catch (err) {
                setLastText(`Switch failed: ${err.message}`);
                rejectedReason = `System Error: Failed to switch env profile. Error: ${err.message}`;
                break;
              }
            } else {
              setLastText("Action rejected.");
              rejectedReason = resolution.reason;
              break;
            }
          } else {
            window.dispatchEvent(new CustomEvent('nexus-ui-action', { detail: actionName }));
            await new Promise(r => setTimeout(r, 400));
          }
        } else if (action.type === 'text_response') {
          setLastText(action.response || data.text);
          responseToSpeak = action.response;
        }
      }
      
      // ReAct Loop Orchestration
      if (rejectedReason) {
        processReActLoop(rejectedReason);
      } else if (executedCommands.length > 0) {
        processReActLoop(`System Note: The following commands were executed: [${executedCommands.join(', ')}]. Read the terminal output and decide if you need to run another command to complete the user's request, or use text_response to finish.`);
      } else if (responseToSpeak) {
        speak(responseToSpeak);
      } else {
        if (status !== 'listening' && status !== 'thinking') {
           setTimeout(() => setStatus('idle'), 3000);
        }
      }
    } else {
      if (status !== 'listening' && status !== 'thinking') {
         setTimeout(() => setStatus('idle'), 3000);
      }
    }
  };

  const { startRecording, stopRecording } = useAudioCapture(onAudioReady);

  const handleClick = () => {
    // Prevent click logic if we just finished dragging
    if (isDragging) return;

    if (status === 'unconfigured') {
      setSettingsOpen(true);
      return;
    }
    
    if (status === 'speaking') {
      window.speechSynthesis.cancel();
      setStatus('idle');
      return;
    }

    if (status === 'idle') {
      startRecording();
      setStatus('listening');
      setLastText('Listening...');
    } else if (status === 'listening') {
      stopRecording();
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'listening': return 'var(--ctp-green)';
      case 'thinking': return 'var(--ctp-yellow)';
      case 'speaking': return 'var(--ctp-blue)';
      case 'unconfigured': return 'var(--ctp-overlay0)';
      default: return 'var(--ctp-blue)';
    }
  };

  const color = getStatusColor();
  const isActive = status === 'listening' || status === 'speaking' || status === 'thinking';
  const isSpeakingOrListening = status === 'listening' || status === 'speaking';

  return (
    <Motion.div 
      className="fixed z-[100]"
      style={{ bottom: '40px', left: '50%' }}
      drag
      dragMomentum={false}
      dragElastic={0.1}
      whileDrag={{ scale: 1.05, cursor: "grabbing" }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => {
        // Delay resetting isDragging so the click event doesn't fire immediately
        setTimeout(() => setIsDragging(false), 150);
      }}
    >
      <div className="relative flex items-center justify-center -translate-x-1/2">
        {/* JARVIS-style Complex Wave Rings & Arcs */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          
          {/* Outer slow breathing ring */}
          <div 
            className={`absolute w-36 h-36 rounded-full border border-ctp-surface1 opacity-20 transition-all duration-1000 ${isActive ? 'scale-110 animate-[pulse_4s_ease-in-out_infinite]' : 'scale-90 opacity-0'}`} 
          />

          {/* Dynamic expanding rings (Ping) */}
          {isSpeakingOrListening && (
            <>
              <div className="absolute w-32 h-32 rounded-full opacity-20 animate-[ping_2s_infinite]" style={{ backgroundColor: color }} />
              <div className="absolute w-24 h-24 rounded-full opacity-30 animate-[ping_1.5s_infinite]" style={{ backgroundColor: color, animationDelay: '0.4s' }} />
            </>
          )}

          {/* Multi-layered Rotating Segmented Arcs (SVG) */}
          {isActive && (
            <div className="absolute inset-[-30px]">
              <svg className={`w-full h-full ${status === 'speaking' ? 'animate-[spin_3s_linear_infinite]' : 'animate-[spin_8s_linear_infinite]'}`} viewBox="0 0 100 100">
                {/* Layer 1: Inner thick segmented arc */}
                <circle cx="50" cy="50" r="38" fill="none" stroke={color} strokeWidth="3" strokeDasharray="30 150" className="opacity-80" />
                <circle cx="50" cy="50" r="38" fill="none" stroke={color} strokeWidth="2" strokeDasharray="15 200" strokeDashoffset="120" className="opacity-90" />

                {/* Layer 2: Middle reverse spinning arc */}
                <g className={`origin-center ${status === 'speaking' ? 'animate-[spin_4s_linear_reverse_infinite]' : 'animate-[spin_12s_linear_reverse_infinite]'}`}>
                  <circle cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth="2" strokeDasharray="40 120" className="opacity-50" />
                  <circle cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth="1" strokeDasharray="10 180" strokeDashoffset="80" className="opacity-70" />
                </g>

                {/* Layer 3: Outer slow thin arc */}
                <g className="origin-center" style={{ transform: 'rotate(-45deg)' }}>
                  <circle cx="50" cy="50" r="50" fill="none" stroke={color} strokeWidth="0.5" strokeDasharray="80 150" className="opacity-30" />
                  <circle cx="50" cy="50" r="50" fill="none" stroke={color} strokeWidth="1" strokeDasharray="10 200" strokeDashoffset="60" className="opacity-50" />
                </g>
              </svg>
            </div>
          )}
          </div>

          {/* Main Orb */}
          <div 
          onClick={handleClick}
          className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 z-10 shadow-2xl ${
            isDragging ? 'cursor-grabbing' : 'cursor-pointer'
          } ${
            status === 'listening' ? 'scale-110' : 
            status === 'thinking' ? 'animate-pulse scale-95' : 
            status === 'speaking' ? 'scale-105' :
            status === 'unconfigured' ? 'grayscale' :
            !isDragging ? 'hover:scale-105 active:scale-95' : ''
          }`}
          style={{
            backgroundColor: 'var(--ctp-crust)', // The dark Void center
            border: `2px solid color-mix(in srgb, ${color} 60%, transparent)`,
            boxShadow: `0 0 50px color-mix(in srgb, ${color} ${isSpeakingOrListening ? '80%' : '30%'}, transparent)`
          }}
          >
          {/* Core Ring Structure (Instead of Icon) */}
          <div className="absolute inset-2 rounded-full border border-ctp-surface0 opacity-30" />
          <div className="absolute inset-4 rounded-full border border-ctp-surface1 opacity-20" />

          {/* Deep Glowing Center Core */}
          <div 
            className={`absolute w-10 h-10 rounded-full blur-xl transition-all duration-500 ${
              status === 'speaking' ? 'opacity-80 animate-pulse' : 
              isActive ? 'opacity-60' : 'opacity-10'
            }`}
            style={{ backgroundColor: color }}
          />

          {/* Central Activity Indicator (Replaces Mic) */}
          <div className="relative z-20 pointer-events-none flex items-center justify-center w-full h-full">
            {status === 'thinking' ? (
               <div className="w-8 h-8 rounded-full border-t-2 border-ctp-crust animate-spin" style={{ borderColor: 'transparent', borderTopColor: color, borderRightColor: color }} />
            ) : status === 'listening' ? (
               <div className="w-4 h-4 rounded-full animate-ping" style={{ backgroundColor: color }} />
            ) : status === 'speaking' ? (
               <div className="w-6 h-6 rounded-full animate-pulse" style={{ backgroundColor: color, boxShadow: `0 0 20px ${color}` }} />
            ) : status === 'unconfigured' ? (
               <div className="w-3 h-3 rounded-full bg-ctp-surface2" />
            ) : (
               <div className="w-3 h-3 rounded-full opacity-50" style={{ backgroundColor: color }} />
            )}
          </div>

          {/* Subtitles / Text Box */}
          {lastText && (
            <div 
              className="absolute bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-sm font-medium shadow-2xl border transition-all animate-in fade-in slide-in-from-bottom-2 pointer-events-none whitespace-normal break-words w-72 md:w-96 text-center leading-relaxed" 
              style={{ 
                backgroundColor: 'color-mix(in srgb, var(--ctp-mantle) 85%, transparent)', 
                color: 'var(--ctp-text)', 
                borderColor: 'color-mix(in srgb, var(--ctp-surface1) 50%, transparent)',
                backdropFilter: 'blur(12px)'
              }}
            >
              <TypewriterText text={lastText} />
              {/* Little pointer triangle */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45 border-r border-b" 
                style={{ 
                  backgroundColor: 'color-mix(in srgb, var(--ctp-mantle) 85%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--ctp-surface1) 50%, transparent)'
                }} 
              />
            </div>
          )}
        </div>
      </div>
    </Motion.div>
  );
}