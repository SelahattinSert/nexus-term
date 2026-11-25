import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic } from 'lucide-react';
import { useAudioCapture } from './useAudioCapture';
import { useStore } from '../../store';
import { motion as Motion, useReducedMotion } from 'framer-motion';
import { waitForCommandCompletion } from '../../hooks/useControlChannel';
import { themes } from '../../themes';
import { useOrbMood } from './useOrbMood';
import { getMood } from './orbMoods';
import TranscriptConfirm from './TranscriptConfirm';
import { preloadStt, subscribeSttStatus, transcribe } from '../../voice/stt';
import { sttModelFromConfig } from '../../voice/sttConfig';
import { correctTranscript, buildHints } from '../../voice/voiceCorrection';
import { speak as speakText, stopSpeaking, preloadVoice, defaultVoiceFor, SYSTEM_VOICE } from '../../voice/tts';

/** Shows the approval card and resolves with { approved, reason }. */
function askApproval(command, sessionId) {
  const actionId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `action-${Date.now()}`;
  useStore.getState().setPendingCommand({ command, sessionId: sessionId || 'global', actionId });
  return new Promise((resolve) => {
    const handler = (eventArg) => {
      if (eventArg.detail.actionId === actionId) {
        window.removeEventListener('nexus-agent-approval', handler);
        resolve(eventArg.detail);
      }
    };
    window.addEventListener('nexus-agent-approval', handler);
  });
}

/** Strips control characters the same way the server does before typing, so the approval card shows exactly what runs. */
function sanitizeCommand(command) {
  // eslint-disable-next-line no-control-regex
  return String(command || '').replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}

