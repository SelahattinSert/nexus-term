import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Wifi, RefreshCw, X, Link, Play, Search, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PortManagerPanel() {
  const { ports, isScanning, lastScanned, autoRefreshPorts, setAutoRefreshPorts, fetchPorts, killPortProcess, startTunnel, stopTunnel, tunnelLoading } = useStore();
  const { isSidebarOpen, activeSidebarTab } = useStore();
  const [search, setSearch] = useState('');
  const [killConfirm, setKillConfirm] = useState(null);

  useEffect(() => {
    if (!isSidebarOpen || activeSidebarTab !== 'ports') return;
    fetchPorts();
    
    let interval;
    if (autoRefreshPorts) {
      interval = setInterval(fetchPorts, 3000);
    }
    return () => clearInterval(interval);
  }, [isSidebarOpen, activeSidebarTab, autoRefreshPorts, fetchPorts]);

  if (!isSidebarOpen || activeSidebarTab !== 'ports') return null;

  const filteredPorts = ports.filter(p => {
    if (!search) return true;
    const term = search.toLowerCase();
    return p.port.toString().includes(term) || (p.processName && p.processName.toLowerCase().includes(term));
  });

  const getPortColor = (port) => {
    if ([3000, 4000, 5000, 8000, 8080, 8888, 5173, 4200].includes(port)) return 'text-ctp-yellow';
    if ([80, 443].includes(port)) return 'text-ctp-green';
    if ([5432, 3306, 27017, 6379].includes(port)) return 'text-ctp-blue';
    if (port === 22) return 'text-ctp-mauve';
    return 'text-ctp-text';
  };

  const getProcessColor = (name) => {
    if (!name) return 'text-ctp-subtext0';
    const lower = name.toLowerCase();
    if (lower.includes('node') || lower.includes('python') || lower.includes('ruby') || lower.includes('java')) return 'text-ctp-yellow';
    if (lower.includes('nginx') || lower.includes('apache') || lower.includes('httpd')) return 'text-ctp-green';
    if (lower.includes('postgres') || lower.includes('mysql') || lower.includes('redis') || lower.includes('mongo')) return 'text-ctp-blue';
    return 'text-ctp-subtext0';
  };

  const formatRelativeTime = (isoString) => {
    if (!isoString) return 'never';
    const diff = Math.floor((new Date().getTime() - new Date(isoString).getTime()) / 1000);
    if (diff < 2) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff/60)}m ago`;
  };

  const handleTunnel = async (port, e) => {
    e.stopPropagation();
    try {
      await startTunnel(port, null); // Backend will auto-select ngrok or cloudflared
      toast.success(`Tunnel started for port ${port}`);
    } catch (err) {
      toast.error(err.message || 'Failed to start tunnel');
    }
  };

  const handleStopTunnel = async (port, e) => {
    e.stopPropagation();
    await stopTunnel(port);
    toast.success(`Tunnel stopped for port ${port}`);
  };

  const handleKill = async (pid, name, port, e) => {
    e.stopPropagation();
    if (!pid) return;
    setKillConfirm({ pid, name, port });
  };

  const confirmKill = async (e) => {
    e.stopPropagation();
    if (!killConfirm) return;
    const { pid, name, port } = killConfirm;
    
    try {
      const res = await killPortProcess(pid);
      if (res.success) {
        toast.success(`Killed process ${name} on port ${port}`);
      } else {
        toast.error(`Failed: ${res.error}`);
      }
    } catch {
      toast.error('Kill request failed');
    } finally {
      setKillConfirm(null);
    }
  };

  return (
    <div className="w-80 flex-shrink-0 glass-panel-solid rounded-r-xl flex flex-col h-full overflow-hidden text-sm shadow-lg">
      <div className="p-3 border-b border-ctp-surface0/50 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between font-semibold text-ctp-text">
          <div className="flex items-center gap-2">
            <Wifi size={16} className="text-ctp-blue" />
            <span className="truncate">Active Ports</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-ctp-subtext0 hover:text-ctp-text transition-colors">
              <span className="relative flex h-2 w-2">
                {autoRefreshPorts && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ctp-green opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${autoRefreshPorts ? 'bg-ctp-green' : 'bg-ctp-surface2'}`}></span>
              </span>
              Auto
              <input type="checkbox" className="sr-only" checked={autoRefreshPorts} onChange={(e) => setAutoRefreshPorts(e.target.checked)} />
            </label>
            <button 
              onClick={fetchPorts} 
              disabled={isScanning}
              className={`p-1 rounded hover:bg-ctp-surface0/50 transition-colors ${isScanning ? 'text-ctp-blue' : 'text-ctp-subtext0 hover:text-ctp-text'}`}
              title="Scan Now"
            >
              <RefreshCw size={14} className={isScanning ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        <div className="text-[9px] text-ctp-surface2 flex justify-between px-0.5">
          <span>Local machine bindings</span>
          <span>Last scan: {formatRelativeTime(lastScanned)}</span>
        </div>
      </div>

      <div className="p-2 border-b border-ctp-crust bg-ctp-base/30 relative">
        <Search size={12} className="absolute left-4 top-1/2 -translate-y-1/2 text-ctp-surface2" />
        <input 
          type="text" 
          placeholder="Filter by port or process..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-ctp-crust border border-ctp-surface0 rounded px-8 py-1.5 text-xs text-ctp-text outline-none focus:border-ctp-blue transition-colors"
        />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5 bg-ctp-crust/20">
        {filteredPorts.length === 0 ? (
          <div className="text-center p-6 text-xs text-ctp-surface2 flex flex-col items-center gap-2">
            <AlertCircle size={20} className="opacity-50" />
            <span>No open ports found.</span>
            <span className="text-[10px] opacity-70 mt-2">Note: On Windows, some ports may be hidden without Administrator privileges.</span>
          </div>
        ) : (
          filteredPorts.map((p, idx) => (
            <div key={`${p.port}-${p.protocol}-${idx}`} className="flex flex-col p-2 bg-ctp-base border border-ctp-surface0 rounded-lg hover:border-ctp-surface1 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`font-mono font-bold text-[13px] w-12 ${getPortColor(p.port)}`}>{p.port}</span>
                  <span className={`text-xs font-semibold truncate max-w-[80px] ${getProcessColor(p.processName)}`}>{p.processName}</span>
                </div>
                <div className="flex items-center gap-2">
                  {p.state === 'ESTABLISHED' ? (
                    <span className="text-[9px] px-1.5 py-0.5 bg-ctp-surface0 text-ctp-subtext0 rounded border border-ctp-surface1">ESTABLISHED</span>
                  ) : (
                    <span className="text-[9px] text-ctp-surface2">{p.state}</span>
                  )}
                  <span className="text-[9px] text-ctp-surface2 uppercase">{p.protocol}</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-2 pl-[60px]">
                <div className="text-[10px] text-ctp-subtext0 font-mono truncate max-w-[120px]" title={p.localAddress}>
                  {p.localAddress}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {tunnelLoading[p.port] ? (
                     <div className="p-1 text-ctp-yellow"><Loader2 size={12} className="animate-spin" /></div>
                  ) : p.tunnelUrl ? (
                    <button onClick={(e) => handleStopTunnel(p.port, e)} className="p-1 rounded bg-ctp-red/10 text-ctp-red border border-ctp-red/20 hover:bg-ctp-red/20 transition-colors" title="Stop Tunnel">
                      <X size={12} />
                    </button>
                  ) : (
                    <button onClick={(e) => handleTunnel(p.port, e)} className="p-1 rounded hover:bg-ctp-surface0 text-ctp-blue border border-transparent hover:border-ctp-surface1 transition-colors" title="Start ngrok Tunnel">
                      <Link size={12} />
                    </button>
                  )}
                  
                  {p.pid && (
                    <button onClick={(e) => handleKill(p.pid, p.processName, p.port, e)} className="p-1 rounded hover:bg-ctp-red/10 text-ctp-subtext0 hover:text-ctp-red border border-transparent hover:border-ctp-red/20 transition-colors" title={`Kill PID ${p.pid}`}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Tunnel Status Inline */}
              {p.tunnelUrl && (
                <div className="mt-2 pt-2 border-t border-ctp-surface0 flex items-center justify-between text-[10px]">
                  <span className="text-ctp-green flex items-center gap-1.5"><Link size={10}/> Tunnel active ({p.tunnelProvider})</span>
                  <a href={p.tunnelUrl} target="_blank" rel="noreferrer" className="text-ctp-blue hover:underline font-mono truncate max-w-[120px]">{p.tunnelUrl}</a>
                </div>
              )}

              {/* Inline Kill Confirmation */}
              {killConfirm?.port === p.port && (
                <div className="mt-2 pt-2 border-t border-ctp-red/30 flex items-center justify-between animate-in slide-in-from-top-1">
                  <span className="text-[10px] text-ctp-red font-semibold">Kill {killConfirm.name}?</span>
                  <div className="flex gap-1.5">
                    <button onClick={(e) => { e.stopPropagation(); setKillConfirm(null); }} className="text-[9px] px-2 py-1 rounded bg-ctp-surface0 text-ctp-subtext0 hover:text-ctp-text transition-colors">Cancel</button>
                    <button onClick={confirmKill} className="text-[9px] px-2 py-1 rounded bg-ctp-red text-ctp-crust font-bold hover:opacity-90 transition-opacity">Confirm</button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}