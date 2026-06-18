import React, { useEffect, useState } from 'react';
import TabBar from './components/TabBar';
import TerminalGrid from './components/TerminalGrid';
import FileManager from './components/FileManager';
import GitPanel from './components/GitPanel';
import ActivityBar from './components/ActivityBar';
import SnippetsPanel from './components/SnippetsPanel';
import SSHPanel from './components/SSHPanel';
import PortManagerPanel from './components/PortManagerPanel';
import EnvManagerPanel from './components/EnvManagerPanel';
import SSHProfileModal from './components/SSHProfileModal';
import CommandPalette from './components/CommandPalette';
import ErrorBoundary from './components/ErrorBoundary';
import SystemMonitor from './components/SystemMonitor';
import VoiceOrb from './components/VoiceOrb/VoiceOrb';
import SettingsModal from './components/SettingsModal';
import ApprovalModal from './components/ApprovalModal';
import { useStore } from './store';
import { applyTheme } from './themes';
import { Toaster } from 'sonner';

function App() {
  const [isSshModalOpen, setIsSshModalOpen] = useState(false);
  const [profileToEdit, setProfileToEdit] = useState(null);

  const sessions = useStore(state => state.sessions);
  const focusedPane = useStore(state => state.focusedPane);
  const createSession = useStore(state => state.createSession);
  const theme = useStore(state => state.theme);
  const setTheme = useStore(state => state.setTheme);
  const setSettingsOpen = useStore(state => state.setSettingsOpen);
  const toggleSidebar = useStore(state => state.toggleSidebar);
  const setActiveSidebarTab = useStore(state => state.setActiveSidebarTab);
  const isSidebarOpen = useStore(state => state.isSidebarOpen);
  const removeSession = useStore(state => state.removeSession);
  const removeEditor = useStore(state => state.removeEditor);

  useEffect(() => {
    // Apply theme via runtime CSS variable injection
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const handleUiAction = async (e) => {
      const action = e.detail;
      
      if (typeof action === 'string' && action.startsWith('ssh_connect||')) {
        const profileName = action.split('||')[1];
        const store = useStore.getState();
        const profile = store.sshProfiles.find(p => p.name.toLowerCase() === profileName.toLowerCase());
        if (profile) {
          try {
            await store.connectToSshProfile(profile.id);
            store.setActiveSidebarTab('ssh'); // Open sidebar to show status
          } catch (err) {
            console.error('AI SSH connection failed', err);
          }
        }
        return;
      }

      switch(action) {
        case 'split_horizontal':
        case 'split_vertical':
          createSession();
          break;
        case 'toggle_file_manager':
          if (!isSidebarOpen) toggleSidebar();
          setActiveSidebarTab('explorer');
          break;
        case 'open_settings':
          setSettingsOpen(true);
          break;
        case 'toggle_theme':
          setTheme(theme === 'catppuccin-latte' ? 'catppuccin-mocha' : 'catppuccin-latte');
          break;
        case 'close_tab': {
          const currentId = useStore.getState().focusedPane;
          if (currentId) {
            removeSession(currentId);
            removeEditor(currentId);
          }
          break;
        }
        case 'clear_terminal': {
          const activeSessionId = useStore.getState().focusedPane;
          if (activeSessionId) {
            window.dispatchEvent(new CustomEvent(`NEXUS_ACTION_${activeSessionId}`, { detail: 'clear' }));
          }
          break;
        }
      }
    };

    window.addEventListener('nexus-ui-action', handleUiAction);
    return () => window.removeEventListener('nexus-ui-action', handleUiAction);
  }, [createSession, toggleSidebar, setActiveSidebarTab, isSidebarOpen, setSettingsOpen, theme, setTheme, removeSession, removeEditor]);

  useEffect(() => {
    // Create initial session if none exists
    if (sessions.length === 0) {
      createSession();
    }
  }, [sessions.length, createSession]);

  const focusedSession = sessions.find(s => s.id === focusedPane);

  return (
    <ErrorBoundary>
      <Toaster theme={theme === 'catppuccin-latte' || theme === 'gruvbox-light' ? 'light' : 'dark'} position="bottom-right" richColors />
      <div className="flex flex-col w-full h-full bg-ctp-crust text-ctp-text">        <TabBar />

        <header className="bg-ctp-mantle text-xs py-1 px-4 flex gap-4 text-ctp-subtext0 border-b border-ctp-surface0 min-h-[24px] items-center shrink-0">
          {focusedSession ? (
            <>
              <span className="truncate">📁 {focusedSession.pwd}</span>
              {focusedSession.gitStatus && (
                <span className="text-ctp-green shrink-0">
                  🌿 on branch: {focusedSession.gitStatus.branch} {focusedSession.gitStatus.changedFiles > 0 ? `[+${focusedSession.gitStatus.changedFiles}]` : ''}
                </span>
              )}
            </>
          ) : (
            <span>No terminal focused</span>
          )}
          <div className="ml-auto flex gap-4 text-[#6c7086]">
            <SystemMonitor />
          </div>
        </header>

        <main className="flex-1 overflow-hidden relative flex">
          <ActivityBar />
          <FileManager />
          <GitPanel />
          <SnippetsPanel />
          <SSHPanel onNewProfile={() => { setProfileToEdit(null); setIsSshModalOpen(true); }} onEditProfile={(p) => { setProfileToEdit(p); setIsSshModalOpen(true); }} />
          <PortManagerPanel />
          <EnvManagerPanel />
          <div className="flex-1 overflow-hidden relative">
            <TerminalGrid />
          </div>
        </main>
        <CommandPalette />
        <VoiceOrb />
        <ApprovalModal />
        <SSHProfileModal isOpen={isSshModalOpen} onClose={() => setIsSshModalOpen(false)} profileToEdit={profileToEdit} />
        <SettingsModal />
      </div>
    </ErrorBoundary>
  );
}

export default App;