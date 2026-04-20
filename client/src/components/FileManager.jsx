import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Folder, File, FolderOpen, AlertCircle, CornerLeftUp } from 'lucide-react';

export default function FileManager() {
  const { sessions, focusedPane, isSidebarOpen, activeSidebarTab, createEditor } = useStore();
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // If focused pane is a terminal, use its pwd.
  // If focused pane is an editor, we can try to use the pwd of the first terminal session
  // or track a "last active terminal" so the file manager doesn't just disappear.
  const focusedSession = sessions.find(s => s.id === focusedPane);
  const activeTerminal = focusedSession || (sessions.length > 0 ? sessions[sessions.length - 1] : null);
  const currentPwd = activeTerminal ? activeTerminal.pwd : null;

  useEffect(() => {
    if (!isSidebarOpen || !currentPwd) return;

    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return;

    let isMounted = true;
    
    // Use a small delay to avoid synchronous setState in effect warning
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        setLoading(true);
        setError(null);
      }
    }, 0);

    // Dynamic API URL depending on the environment
    const apiUrl = import.meta.env.DEV ? 'http://127.0.0.1:4000' : '';

    fetch(`${apiUrl}/api/files?path=${encodeURIComponent(currentPwd)}&token=${token}`)
      .then(res => {
        if (!res.ok) {
          if (res.status === 403) throw new Error('Forbidden: Cannot navigate outside of root.');
          throw new Error('Failed to fetch files');
        }
        return res.json();
      })
      .then(data => {
        if (isMounted) {
          // Sort directories first, then files, alphabetically
          const sorted = data.sort((a, b) => {
            if (a.isDir === b.isDir) {
              return a.name.localeCompare(b.name);
            }
            return a.isDir ? -1 : 1;
          });
          setFiles(sorted);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [currentPwd, isSidebarOpen, activeSidebarTab]);

  if (!isSidebarOpen || activeSidebarTab !== 'explorer') return null;

  const handleDoubleClick = (file) => {
    if (!activeTerminal) return;
    
    if (file.isDir) {
      const sanitizedName = file.name.replace(/["'$`\\]/g, '');
      window.dispatchEvent(new CustomEvent(`NEXUS_ACTION_${activeTerminal.id}`, { detail: `cd "${sanitizedName}"` }));
    } else {
      const fullPath = currentPwd.endsWith('/') || currentPwd.endsWith('\\') 
        ? `${currentPwd}${file.name}` 
        : `${currentPwd}/${file.name}`;
      createEditor(fullPath);
    }
  };

  const handleGoBack = () => {
    if (!activeTerminal) return;
    window.dispatchEvent(new CustomEvent(`NEXUS_ACTION_${activeTerminal.id}`, { detail: `cd ..` }));
  };

  return (
    <div className="w-64 flex-shrink-0 bg-ctp-mantle border-r border-ctp-surface0 flex flex-col h-full overflow-hidden text-sm">
      <div className="p-3 border-b border-ctp-surface0 bg-ctp-crust font-semibold text-ctp-text flex items-center gap-2 shrink-0">
        <FolderOpen size={16} className="text-ctp-blue" />
        <span className="truncate">Explorer</span>
      </div>
      
      <div className="p-2 overflow-y-auto flex-1 scrollbar-thin">
        {!activeTerminal ? (
          <div className="text-[#6c7086] text-xs italic p-4 text-center">Select a terminal to view files</div>
        ) : loading ? (
          <div className="text-ctp-subtext0 text-xs p-4 text-center animate-pulse">Loading files...</div>
        ) : error ? (
          <div className="text-ctp-red text-xs p-3 bg-ctp-surface0 rounded flex gap-2 items-start break-words">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : (
          <ul className="space-y-0.5">
            <li 
              onClick={handleGoBack}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-ctp-surface0 rounded cursor-pointer text-ctp-text transition-colors select-none"
              title="Go Back"
            >
              <CornerLeftUp size={14} className="text-ctp-blue shrink-0" />
              <span className="truncate text-xs italic">.. (Go Back)</span>
            </li>
            {files.map((file, idx) => (
              <li 
                key={idx} 
                onDoubleClick={() => handleDoubleClick(file)}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-ctp-surface0 rounded cursor-pointer text-ctp-text transition-colors select-none"
                title={file.name}
              >
                {file.isDir ? (
                  <Folder size={14} className="text-ctp-blue shrink-0" fill="currentColor" fillOpacity={0.2} />
                ) : (
                  <File size={14} className="text-ctp-subtext0 shrink-0" />
                )}
                <span className="truncate text-xs">{file.name}</span>
              </li>
            ))}
            {files.length === 0 && (
              <div className="text-[#6c7086] text-xs italic p-4 text-center">Directory is empty</div>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}