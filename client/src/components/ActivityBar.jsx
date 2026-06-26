import React from 'react';
import { useStore } from '../store';
import { Files, GitBranch, Star, Settings, Server, Wifi, Lock, Brain } from 'lucide-react';

export default function ActivityBar() {
  const { isSidebarOpen, activeSidebarTab, setActiveSidebarTab, toggleSidebar, setSettingsOpen } = useStore();

  const handleTabClick = (tab) => {
    if (isSidebarOpen && activeSidebarTab === tab) {
      toggleSidebar();
    } else {
      setActiveSidebarTab(tab);
    }
  };

  return (
    <div className="w-12 flex-shrink-0 bg-ctp-crust border-r border-ctp-surface0 flex flex-col items-center py-2 h-full justify-between z-10 relative">
      <div className="flex flex-col gap-4 items-center">
        <button 
          onClick={() => handleTabClick('explorer')}
          title="Explorer"
          className={`p-2 rounded-lg transition-colors ${activeSidebarTab === 'explorer' && isSidebarOpen ? 'text-ctp-blue' : 'text-[#6c7086] hover:text-ctp-text'}`}
        >
          <Files size={24} strokeWidth={1.5} />
        </button>
        <button 
          onClick={() => handleTabClick('ssh')}
          title="SSH Connections"
          className={`p-2 rounded-lg transition-colors ${activeSidebarTab === 'ssh' && isSidebarOpen ? 'text-ctp-green' : 'text-[#6c7086] hover:text-ctp-green'}`}
        >
          <Server size={24} strokeWidth={1.5} />
        </button>
        <button 
          onClick={() => handleTabClick('ports')}
          title="Port Manager"
          className={`p-2 rounded-lg transition-colors ${activeSidebarTab === 'ports' && isSidebarOpen ? 'text-ctp-red' : 'text-[#6c7086] hover:text-ctp-red'}`}
        >
          <Wifi size={24} strokeWidth={1.5} />
        </button>
        <button 
          onClick={() => handleTabClick('env')}
          title="Environment Variables"
          className={`p-2 rounded-lg transition-colors ${activeSidebarTab === 'env' && isSidebarOpen ? 'text-ctp-peach' : 'text-[#6c7086] hover:text-ctp-peach'}`}
        >
          <Lock size={24} strokeWidth={1.5} />
        </button>
        <button 
          onClick={() => handleTabClick('git')}
          title="Source Control"
          className={`p-2 rounded-lg transition-colors ${activeSidebarTab === 'git' && isSidebarOpen ? 'text-ctp-blue' : 'text-[#6c7086] hover:text-ctp-text'}`}
        >
          <GitBranch size={24} strokeWidth={1.5} />
        </button>
        <button 
          onClick={() => handleTabClick('snippets')}
          title="Saved Snippets"
          className={`p-2 rounded-lg transition-colors ${activeSidebarTab === 'snippets' && isSidebarOpen ? 'text-ctp-yellow' : 'text-[#6c7086] hover:text-ctp-yellow'}`}
        >
          <Star size={24} strokeWidth={1.5} />
        </button>
        <button 
          onClick={() => handleTabClick('memory')}
          title="AI Memory"
          className={`p-2 rounded-lg transition-colors ${activeSidebarTab === 'memory' && isSidebarOpen ? 'text-ctp-yellow animate-pulse' : 'text-[#6c7086] hover:text-ctp-yellow'}`}
        >
          <Brain size={24} strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex flex-col gap-4 items-center mb-2">
        <button 
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="p-2 rounded-lg transition-colors text-[#6c7086] hover:text-ctp-text"
        >
          <Settings size={24} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

