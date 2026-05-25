import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Server, Plus, MoreHorizontal, Key, Lock, Fingerprint, Play, Edit, Trash2, Copy, Circle, Loader2 } from 'lucide-react';

export default function SSHPanel({ onNewProfile, onEditProfile }) {
  const sshProfiles = useStore(state => state.sshProfiles);
  const sshConnections = useStore(state => state.sshConnections);
  const fetchSshProfiles = useStore(state => state.fetchSshProfiles);
  const connectToSshProfile = useStore(state => state.connectToSshProfile);
  const deleteSshProfile = useStore(state => state.deleteSshProfile);

  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(null);
  
  const isSidebarOpen = useStore(state => state.isSidebarOpen);
  const activeSidebarTab = useStore(state => state.activeSidebarTab);

  useEffect(() => {
    fetchSshProfiles();
  }, [fetchSshProfiles]);

  if (!isSidebarOpen || activeSidebarTab !== 'ssh') return null;

  const filteredProfiles = sshProfiles.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.host.toLowerCase().includes(search.toLowerCase()) ||
    p.username.toLowerCase().includes(search.toLowerCase()) ||
    (p.tags && p.tags.some(t => t.toLowerCase().includes(search.toLowerCase())))
  );

  const handleConnect = async (e, id) => {
    e.stopPropagation();
    try {
      await connectToSshProfile(id);
    } catch (err) {
      console.error(err);
      // store already handles showing error status, toast could be added here
    }
  };

  const copySshCommand = (e, profile) => {
    e.stopPropagation();
    let cmd = `ssh `;
    if (profile.port !== 22) cmd += `-p ${profile.port} `;
    if (profile.authMethod === 'key' && profile.keyPath) cmd += `-i "${profile.keyPath}" `;
    cmd += `${profile.username}@${profile.host}`;
    navigator.clipboard.writeText(cmd);
    setMenuOpen(null);
  };

  const getStatusIcon = (status) => {
    if (status === 'connected') return <Circle size={10} className="fill-ctp-green text-ctp-green" />;
    if (status === 'connecting') return <Loader2 size={10} className="text-ctp-yellow animate-spin" />;
    if (status === 'error') return <Circle size={10} className="fill-ctp-red text-ctp-red" />;
    return <Circle size={10} className="fill-ctp-surface2 text-ctp-surface2" />; // disconnected
  };

  const getAuthIcon = (method) => {
    if (method === 'key') return <Key size={10} />;
    if (method === 'password') return <Lock size={10} />;
    if (method === 'agent') return <Fingerprint size={10} />;
  };

  const formatRelativeTime = (isoString) => {
    if (!isoString) return 'never';
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const daysDifference = Math.round((new Date(isoString).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (daysDifference === 0) return 'today';
    return rtf.format(daysDifference, 'day');
  };

  return (
    <div className="flex flex-col h-full bg-ctp-mantle border-r border-ctp-crust w-64 overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-ctp-crust">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ctp-subtext0 flex items-center gap-2">
          <Server size={14} /> SSH
        </h2>
        <button 
          onClick={onNewProfile}
          className="text-ctp-blue hover:bg-ctp-blue/10 p-1 rounded transition-colors flex items-center"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="p-2 border-b border-ctp-crust bg-ctp-base/30">
        <input 
          type="text" 
          placeholder="Filter connections..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-ctp-crust border border-ctp-surface0 rounded px-2 py-1 text-xs text-ctp-text outline-none focus:border-ctp-blue transition-colors"
        />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-2">
        {filteredProfiles.length === 0 ? (
          <div className="text-center p-4 text-xs text-ctp-surface2">No connections found.</div>
        ) : (
          filteredProfiles.map(profile => {
            const status = sshConnections[profile.id] || 'disconnected';
            const isActive = status === 'connected';

            return (
              <div 
                key={profile.id}
                onClick={(e) => handleConnect(e, profile.id)}
                className={`p-2 rounded-lg border flex flex-col gap-1.5 cursor-pointer transition-colors relative group ${
                  isActive ? 'bg-ctp-blue/5 border-ctp-blue' : 'bg-ctp-base border-ctp-surface0 hover:border-ctp-surface1'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {getStatusIcon(status)}
                    <span className="text-xs font-bold text-ctp-text truncate" style={{ color: profile.color }}>
                      {profile.name}
                    </span>
                    {profile.tags && profile.tags[0] && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-ctp-surface0 text-ctp-subtext0 truncate max-w-[50px]">
                        {profile.tags[0]}
                      </span>
                    )}
                  </div>
                  
                  {/* Actions Dropdown */}
                  <div className="relative">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === profile.id ? null : profile.id); }}
                      className="text-ctp-surface2 hover:text-ctp-text p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    
                    {menuOpen === profile.id && (
                      <div className="absolute right-0 top-full mt-1 w-36 bg-ctp-mantle border border-ctp-surface0 rounded-lg shadow-xl py-1 z-50">
                        <button onClick={(e) => { e.stopPropagation(); onEditProfile(profile); setMenuOpen(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-ctp-surface0 flex items-center gap-2">
                          <Edit size={12}/> Edit
                        </button>
                        <button onClick={(e) => copySshCommand(e, profile)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-ctp-surface0 flex items-center gap-2">
                          <Copy size={12}/> Copy CLI Command
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteSshProfile(profile.id); setMenuOpen(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-ctp-red/10 text-ctp-red flex items-center gap-2">
                          <Trash2 size={12}/> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[10px] text-ctp-subtext0 flex items-center gap-1.5 truncate">
                  {getAuthIcon(profile.authMethod)} 
                  <span className="truncate">{profile.username}@{profile.host}:{profile.port || 22}</span>
                </div>
                
                {status === 'error' && (
                  <div className="text-[10px] text-ctp-red mt-1 p-1 bg-ctp-red/10 rounded">Connection failed. Check details in terminal or edit config.</div>
                )}
                
                {profile.lastConnectedAt && status !== 'error' && (
                  <div className="text-[9px] text-ctp-surface2 text-right mt-1">
                    Last: {formatRelativeTime(profile.lastConnectedAt)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      
      {/* Click outside to close menu handler could be added to parent, but for now simple inline handling */}
      {menuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)}></div>
      )}
    </div>
  );
}