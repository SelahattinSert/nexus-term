import React, { useState, useEffect } from 'react';
import { 
  Brain, 
  BarChart2, 
  Trash2, 
  Search, 
  Folder, 
  Calendar, 
  ArrowUpDown, 
  ChevronDown, 
  ChevronUp, 
  X,
  Clock,
  Activity
} from 'lucide-react';
import { useStore } from '../../store';

function formatRelativeTime(isoString) {
  if (!isoString) return 'unknown';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  
  if (isNaN(diffMs)) return 'unknown';

  const diffMins = Math.floor(diffMs / 1000 / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} days ago`;
}

export default function MemoryPanel() {
  const isSidebarOpen = useStore(state => state.isSidebarOpen);
  const activeSidebarTab = useStore(state => state.activeSidebarTab);
  const memoryEntries = useStore(state => state.memoryEntries);
  const memoryStats = useStore(state => state.memoryStats);
  const isMemoryLoading = useStore(state => state.isMemoryLoading);
  
  const fetchMemory = useStore(state => state.fetchMemory);
  const fetchMemoryStats = useStore(state => state.fetchMemoryStats);
  const deleteMemoryEntry = useStore(state => state.deleteMemoryEntry);
  const clearAllMemory = useStore(state => state.clearAllMemory);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('useCount'); // 'useCount' or 'lastUsedAt'
  const [expandedId, setExpandedId] = useState(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  useEffect(() => {
    if (!isSidebarOpen || activeSidebarTab !== 'memory') return;
    fetchMemory(1, 50, searchQuery);
    fetchMemoryStats();
  }, [searchQuery, isSidebarOpen, activeSidebarTab, fetchMemory, fetchMemoryStats]);

  if (!isSidebarOpen || activeSidebarTab !== 'memory') return null;

  const toggleSort = () => {
    setSortBy(prev => prev === 'useCount' ? 'lastUsedAt' : 'useCount');
  };

  const handleClearAll = async () => {
    await clearAllMemory();
    setShowConfirmClear(false);
  };

  // Client-side sort based on selected parameter
  const sortedEntries = [...memoryEntries].sort((a, b) => {
    if (sortBy === 'useCount') {
      return (b.useCount || 0) - (a.useCount || 0);
    } else {
      return new Date(b.lastUsedAt || 0) - new Date(a.lastUsedAt || 0);
    }
  });

  return (
    <div className="flex flex-col h-full bg-ctp-mantle text-ctp-text select-none">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-ctp-surface0 bg-ctp-crust">
        <div className="flex items-center gap-2">
          <Brain className="text-ctp-yellow w-5 h-5 animate-pulse" />
          <h2 className="text-sm font-bold tracking-wide uppercase text-ctp-lavender">AI Error Memory</h2>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setShowStatsModal(true)}
            title="View Statistics"
            className="p-1.5 hover:bg-ctp-surface0 rounded-lg text-ctp-subtext0 hover:text-ctp-yellow transition-all"
          >
            <BarChart2 size={16} />
          </button>
          <button 
            onClick={() => setShowConfirmClear(true)}
            title="Clear All Memories"
            className="p-1.5 hover:bg-ctp-surface0 rounded-lg text-ctp-subtext0 hover:text-ctp-red transition-all"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Search and Sort Toolbar */}
      <div className="p-3 border-b border-ctp-surface0 bg-ctp-mantle flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-2.5 text-ctp-surface2" />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search errors or solutions..."
            className="w-full bg-ctp-crust border border-ctp-surface0 rounded-lg pl-8 pr-3 py-1.5 text-xs text-ctp-text placeholder-ctp-surface2 outline-none focus:border-ctp-lavender transition-all"
          />
        </div>
        <button 
          onClick={toggleSort}
          title={`Sorting by: ${sortBy === 'useCount' ? 'Usage count' : 'Last used date'}`}
          className="px-2.5 py-1.5 bg-ctp-crust border border-ctp-surface0 hover:border-ctp-lavender hover:bg-ctp-surface0 rounded-lg flex items-center gap-1.5 text-xs text-ctp-subtext0 hover:text-ctp-text transition-all"
        >
          <ArrowUpDown size={12} />
          <span className="text-[10px] font-semibold uppercase">
            {sortBy === 'useCount' ? 'Popular' : 'Recent'}
          </span>
        </button>
      </div>

      {/* Entries List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {isMemoryLoading && sortedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-ctp-subtext1 text-xs">
            <Activity className="animate-spin text-ctp-lavender mb-2" size={18} />
            Loading error memory...
          </div>
        ) : sortedEntries.length === 0 ? (
          <div className="text-center text-ctp-surface2 text-xs py-8 font-medium">
            {searchQuery ? 'No matching memories found.' : 'No terminal solutions memorized yet.'}
          </div>
        ) : (
          sortedEntries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            return (
              <div 
                key={entry.id} 
                className="bg-ctp-crust border border-ctp-surface0 hover:border-ctp-surface1 rounded-xl overflow-hidden transition-all shadow-sm"
              >
                {/* Collapsed view header */}
                <div 
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="p-3 cursor-pointer select-none hover:bg-ctp-surface0/30 transition-colors flex flex-col gap-1.5"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="font-semibold text-xs text-ctp-text break-all line-clamp-1 flex-1">
                      {entry.errorPattern.length > 60 
                        ? `${entry.errorPattern.slice(0, 60)}...` 
                        : entry.errorPattern
                      }
                    </div>
                    <div className="text-[10px] font-bold bg-ctp-surface0 text-ctp-subtext1 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                      used {entry.useCount || 1}×
                    </div>
                  </div>

                  <div className="text-xs text-ctp-subtext0 line-clamp-1 italic font-medium">
                    {entry.solutionSummary}
                  </div>

                  {/* Commands preview */}
                  <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px]">
                    {entry.commandChain?.slice(0, 3).map((cmd, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="text-ctp-surface2">→</span>}
                        <code className="bg-ctp-surface0 text-ctp-green px-1.5 py-0.5 rounded font-mono break-all line-clamp-1 max-w-[120px]">
                          {cmd}
                        </code>
                      </React.Fragment>
                    ))}
                    {entry.commandChain?.length > 3 && (
                      <span className="text-ctp-surface2 text-[9px] font-bold ml-0.5">
                        +{entry.commandChain.length - 3} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-ctp-surface0 bg-ctp-mantle/40 text-xs space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-ctp-subtext1 uppercase tracking-wider">Full Error Pattern</div>
                      <pre className="bg-ctp-crust p-2 rounded-lg font-mono text-[10px] text-ctp-text whitespace-pre-wrap break-all border border-ctp-surface0 max-h-32 overflow-y-auto">
                        {entry.errorPattern}
                      </pre>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-ctp-subtext1 uppercase tracking-wider">Commands Chain</div>
                      <div className="space-y-1 bg-ctp-crust p-2 rounded-lg border border-ctp-surface0 font-mono text-[10px]">
                        {entry.commandChain?.map((cmd, idx) => (
                          <div key={idx} className="flex gap-2 items-start py-0.5">
                            <span className="text-ctp-lavender font-bold select-none">{idx + 1}.</span>
                            <span className="text-ctp-green break-all">{cmd}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Metadata Badges */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-ctp-surface0/60 text-[10px] text-ctp-subtext1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {entry.projectType && entry.projectType !== 'unknown' && (
                          <span className="bg-ctp-surface0 text-ctp-blue px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                            <Folder size={8} /> {entry.projectType}
                          </span>
                        )}
                        {entry.workingDirPattern && (
                          <span className="bg-ctp-surface0 text-ctp-subtext0 px-1.5 py-0.5 rounded font-medium">
                            dir: {entry.workingDirPattern}
                          </span>
                        )}
                        <span className="flex items-center gap-1 font-medium">
                          <Clock size={10} /> {formatRelativeTime(entry.lastUsedAt)}
                        </span>
                      </div>
                      
                      <button 
                        onClick={() => deleteMemoryEntry(entry.id)}
                        className="text-ctp-red hover:underline font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Inline Confirmation Clear Dialog */}
      {showConfirmClear && (
        <div className="absolute inset-0 z-50 bg-ctp-crust/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-ctp-mantle border border-ctp-surface1 rounded-2xl shadow-2xl p-5 max-w-xs w-full text-center space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-ctp-red/10 text-ctp-red rounded-full flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-sm text-ctp-text">Clear AI Memory?</h3>
              <p className="text-xs text-ctp-subtext1">This will permanently delete all {memoryEntries.length} solved error memories. This cannot be undone.</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowConfirmClear(false)}
                className="flex-1 py-2 bg-ctp-surface0 hover:bg-ctp-surface1 rounded-xl text-xs font-semibold text-ctp-text transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleClearAll}
                className="flex-1 py-2 bg-ctp-red hover:bg-ctp-red/90 rounded-xl text-xs font-semibold text-white transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {showStatsModal && memoryStats && (
        <div className="absolute inset-0 z-50 bg-ctp-crust/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-ctp-mantle border border-ctp-surface1 rounded-2xl shadow-2xl p-5 max-w-sm w-full space-y-4 animate-in zoom-in-95 duration-150 relative">
            <button 
              onClick={() => setShowStatsModal(false)}
              className="absolute top-4 right-4 text-ctp-subtext0 hover:text-ctp-text transition-colors"
            >
              <X size={16} />
            </button>
            
            <div className="flex items-center gap-2 border-b border-ctp-surface0 pb-2">
              <BarChart2 className="text-ctp-lavender w-5 h-5" />
              <h3 className="font-bold text-sm text-ctp-text uppercase">Memory Statistics</h3>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-ctp-crust p-3 rounded-xl border border-ctp-surface0">
                <div className="text-[10px] font-bold text-ctp-subtext1 uppercase tracking-wider">Total Errors</div>
                <div className="text-xl font-extrabold text-ctp-lavender mt-0.5">{memoryStats.totalEntries}</div>
              </div>
              <div className="bg-ctp-crust p-3 rounded-xl border border-ctp-surface0">
                <div className="text-[10px] font-bold text-ctp-subtext1 uppercase tracking-wider">Times Used</div>
                <div className="text-xl font-extrabold text-ctp-green mt-0.5">{memoryStats.totalTimesUsed}</div>
              </div>
            </div>

            {memoryStats.topErrors?.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-ctp-subtext1 uppercase tracking-wider">Top Solved Errors</div>
                <div className="space-y-2 max-h-48 overflow-y-auto font-mono text-[10px]">
                  {memoryStats.topErrors.map((err) => (
                    <div key={err.id} className="bg-ctp-crust p-2 rounded-lg border border-ctp-surface0 flex justify-between items-center gap-2">
                      <div className="truncate flex-1 font-sans text-ctp-text text-xs">
                        {err.solutionSummary || err.errorPattern}
                      </div>
                      <div className="bg-ctp-surface0 text-ctp-yellow px-1.5 py-0.5 rounded font-bold whitespace-nowrap">
                        {err.useCount}×
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <button 
              onClick={() => setShowStatsModal(false)}
              className="w-full py-2 bg-ctp-surface0 hover:bg-ctp-surface1 rounded-xl text-xs font-semibold text-ctp-text transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
