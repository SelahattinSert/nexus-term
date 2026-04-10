import React, { useState } from 'react';
import { useStore } from '../store';
import { GitBranch, Check, RefreshCw } from 'lucide-react';

export default function GitPanel() {
  const { sessions, focusedPane, isSidebarOpen, activeSidebarTab } = useStore();
  const focusedSession = sessions.find(s => s.id === focusedPane);
  const [isFetching, setIsFetching] = useState(false);

  if (!isSidebarOpen || activeSidebarTab !== 'git') return null;

  const gitStatus = focusedSession?.gitStatus;

  const handleBranchClick = (branch) => {
    if (!focusedSession || branch === gitStatus.branch) return;
    // Dispatch custom event to NexusTerm to execute checkout
    window.dispatchEvent(new CustomEvent(`NEXUS_ACTION_${focusedSession.id}`, { detail: `git checkout ${branch}` }));
  };

  const handleFetch = () => {
    if (!focusedSession) return;
    setIsFetching(true);
    window.dispatchEvent(new CustomEvent(`NEXUS_META_ACTION_${focusedSession.id}`, { detail: { type: 'GIT_FETCH' } }));
    setTimeout(() => setIsFetching(false), 2000);
  };

  return (
    <div className="w-64 flex-shrink-0 bg-[#181825] border-r border-[#313244] flex flex-col h-full overflow-hidden text-sm">
      <div className="p-3 border-b border-[#313244] bg-[#11111b] font-semibold text-[#cdd6f4] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch size={16} className="text-[#89b4fa]" />
          <span className="truncate">Source Control</span>
        </div>
        <button 
          onClick={handleFetch} 
          disabled={!gitStatus || isFetching}
          className={`p-1 rounded hover:bg-[#313244] transition-colors ${!gitStatus ? 'opacity-50 cursor-not-allowed' : 'text-[#a6adc8] hover:text-[#cdd6f4]'}`}
          title="Fetch from Remote"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="p-2 overflow-y-auto flex-1 scrollbar-thin">
        {!focusedSession ? (
          <div className="text-[#6c7086] text-xs italic p-4 text-center">Select a terminal</div>
        ) : !gitStatus ? (
          <div className="text-[#6c7086] text-xs italic p-4 text-center">Not a git repository</div>
        ) : (
          <div className="flex flex-col gap-4">
            
            {/* Local Branches Section */}
            <div>
              <div className="text-xs uppercase tracking-wider text-[#6c7086] font-semibold mb-2 px-1">Local Branches</div>
              <ul className="space-y-0.5">
                {gitStatus.branches?.map(branch => (
                  <li 
                    key={branch}
                    onClick={() => handleBranchClick(branch)}
                    className="flex items-center justify-between px-2 py-1.5 hover:bg-[#313244] rounded cursor-pointer text-[#cdd6f4] transition-colors group"
                  >
                    <span className={`truncate text-xs ${branch === gitStatus.branch ? 'font-bold text-[#89b4fa]' : ''}`}>
                      {branch}
                    </span>
                    {branch === gitStatus.branch && <Check size={14} className="text-[#a6e3a1]" />}
                  </li>
                ))}
              </ul>
            </div>

            {/* Remote Branches Section */}
            {gitStatus.remoteBranches && gitStatus.remoteBranches.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-[#6c7086] font-semibold mb-2 px-1">Remote Branches</div>
                <ul className="space-y-0.5">
                  {gitStatus.remoteBranches.map(branch => {
                    const checkoutName = branch.split('/').slice(1).join('/'); // origin/feat -> feat
                    return (
                      <li 
                        key={branch}
                        onClick={() => handleBranchClick(checkoutName)}
                        className="flex items-center justify-between px-2 py-1.5 hover:bg-[#313244] rounded cursor-pointer text-[#cdd6f4] transition-colors group opacity-80 hover:opacity-100"
                      >
                        <span className="truncate text-xs">
                          {branch}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Changes Section */}
            <div>
              <div className="text-xs uppercase tracking-wider text-[#6c7086] font-semibold mb-2 px-1 flex justify-between">
                <span>Changes</span>
                <span className="bg-[#313244] text-[#cdd6f4] px-1.5 rounded-full text-[10px]">{gitStatus.changedFiles}</span>
              </div>
              {gitStatus.files?.length === 0 ? (
                <div className="text-[#6c7086] text-xs italic px-2">No local changes</div>
              ) : (
                <ul className="space-y-0.5">
                  {gitStatus.files?.map((f, idx) => {
                    const isAdded = f.status.includes('A') || f.status === '??';
                    const isDeleted = f.status.includes('D');
                    const isModified = f.status.includes('M');
                    
                    let color = 'text-[#cdd6f4]';
                    if (isAdded) color = 'text-[#a6e3a1]'; // green
                    else if (isDeleted) color = 'text-[#f38ba8]'; // red
                    else if (isModified) color = 'text-[#f9e2af]'; // yellow

                    return (
                      <li key={idx} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#313244] rounded cursor-default transition-colors">
                        <span className={`text-[10px] font-bold w-4 text-center shrink-0 ${color}`}>
                          {f.status.trim()}
                        </span>
                        <span className={`truncate text-xs ${color}`} title={f.file}>{f.file}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}