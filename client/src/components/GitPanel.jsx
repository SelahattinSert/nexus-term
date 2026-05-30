import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { GitBranch, GitCommit, GitPullRequest, RefreshCw, Plus, Minus, Check, X, AlertCircle } from 'lucide-react';
import { nexusFetchJSON } from '../utils/nexusFetch';
import { toast } from 'sonner';

export default function GitPanel() {
  const { sessions, focusedPane, isSidebarOpen, activeSidebarTab, addError, createEditor } = useStore();
  const [gitStatus, setGitStatus] = useState(null);
  const [isFetching, setIsFetching] = useState(false);

  const focusedSession = sessions.find(s => s.id === focusedPane);
  const activeTerminal = focusedSession || (sessions.length > 0 ? sessions[sessions.length - 1] : null);
  const currentPwd = activeTerminal ? activeTerminal.pwd : null;

  const fetchStatus = useCallback(async () => {
    if (!currentPwd || !isSidebarOpen || activeSidebarTab !== 'git') return;
    try {
      const data = await nexusFetchJSON(`/api/git/status?path=${encodeURIComponent(currentPwd)}`);
      setGitStatus(data);
    } catch (err) {
      console.error(err);
      if (err.category === 'NETWORK' || err.category === 'SERVER') {
        addError(activeTerminal?.id, {
          id: 'git_error',
          title: 'Git Status Failed',
          description: err.userMessage,
          category: err.category
        });
      }
    }
  }, [currentPwd, isSidebarOpen, activeSidebarTab, addError, activeTerminal?.id]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (!isSidebarOpen || activeSidebarTab !== 'git') return null;

  const handleBranchClick = (branch) => {
    if (!activeTerminal || branch === gitStatus.branch) return;
    const sanitizedBranch = branch.replace(/["'$`\\]/g, '');
    window.dispatchEvent(new CustomEvent(`NEXUS_ACTION_${activeTerminal.id}`, { detail: `git checkout "${sanitizedBranch}"` }));
  };

  const handleFetch = async () => {
    if (!currentPwd || isFetching) return;
    setIsFetching(true);
    try {
      await nexusFetchJSON(`/api/git/fetch?path=${encodeURIComponent(currentPwd)}`, { method: 'POST' });
      toast.success('Git fetch completed');
      fetchStatus();
    } catch (err) {
      toast.error(err.userMessage || 'Git fetch failed');
    } finally {
      setIsFetching(false);
    }
  };

  return (
    <div className="w-64 flex-shrink-0 glass-panel-solid rounded-r-xl flex flex-col h-full overflow-hidden text-sm shadow-lg">
      <div className="p-3 border-b border-ctp-surface0/50 font-semibold text-ctp-text flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch size={16} className="text-ctp-blue" />
          <span className="truncate">Source Control</span>
        </div>
        <button 
          onClick={handleFetch} 
          disabled={!gitStatus?.branch || isFetching}
          className={`p-1 rounded hover:bg-ctp-surface0/50 transition-colors ${!gitStatus?.branch ? 'opacity-50 cursor-not-allowed' : 'text-ctp-subtext0 hover:text-ctp-text'}`}
          title="Fetch from Remote"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="p-2 overflow-y-auto flex-1 scrollbar-thin">
        {!focusedSession ? (
          <div className="text-[#6c7086] text-xs italic p-4 text-center">Select a terminal</div>
        ) : !gitStatus?.branch ? (
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
                    className="flex items-center justify-between px-2 py-1.5 hover:bg-ctp-surface0 rounded cursor-pointer text-ctp-text transition-colors group"
                  >
                    <span className={`truncate text-xs ${branch === gitStatus.branch ? 'font-bold text-ctp-blue' : ''}`}>
                      {branch}
                    </span>
                    {branch === gitStatus.branch && <Check size={14} className="text-ctp-green" />}
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
                        className="flex items-center justify-between px-2 py-1.5 hover:bg-ctp-surface0 rounded cursor-pointer text-ctp-text transition-colors group opacity-80 hover:opacity-100"
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
                <span className="bg-ctp-surface0 text-ctp-text px-1.5 rounded-full text-[10px]">{gitStatus.changedFiles}</span>
              </div>
              {gitStatus.files?.length === 0 ? (
                <div className="text-[#6c7086] text-xs italic px-2">No local changes</div>
              ) : (
                <ul className="space-y-0.5">
                  {gitStatus.files?.map((f, idx) => {
                    const isAdded = f.status.includes('A') || f.status === '??';
                    const isDeleted = f.status.includes('D');
                    const isModified = f.status.includes('M');
                    
                    let color = 'text-ctp-text';
                    if (isAdded) color = 'text-ctp-green'; // green
                    else if (isDeleted) color = 'text-ctp-red'; // red
                    else if (isModified) color = 'text-ctp-yellow'; // yellow

                    const handleFileDoubleClick = (e) => {
                      e.stopPropagation();
                      if (isDeleted) {
                        toast.error("Cannot open deleted files");
                        return;
                      }
                      if (!gitStatus.gitRoot) {
                        toast.error("gitRoot is missing from backend response");
                        return;
                      }
                      
                      try {
                        const cleanFileName = f.file.replace(/^"|"$/g, '');
                        const separator = gitStatus.gitRoot.includes('\\') ? '\\' : '/';
                        const fullPath = gitStatus.gitRoot + separator + cleanFileName;
                        createEditor(fullPath);
                        toast.success(`Opening: ${cleanFileName}`);
                      } catch (err) {
                        toast.error(`Error opening file: ${err.message}`);
                      }
                    };

                    return (
                      <li key={idx} onDoubleClick={handleFileDoubleClick} className={`flex items-center gap-2 px-2 py-1.5 hover:bg-ctp-surface0 rounded transition-colors ${!isDeleted ? 'cursor-pointer' : 'cursor-default'}`}>
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