/** Maps tool calls onto the action names handled below (also accepts the legacy "name||arg" strings). */
function normalizeAction(action) {
  if (action.type === 'tunnel_port') return { type: 'execute_ui_action', action: `tunnel_port||${action.port}` };
  if (action.type === 'env_switch_profile') return { type: 'execute_ui_action', action: `env_switch_profile||${action.profile_name}` };
  return action;
}

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
  const [liveText, setLiveText] = useState('');           // partial transcript while speaking
  const [pendingTranscript, setPendingTranscript] = useState(null); // { text, raw, corrections } awaiting confirmation
  const [sttStatus, setSttStatus] = useState(null);
  const voiceContextRef = useRef({});                      // words that exist in this terminal (scripts, files, ...)
  
  const setSettingsOpen = useStore(state => state.setSettingsOpen);
  const aiConfig = useStore(state => state.aiConfig);
  const setAiConfig = useStore(state => state.setAiConfig);
  const themeId = useStore(state => state.theme);
  const { mood, label: moodLabel, pulseKey } = useOrbMood();
  const reduceMotion = useReducedMotion();

  // --- TTS: local neural voice (Piper), falling back to the browser's speech engine ---
  const speak = (text) => {
    const language = aiConfig?.whisperLanguage || 'auto';
    speakText(text, {
      voiceId: aiConfig?.piperVoice || defaultVoiceFor(language),
      systemVoiceURI: aiConfig?.ttsVoice || undefined,
      lang: language === 'auto' ? undefined : language,
      rate: 1.05,
      onStart: () => setStatus('speaking'),
      onEnd: () => setStatus('idle'),
    }).catch(() => setStatus('idle'));
  };

  // Download the chosen voice in the background so the first answer is spoken without delay
  useEffect(() => {
    if (!aiConfig?.provider) return;
    const voiceId = aiConfig.piperVoice || defaultVoiceFor(aiConfig.whisperLanguage || 'auto');
    if (voiceId !== SYSTEM_VOICE) preloadVoice(voiceId).catch(() => {});
  }, [aiConfig?.provider, aiConfig?.piperVoice, aiConfig?.whisperLanguage]);

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

  const sttModel = sttModelFromConfig(aiConfig?.whisperModel);
  const sttLanguage = aiConfig?.whisperLanguage || 'auto';

  // Load the speech model in the background as soon as the assistant is configured,
  // so the first spoken request does not wait for the download/compile.
  useEffect(() => {
    if (!aiConfig?.provider) return;
    preloadStt({ model: sttModel }).catch(() => {});
  }, [aiConfig?.provider, sttModel]);

  useEffect(() => subscribeSttStatus(setSttStatus), []);

  const loadVoiceContext = useCallback(async () => {
    const token = new URLSearchParams(window.location.search).get('token');
    const sid = useStore.getState().focusedPane;
    try {
      const res = await fetch(`/api/voice/context?token=${token}${sid ? `&sessionId=${encodeURIComponent(sid)}` : ''}`);
      const ctx = await res.json();
      voiceContextRef.current = { ...ctx, executables: useStore.getState().executables || [] };
    } catch {
      voiceContextRef.current = { executables: useStore.getState().executables || [] };
    }
  }, []);

  const getSttOptions = useCallback(() => ({
    model: sttModel,
    language: sttLanguage,
    hints: buildHints(voiceContextRef.current),
  }), [sttModel, sttLanguage]);

  const onFinalAudio = async (audio) => {
    setLiveText('');
    if (!audio || audio.length === 0) {
      setLastText("I didn't catch that.");
      setTimeout(() => setStatus('idle'), 1500);
      return;
    }
    setStatus('thinking');
    setLastText('Transcribing…');
    try {
      const { text } = await transcribe(audio, getSttOptions());
      if (!text || !text.trim()) {
        setLastText("I didn't catch that.");
        setTimeout(() => setStatus('idle'), 1500);
        return;
      }
      const corrected = correctTranscript(text, voiceContextRef.current);
      setLastText('');
      setPendingTranscript({ raw: text.trim(), ...corrected });
    } catch (err) {
      console.error(err);
      setLastText(`Speech recognition failed: ${err.message}`);
      setTimeout(() => setStatus('idle'), 2500);
    }
  };

  const sendTranscript = async (text) => {
    const transcriptInfo = pendingTranscript;
    setPendingTranscript(null);
    setStatus('thinking');
    setLastText(text);
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const sid = useStore.getState().focusedPane;
      const res = await fetch(`/api/voice/text?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          sessionId: sid,
          raw: transcriptInfo?.raw,
          corrections: text === transcriptInfo?.text ? transcriptInfo?.corrections : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      handleAgentResponse(data);
    } catch (err) {
      console.error(err);
      setLastText('Error occurred!');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const cancelTranscript = () => {
    setPendingTranscript(null);
    setLastText('');
    setStatus('idle');
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

    const memoryUsed = data.memoryUsed || data.action?.memoryUsed;
    if (memoryUsed) {
      const { solutionSummary, useCount } = memoryUsed;
      const msg = `${solutionSummary} (used ${useCount}×)`;
      useStore.getState().showMemoryNotification(msg);
      setTimeout(() => {
        useStore.getState().hideMemoryNotification();
      }, 5000);
    }
    
    if (data.action) {
      const actions = data.action.type === 'multi_action' ? data.action.actions : [data.action];
      let responseToSpeak = "";
      let executedCommands = [];
      let rejectedReason = null;
      
      for (const rawAction of actions) {
        const action = normalizeAction(rawAction);
        if (action.command) action.command = sanitizeCommand(action.command);
        if (action.type === 'execute_terminal_command') {
          const sid = useStore.getState().focusedPane;
          if (!sid) {
            setLastText("No active terminal.");
            continue;
          }

          const executeCommand = async () => {
            setLastText(`Executing: ${action.command}`);
            // Start listening for completion before the command is typed.
            // Long-running commands (dev servers, watchers) are reported as still running after 30 s.
            const completion = waitForCommandCompletion(sid, { timeoutMs: 30000 });
            window.dispatchEvent(new CustomEvent('nexus-execute-command', { 
              detail: { sessionId: sid, command: action.command } 
            }));
            
            setStatus('listening'); // Pulse to show it's reading
            const result = await completion;
            if (result.integrated && result.blocks.length) {
              const codes = result.blocks.map(b => b.exitCode).join(', ');
              executedCommands.push(`${action.command} (exit code: ${codes})`);
            } else if (result.timedOut) {
              executedCommands.push(`${action.command} (still running)`);
            } else {
              executedCommands.push(action.command);
            }
          };

          // Auto-execute never applies to SSH tabs: commands there run on a remote server
          const targetIsSsh = !!useStore.getState().sessions.find(s => s.id === sid)?.isSsh;
          if (aiConfig?.autoExecute && !targetIsSsh) {
            await executeCommand();
          } else {
            // Ask for permission via Zustand store -> ApprovalModal
            const sshName = targetIsSsh ? useStore.getState().sessions.find(s => s.id === sid)?.name : null;
            const resolution = await askApproval(targetIsSsh ? `[SSH ${sshName || 'remote'}] ${action.command}` : action.command, sid);

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
            // Remote commands always need explicit approval, even with auto-execute enabled
            const resolution = await askApproval(`[SSH ${profile.name}] ${action.command}`, null);
            if (!resolution.approved) {
              setLastText("Command rejected.");
              rejectedReason = resolution.reason;
              break;
            }
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
            const port = parseInt(portStr, 10);
            // Exposing a port to the internet always needs explicit approval
            const resolution = await askApproval(`Expose local port ${port} to the internet (public tunnel)`, null);
            if (!resolution.approved) {
              setLastText("Action rejected.");
              rejectedReason = resolution.reason;
              break;
            }
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

  const { startRecording, stopRecording } = useAudioCapture({
    onPartial: setLiveText,
    onFinal: onFinalAudio,
    getOptions: getSttOptions,
  });

  const handleClick = () => {
    // Prevent click logic if we just finished dragging
    if (isDragging) return;

    if (status === 'unconfigured') {
      setSettingsOpen(true);
      return;
    }
    
    if (status === 'speaking') {
      stopSpeaking();
      setStatus('idle');
      return;
    }

    if (status === 'idle') {
      setPendingTranscript(null);
      setLiveText('');
      loadVoiceContext(); // fills the hint/correction vocabulary while the user starts speaking
      startRecording();
      setStatus('listening');
      setLastText(sttStatus?.state === 'downloading'
        ? `Listening… (speech model downloading ${Math.round((sttStatus.progress || 0) * 100)}%)`
        : 'Listening...');
    } else if (status === 'listening') {
      stopRecording();
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'listening': return 'var(--ctp-green)';
      case 'thinking': return 'var(--ctp-yellow)';
      case 'speaking': return 'var(--ctp-blue)';
      case 'unconfigured': return 'var(--ctp-overlay0, var(--ctp-surface2))';
      default: return 'var(--ctp-blue)';
    }
  };

  // Active voice statuses (listening/thinking/speaking) win over terminal moods. "unconfigured" is
  // passive, so moods still show for users who never set up an AI provider.
  const moodActive = (status === 'idle' || status === 'unconfigured') && mood !== 'idle';
  const moodDef = getMood(moodActive ? mood : 'idle');
  const color = moodActive ? moodDef.colorVar : getStatusColor();
  // Light themes need softer glows: the same color-mix percentage reads much stronger on a light base
  const isLightTheme = themes[themeId]?.category === 'light';
  const moodGlowPct = Math.round(moodDef.glow * 100 * (isLightTheme ? 0.65 : 1));
  const showMoodArcs = moodActive && moodDef.spinSeconds > 0;
  const showMoodPulse = moodActive && moodDef.pulseSeconds > 0;
  const showMoodBurst = moodActive && !!moodDef.burst && !reduceMotion;
  const orbTitle = moodActive ? moodLabel : (
    status === 'unconfigured' ? 'Voice assistant not configured' :
    status === 'listening' ? 'Listening…' :
    status === 'thinking' ? 'Thinking…' :
    status === 'speaking' ? 'Speaking…' : 'Voice assistant'
  );
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
            className={`absolute w-36 h-36 rounded-full border border-ctp-surface1 opacity-20 transition-all duration-1000 motion-reduce:transition-none ${isActive ? 'scale-110 animate-[pulse_4s_ease-in-out_infinite] motion-reduce:animate-none' : 'scale-90 opacity-0'}`} 
          />

          {/* Dynamic expanding rings (Ping) */}
          {isSpeakingOrListening && (
            <>
              <div className="absolute w-32 h-32 rounded-full opacity-20 animate-[ping_2s_infinite] motion-reduce:animate-none" style={{ backgroundColor: color }} />
              <div className="absolute w-24 h-24 rounded-full opacity-30 animate-[ping_1.5s_infinite] motion-reduce:animate-none" style={{ backgroundColor: color, animationDelay: '0.4s' }} />
            </>
          )}

          {/* Mood glow: breathes at the mood's rhythm (static when reduced motion is preferred) */}
          {showMoodPulse && (
            <Motion.div
              className="absolute w-32 h-32 rounded-full"
              style={{ background: `radial-gradient(circle, color-mix(in srgb, ${color} ${moodGlowPct}%, transparent) 0%, transparent 70%)` }}
              initial={false}
              animate={reduceMotion ? { opacity: 0.8, scale: 1 } : { opacity: [0.45, 1, 0.45], scale: [0.95, 1.06, 0.95] }}
              transition={reduceMotion ? { duration: 0.3 } : { duration: moodDef.pulseSeconds, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}

          {/* Mood arcs: rotation speed follows the mood */}
          {showMoodArcs && (
            <div className="absolute inset-[-20px] opacity-70">
              <svg
                className="w-full h-full"
                viewBox="0 0 100 100"
                style={reduceMotion ? undefined : { animation: `spin ${moodDef.spinSeconds}s linear infinite` }}
              >
                <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="2" strokeDasharray="24 160" className="opacity-80" />
                <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="1" strokeDasharray="10 200" strokeDashoffset="110" className="opacity-60" />
                <circle cx="50" cy="50" r="46" fill="none" stroke={color} strokeWidth="0.5" strokeDasharray="60 150" strokeDashoffset="40" className="opacity-40" />
              </svg>
            </div>
          )}

          {/* Transient burst (error / success): plays once per event, then decays */}
          {showMoodBurst && (
            <Motion.div
              key={`${mood}-${pulseKey}`}
              className="absolute w-24 h-24 rounded-full"
              style={{ border: `2px solid ${color}`, backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
              initial={{ scale: 1, opacity: 0.8 }}
              animate={{ scale: 1.7, opacity: 0 }}
              transition={{ duration: moodDef.burst.seconds, repeat: moodDef.burst.repeat, ease: 'easeOut' }}
            />
          )}

          {/* Multi-layered Rotating Segmented Arcs (SVG) */}
          {isActive && (
            <div className="absolute inset-[-30px]">
              <svg className={`w-full h-full ${status === 'speaking' ? 'animate-[spin_3s_linear_infinite]' : 'animate-[spin_8s_linear_infinite]'} motion-reduce:animate-none`} viewBox="0 0 100 100">
                {/* Layer 1: Inner thick segmented arc */}
                <circle cx="50" cy="50" r="38" fill="none" stroke={color} strokeWidth="3" strokeDasharray="30 150" className="opacity-80" />
                <circle cx="50" cy="50" r="38" fill="none" stroke={color} strokeWidth="2" strokeDasharray="15 200" strokeDashoffset="120" className="opacity-90" />

                {/* Layer 2: Middle reverse spinning arc */}
                <g className={`origin-center ${status === 'speaking' ? 'animate-[spin_4s_linear_reverse_infinite]' : 'animate-[spin_12s_linear_reverse_infinite]'} motion-reduce:animate-none`}>
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
          title={orbTitle}
          aria-label={orbTitle}
          className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 motion-reduce:transition-none motion-reduce:animate-none z-10 shadow-2xl ${
            isDragging ? 'cursor-grabbing' : 'cursor-pointer'
          } ${
            status === 'listening' ? 'scale-110' : 
            status === 'thinking' ? 'animate-pulse scale-95' : 
            status === 'speaking' ? 'scale-105' :
            status === 'unconfigured' && !moodActive ? 'grayscale' :
            !isDragging ? 'hover:scale-105 active:scale-95' : ''
          }`}
          style={{
            backgroundColor: 'var(--ctp-crust)', // The dark Void center
            border: `2px solid color-mix(in srgb, ${color} 60%, transparent)`,
            boxShadow: `0 0 50px color-mix(in srgb, ${color} ${isSpeakingOrListening ? '80%' : moodActive ? `${moodGlowPct}%` : '30%'}, transparent)`
          }}
          >
          {/* Core Ring Structure (Instead of Icon) */}
          <div className="absolute inset-2 rounded-full border border-ctp-surface0 opacity-30" />
          <div className="absolute inset-4 rounded-full border border-ctp-surface1 opacity-20" />

          {/* Deep Glowing Center Core */}
          <div 
            className={`absolute w-10 h-10 rounded-full blur-xl transition-all duration-500 motion-reduce:transition-none motion-reduce:animate-none ${
              status === 'speaking' ? 'opacity-80 animate-pulse' : 
              isActive ? 'opacity-60' : moodActive ? 'opacity-40' : 'opacity-10'
            }`}
            style={{ backgroundColor: color }}
          />

          {/* Central Activity Indicator (Replaces Mic) */}
          <div className="relative z-20 pointer-events-none flex items-center justify-center w-full h-full">
            {status === 'thinking' ? (
               <div className="w-8 h-8 rounded-full border-t-2 border-ctp-crust animate-spin motion-reduce:animate-none" style={{ borderColor: 'transparent', borderTopColor: color, borderRightColor: color }} />
            ) : status === 'listening' ? (
               <div className="w-4 h-4 rounded-full animate-ping motion-reduce:animate-none" style={{ backgroundColor: color }} />
            ) : status === 'speaking' ? (
               <div className="w-6 h-6 rounded-full animate-pulse motion-reduce:animate-none" style={{ backgroundColor: color, boxShadow: `0 0 20px ${color}` }} />
            ) : status === 'unconfigured' && !moodActive ? (
               <div className="w-3 h-3 rounded-full bg-ctp-surface2" />
            ) : (
               <div className={`w-3 h-3 rounded-full transition-colors duration-500 motion-reduce:transition-none ${moodActive ? 'opacity-90' : 'opacity-50'}`} style={{ backgroundColor: color }} />
            )}
          </div>

          {pendingTranscript && (
            <TranscriptConfirm
              key={pendingTranscript.raw}
              transcript={pendingTranscript}
              onSend={sendTranscript}
              onCancel={cancelTranscript}
            />
          )}

          {/* Subtitles / Text Box (live transcript while listening) */}
          {(lastText || liveText) && !pendingTranscript && (
            <div 
              className="absolute bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-sm font-medium shadow-2xl border transition-all animate-in fade-in slide-in-from-bottom-2 motion-reduce:transition-none motion-reduce:animate-none pointer-events-none whitespace-normal break-words w-72 md:w-96 text-center leading-relaxed" 
              style={{ 
                backgroundColor: 'color-mix(in srgb, var(--ctp-mantle) 85%, transparent)', 
                color: 'var(--ctp-text)', 
                borderColor: 'color-mix(in srgb, var(--ctp-surface1) 50%, transparent)',
                backdropFilter: 'blur(12px)'
              }}
            >
              {status === 'listening' && liveText
                ? <span aria-live="polite" className="italic">{liveText}</span>
                : <TypewriterText text={lastText} />}
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

        {/* Subtle mood caption under the orb */}
        <div
          className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none text-[11px] leading-none flex items-center gap-1.5 transition-opacity duration-500 motion-reduce:transition-none"
          style={{ color: 'color-mix(in srgb, var(--ctp-text) 70%, transparent)', opacity: moodActive && moodLabel ? 1 : 0 }}
          aria-live="polite"
        >
          {moodActive && moodLabel && (
            <>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
              {moodLabel}
            </>
          )}
        </div>
      </div>
    </Motion.div>
  );
}