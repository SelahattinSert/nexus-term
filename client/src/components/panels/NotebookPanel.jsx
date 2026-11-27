import React, { useEffect, useState } from 'react';
import {
  NotebookPen, Search, Play, Copy, Check, X, Trash2, Download, HardDrive, ChevronDown, ChevronRight, Bot,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '../../store';

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function duration(ms) {
  if (ms == null) return '';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function ExitBadge({ code }) {
  if (code === 0) return <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-ctp-green/15 text-ctp-green" title="Succeeded"><Check size={12} /></span>;
  if (code == null) return <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-ctp-surface0 text-ctp-subtext0 text-[10px]" title="Exit code unknown">?</span>;
  return <span className="shrink-0 min-w-5 h-5 px-1 rounded-full flex items-center justify-center bg-ctp-red/15 text-ctp-red text-[10px] font-bold" title={`Failed with exit code ${code}`}>{code}</span>;
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function BlockCard({ block }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(block.note || '');
  const selected = useStore(state => state.selectedBlockIds.includes(block.id));
  const toggleBlockSelected = useStore(state => state.toggleBlockSelected);
  const annotateBlock = useStore(state => state.annotateBlock);
  const focusedPane = useStore(state => state.focusedPane);
  const sessions = useStore(state => state.sessions);

  const byAgent = (block.note || '').startsWith('Run by ');

  const runAgain = () => {
    if (!focusedPane || !sessions.some(s => s.id === focusedPane)) {
      toast.error('Focus a terminal first.');
      return;
    }
    window.dispatchEvent(new CustomEvent('nexus-execute-command', { detail: { sessionId: focusedPane, command: block.command } }));
  };

  const copy = async () => {
    await navigator.clipboard.writeText(block.command);
    toast.success('Command copied');
  };

  const saveNote = async () => {
    if (note === (block.note || '')) return;
    try {
      await annotateBlock(block.id, note);
    } catch {
      toast.error('Could not save note');
    }
  };

  return (
    <div className={`rounded-lg border transition-colors ${selected ? 'border-ctp-lavender bg-ctp-lavender/5' : 'border-ctp-surface0 bg-ctp-crust/40 hover:border-ctp-surface1'}`}>
      <div className="flex items-start gap-2 p-2 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleBlockSelected(block.id)}
          className="mt-1 accent-[var(--ctp-lavender)] cursor-pointer"
          title="Select for runbook export"
        />
        <ExitBadge code={block.exitCode} />
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs text-ctp-text break-all line-clamp-2">{block.command || <span className="italic text-ctp-surface2">(unknown command)</span>}</div>
          <div className="text-[10px] text-ctp-surface2 mt-0.5 flex gap-1.5 flex-wrap">
            <span className="truncate max-w-[140px]" title={block.cwd}>{block.cwd}</span>
            <span>· {relativeTime(block.finishedAt)}</span>
            {block.durationMs != null && <span>· {duration(block.durationMs)}</span>}
            {byAgent && <span className="text-ctp-lavender flex items-center gap-0.5"><Bot size={10} /> agent</span>}
          </div>
        </div>
        {expanded ? <ChevronDown size={14} className="text-ctp-surface2 mt-0.5" /> : <ChevronRight size={14} className="text-ctp-surface2 mt-0.5" />}
      </div>

      {expanded && (
        <div className="px-2 pb-2 space-y-2">
          {block.output ? (
            <pre className="text-[11px] leading-snug font-mono bg-ctp-crust border border-ctp-surface0 rounded p-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-ctp-subtext1">{block.output}</pre>
          ) : (
            <div className="text-[11px] italic text-ctp-surface2">No output</div>
          )}
          {block.truncated && <div className="text-[10px] text-ctp-yellow">Output was truncated (start and end are kept).</div>}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            rows={2}
            placeholder="Add a note (why, what it fixed)…"
            className="w-full bg-ctp-crust border border-ctp-surface0 rounded px-2 py-1 text-xs text-ctp-text placeholder-ctp-surface2 outline-none focus:border-ctp-lavender resize-y"
          />
          <div className="flex gap-1.5">
            <button onClick={runAgain} className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-ctp-blue text-ctp-crust font-medium hover:opacity-85"><Play size={12} /> Run again</button>
            <button onClick={copy} className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-ctp-surface0 text-ctp-subtext0 hover:text-ctp-text hover:bg-ctp-surface0"><Copy size={12} /> Copy</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NotebookPanel() {
  const isSidebarOpen = useStore(state => state.isSidebarOpen);
  const activeSidebarTab = useStore(state => state.activeSidebarTab);
  const blocks = useStore(state => state.blocks);
  const filter = useStore(state => state.notebookFilter);
  const persist = useStore(state => state.notebookPersist);
  const isLoading = useStore(state => state.isNotebookLoading);
  const selectedCount = useStore(state => state.selectedBlockIds.length);
  const focusedPane = useStore(state => state.focusedPane);
  const integrated = useStore(state => state.integratedSessions[state.focusedPane]);
  const setNotebookFilter = useStore(state => state.setNotebookFilter);
  const fetchBlocks = useStore(state => state.fetchBlocks);
  const exportRunbook = useStore(state => state.exportRunbook);
  const clearBlockSelection = useStore(state => state.clearBlockSelection);
  const setNotebookPersist = useStore(state => state.setNotebookPersist);
  const clearNotebook = useStore(state => state.clearNotebook);

  const [query, setQuery] = useState(filter.q);
  const [exportTitle, setExportTitle] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const isOpen = isSidebarOpen && activeSidebarTab === 'notebook';

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { if (query !== filter.q) setNotebookFilter({ q: query }); }, 250);
    return () => clearTimeout(t);
  }, [query, filter.q, setNotebookFilter]);

  useEffect(() => {
    if (!isOpen) return;
    fetchBlocks().catch(() => toast.error('Could not load the notebook'));
  }, [isOpen, filter.q, filter.status, filter.scope, focusedPane, fetchBlocks]);

  if (!isOpen) return null;

  const doExport = async () => {
    try {
      const title = exportTitle.trim() || 'NexusTerm runbook';
      const markdown = await exportRunbook(title);
      download(`${title.replace(/[^\w-]+/g, '-').toLowerCase() || 'runbook'}.md`, markdown);
      await navigator.clipboard.writeText(markdown).catch(() => {});
      toast.success('Runbook downloaded and copied to the clipboard');
      setIsExporting(false);
      setExportTitle('');
      clearBlockSelection();
    } catch {
      toast.error('Export failed');
    }
  };

  const chip = (active) => `px-2 py-0.5 rounded-full text-[11px] border transition-colors ${active ? 'border-ctp-lavender text-ctp-lavender bg-ctp-lavender/10' : 'border-ctp-surface0 text-ctp-subtext0 hover:text-ctp-text'}`;

  return (
    <div className="w-80 glass-panel-solid rounded-r-xl flex flex-col h-full text-sm shrink-0 shadow-lg">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-ctp-surface0">
        <div className="flex items-center gap-2">
          <NotebookPen size={16} className="text-ctp-lavender" />
          <h2 className="text-xs font-bold tracking-wide uppercase text-ctp-lavender">Notebook</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setNotebookPersist(!persist).catch(() => toast.error('Could not change setting'))}
            title={persist ? 'History is saved to disk (~/.nexusterm/notebook). Click to keep it in memory only.' : 'History is kept in memory only. Click to save it to disk.'}
            className={`p-1.5 rounded hover:bg-ctp-surface0 ${persist ? 'text-ctp-green' : 'text-ctp-surface2'}`}
          >
            <HardDrive size={14} />
          </button>
          <button onClick={() => setConfirmClear(true)} title="Clear notebook" className="p-1.5 rounded hover:bg-ctp-surface0 text-ctp-subtext0 hover:text-ctp-red">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {confirmClear && (
        <div className="m-2 p-2 rounded-lg border border-ctp-red/40 bg-ctp-red/5 text-xs space-y-2">
          <p>Delete every recorded command and output? This cannot be undone.</p>
          <div className="flex gap-2">
            <button className="flex-1 py-1 rounded bg-ctp-red text-ctp-crust font-bold" onClick={async () => { await clearNotebook(); setConfirmClear(false); }}>Delete</button>
            <button className="flex-1 py-1 rounded border border-ctp-surface0" onClick={() => setConfirmClear(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="p-2 space-y-2 border-b border-ctp-surface0">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-2 text-ctp-surface2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, output, notes…"
            className="w-full bg-ctp-crust border border-ctp-surface0 rounded-lg pl-8 pr-2 py-1.5 text-xs text-ctp-text placeholder-ctp-surface2 outline-none focus:border-ctp-lavender"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button className={chip(!filter.status)} onClick={() => setNotebookFilter({ status: '' })}>All</button>
          <button className={chip(filter.status === 'failed')} onClick={() => setNotebookFilter({ status: 'failed' })}>Failed</button>
          <button className={chip(filter.status === 'succeeded')} onClick={() => setNotebookFilter({ status: 'succeeded' })}>Succeeded</button>
          <span className="w-px bg-ctp-surface0 mx-0.5" />
          <button className={chip(filter.scope === 'all')} onClick={() => setNotebookFilter({ scope: 'all' })}>All tabs</button>
          <button className={chip(filter.scope === 'focused')} onClick={() => setNotebookFilter({ scope: 'focused' })}>This tab</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {blocks.length === 0 && !isLoading && (
          <div className="text-xs text-ctp-surface2 text-center mt-8 px-4 space-y-2">
            <p>No commands recorded yet.</p>
            <p>Commands run in bash, zsh and PowerShell tabs appear here with their exit code and output.</p>
            {focusedPane && integrated === undefined && <p className="text-ctp-yellow">The focused tab has not reported any command yet. fish, sh, cmd.exe and SSH tabs are not recorded.</p>}
          </div>
        )}
        {blocks.map(block => <BlockCard key={block.id} block={block} />)}
      </div>

      {selectedCount > 0 && (
        <div className="p-2 border-t border-ctp-surface0 space-y-2">
          {isExporting ? (
            <>
              <input
                autoFocus
                value={exportTitle}
                onChange={(e) => setExportTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doExport(); if (e.key === 'Escape') setIsExporting(false); }}
                placeholder="Runbook title, e.g. Deploy the API"
                className="w-full bg-ctp-crust border border-ctp-surface0 rounded px-2 py-1.5 text-xs outline-none focus:border-ctp-lavender"
              />
              <div className="flex gap-2">
                <button onClick={doExport} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-ctp-lavender text-ctp-crust text-xs font-bold"><Download size={12} /> Export .md</button>
                <button onClick={() => setIsExporting(false)} className="px-2 rounded border border-ctp-surface0 text-xs"><X size={12} /></button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ctp-subtext0 flex-1">{selectedCount} selected</span>
              <button onClick={clearBlockSelection} className="text-xs text-ctp-surface2 hover:text-ctp-text">Clear</button>
              <button onClick={() => setIsExporting(true)} className="flex items-center gap-1 px-2 py-1 rounded bg-ctp-lavender text-ctp-crust text-xs font-bold"><Download size={12} /> Runbook</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
