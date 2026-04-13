import React from 'react';
import { useStore } from '../store';
import { Files, GitBranch, Star } from 'lucide-react';

export default function ActivityBar() {
  const { isSidebarOpen, activeSidebarTab, setActiveSidebarTab, toggleSidebar } = useStore();

  const handleTabClick = (tab) => {
    if (isSidebarOpen && activeSidebarTab === tab) {
      toggleSidebar();
    } else {
      setActiveSidebarTab(tab);
    }
  };

  return (
    <div className="w-12 flex-shrink-0 bg-ctp-crust border-r border-ctp-surface0 flex flex-col items-center py-2 h-full gap-4">
      <button 
        onClick={() => handleTabClick('explorer')}
        title="Explorer"
        className={`p-2 rounded-lg transition-colors ${activeSidebarTab === 'explorer' && isSidebarOpen ? 'text-ctp-blue' : 'text-[#6c7086] hover:text-ctp-text'}`}
      >
        <Files size={24} strokeWidth={1.5} />
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
    </div>
  );
}

