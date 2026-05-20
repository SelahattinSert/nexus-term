import React, { useEffect, useState } from 'react';
import { Folder, File, FolderOpen, AlertCircle, CornerLeftUp } from 'lucide-react';
import { useStore } from '../store';
import { nexusFetchJSON } from '../utils/nexusFetch';

export default function FileManager() {
  const { sessions, focusedPane, isSidebarOpen, activeSidebarTab, createEditor, addError } = useStore();
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Determine active terminal context for file browsing
  const focusedSession = sessions.find(s => s.id === focusedPane);
  const activeTerminal = focusedSession || (sessions.length > 0 ? sessions[sessions.length - 1] : null);
  const currentPwd = activeTerminal ? activeTerminal.pwd : null;

  useEffect(() => {
    if (!isSidebarOpen || !currentPwd || activeSidebarTab !== 'explorer') return;

    let isMounted = true;
    setTimeout(() => {
      setLoading(true);
      setError(null);
    }, 0);

    nexusFetchJSON(`/api/files?path=${encodeURIComponent(currentPwd)}`)
      .then(data => {
        if (isMounted) {
          const sorted = data.sort((a, b) => {
            if (a.isDir === b.isDir) return a.name.localeCompare(b.name);
            return a.isDir ? -1 : 1;
          });
          setFiles(sorted);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          const msg = err.userMessage || err.message;
          setError(msg);
          setLoading(false);
          if (err.category === 'NETWORK' || err.category === 'SERVER') {
            addError(activeTerminal?.id, {
              id: 'fs_error',
              title: 'File System Error',
              description: msg,
              category: err.category
            });
          }
        }
      });

    return () => { isMounted = false; };
  }, [currentPwd, isSidebarOpen, activeSidebarTab, addError, activeTerminal?.id]);

  if (!isSidebarOpen || activeSidebarTab !== 'explorer') return null;

  const navigateUp = () => {
    if (!currentPwd || !activeTerminal) return;
    const parts = currentPwd.split(/[/\\]/).filter(Boolean);
    if (parts.length > 0) {
      parts.pop();
      const parent = parts.length === 0 ? (currentPwd.startsWith('/') ? '/' : '') : parts.join('/');
      window.dispatchEvent(new CustomEvent(`NEXUS_ACTION_${activeTerminal.id}`, { detail: `cd "${parent || '/'}"` }));
    }
  };

  const handleFileClick = (file) => {
    if (file.isDir) {
      window.dispatchEvent(new CustomEvent(`NEXUS_ACTION_${activeTerminal.id}`, { detail: `cd "${file.path}"` }));
    } else {
      createEditor(file.path);
    }
  };

  return (
    <div className="w-64 flex-shrink-0 glass-panel-solid rounded-r-xl flex flex-col h-full overflow-hidden text-sm shadow-lg">
      <div className="p-3 border-b border-ctp-surface0/50 font-semibold text-ctp-text flex items-center gap-2 shrink-0">
        <FolderOpen size={16} className="text-ctp-blue" />
        <span className="truncate">Explorer</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        {loading && files.length === 0 ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-ctp-blue"></div>
          </div>
        ) : error ? (
          <div className="p-3 text-ctp-red flex flex-col items-center gap-2 text-center">
            <AlertCircle size={24} className="opacity-50" />
            <p>{error}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <button
              onClick={navigateUp}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-ctp-surface0/50 text-ctp-subtext0 transition-colors group"
            >
              <CornerLeftUp size={16} className="group-hover:text-ctp-blue transition-colors" />
              <span>..</span>
            </button>
            {files.map((file) => (
              <button
                key={file.path}
                onClick={() => handleFileClick(file)}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-ctp-surface0/50 text-ctp-text transition-colors group text-left"
              >
                {file.isDir ? (
                  <Folder size={16} className="text-ctp-blue opacity-80 group-hover:opacity-100" />
                ) : (
                  <File size={16} className="text-ctp-subtext1 opacity-70 group-hover:opacity-100" />
                )}
                <span className="truncate">{file.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {currentPwd && (
        <div className="p-2 border-t border-ctp-surface0/30 bg-ctp-crust/20">
          <div className="text-[10px] text-ctp-surface2 font-mono truncate" title={currentPwd}>
            {currentPwd}
          </div>
        </div>
      )}
    </div>
  );
}