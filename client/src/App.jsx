import React, { useEffect } from 'react';
import TabBar from './components/TabBar';
import TerminalGrid from './components/TerminalGrid';
import { useStore } from './store';

function App() {
  const { sessions, focusedPane, createSession } = useStore();

  useEffect(() => {
    // Create initial session if none exists
    if (sessions.length === 0) {
      createSession();
    }
  }, [sessions.length, createSession]);

  const focusedSession = sessions.find(s => s.id === focusedPane);

  return (
    <div className="flex flex-col w-full h-full bg-[#11111b] text-white">
      <TabBar />

      <header className="bg-[#181825] text-xs py-1 px-4 flex gap-4 text-[#a6adc8] border-b border-[#313244] min-h-[24px] items-center">
        {focusedSession ? (
          <>
            <span className="truncate">📁 {focusedSession.pwd}</span>
            {focusedSession.gitStatus && (
              <span className="text-[#a6e3a1] shrink-0">
                🌿 on branch: {focusedSession.gitStatus.branch} {focusedSession.gitStatus.changedFiles > 0 ? `[+${focusedSession.gitStatus.changedFiles}]` : ''}
              </span>
            )}
          </>
        ) : (
          <span>No terminal focused</span>
        )}
      </header>

      <main className="flex-1 overflow-hidden relative">
        <TerminalGrid />
      </main>
    </div>
  );
}

export default App;
