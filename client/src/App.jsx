import React, { useEffect } from 'react';
import TabBar from './components/TabBar';
import TerminalGrid from './components/TerminalGrid';
import FileManager from './components/FileManager';
import GitPanel from './components/GitPanel';
import ActivityBar from './components/ActivityBar';
import SnippetsPanel from './components/SnippetsPanel';
import CommandPalette from './components/CommandPalette';
import ErrorBoundary from './components/ErrorBoundary';
import { useStore } from './store';
import { Toaster } from 'sonner';

function App() {
  const { sessions, focusedPane, createSession, systemStats, theme } = useStore();

  useEffect(() => {
    // Apply theme to document element
    document.documentElement.className = theme;
  }, [theme]);

  useEffect(() => {
    // Create initial session if none exists
    if (sessions.length === 0) {
      createSession();
    }
  }, [sessions.length, createSession]);

  const focusedSession = sessions.find(s => s.id === focusedPane);

  return (
    <ErrorBoundary>
      <Toaster theme="dark" position="bottom-right" richColors />
      <div className="flex flex-col w-full h-full bg-ctp-crust text-white">
        <TabBar />

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
            {systemStats && (
              <>
                <span title={`RAM: ${Math.round(systemStats.usedMem / 1073741824 * 10) / 10}GB / ${Math.round(systemStats.totalMem / 1073741824 * 10) / 10}GB`}>
                  🧠 {systemStats.ram}%
                </span>
                <span>
                  💻 {systemStats.cpu}%
                </span>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-hidden relative flex">
          <ActivityBar />
          <FileManager />
          <GitPanel />
          <SnippetsPanel />
          <div className="flex-1 overflow-hidden relative">
            <TerminalGrid />
          </div>
        </main>
        <CommandPalette />
      </div>
    </ErrorBoundary>
  );
}

export default App;