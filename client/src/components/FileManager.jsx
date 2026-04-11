import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Folder, File, FolderOpen, AlertCircle } from 'lucide-react';

export default function FileManager() {
  const { sessions, focusedPane, isSidebarOpen, activeSidebarTab } = useStore();
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const focusedSession = sessions.find(s => s.id === focusedPane);
  const currentPwd = focusedSession ? focusedSession.pwd : null;

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
    if (!focusedSession) return;
    
    // Sanitize filename to prevent command injection
    const sanitizedName = file.name.replace(/["'$`\\]/g, '');
    
    if (file.isDir) {
      window.dispatchEvent(new CustomEvent(`NEXUS_ACTION_${focusedSession.id}`, { detail: `cd "${sanitizedName}"` }));
    } else {
      window.dispatchEvent(new CustomEvent(`NEXUS_ACTION_${focusedSession.id}`, { detail: `./"${sanitizedName}"` }));
    }
  };

  return (
    <div className="w-64 flex-shrink-0 bg-[#181825] border-r border-[#313244] flex flex-col h-full overflow-hidden text-sm">
      <div className="p-3 border-b border-[#313244] bg-[#11111b] font-semibold text-[#cdd6f4] flex items-center gap-2 shrink-0">
        <FolderOpen size={16} className="text-[#89b4fa]" />
        <span className="truncate">Explorer</span>
      </div>
      
      <div className="p-2 overflow-y-auto flex-1 scrollbar-thin">
        {!focusedSession ? (
          <div className="text-[#6c7086] text-xs italic p-4 text-center">Select a terminal to view files</div>
        ) : loading ? (
          <div className="text-[#a6adc8] text-xs p-4 text-center animate-pulse">Loading files...</div>
        ) : error ? (
          <div className="text-[#f38ba8] text-xs p-3 bg-[#313244] rounded flex gap-2 items-start break-words">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : files.length === 0 ? (
          <div className="text-[#6c7086] text-xs italic p-4 text-center">Directory is empty</div>
        ) : (
          <ul className="space-y-0.5">
            {files.map((file, idx) => (
              <li 
                key={idx} 
                onDoubleClick={() => handleDoubleClick(file)}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#313244] rounded cursor-pointer text-[#cdd6f4] transition-colors select-none"
                title={file.name}
              >
                {file.isDir ? (
                  <Folder size={14} className="text-[#89b4fa] shrink-0" fill="currentColor" fillOpacity={0.2} />
                ) : (
                  <File size={14} className="text-[#a6adc8] shrink-0" />
                )}
                <span className="truncate text-xs">{file.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}