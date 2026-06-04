import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Lock, KeyRound, AlertTriangle, Eye, EyeOff, FileText, Check, Plus, GitMerge, ArrowLeft, Loader2, Save, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

function EnvVariableRow({ v, fileId, cwd, onUpdate, onReveal, onHide, revealedValue }) {
  const isRevealed = revealedValue !== undefined;
  const displayValue = isRevealed ? revealedValue : (v.isMasked ? '••••••••' : v.value);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(displayValue);

  const handleEyeClick = async () => {
    if (isRevealed) {
      onHide(fileId, v.key);
    } else {
      await onReveal(fileId, v.key, cwd);
    }
  };

  const handleStartEdit = () => {
    if (v.isMasked && !isRevealed) return; // Cannot edit unrevealed masked values directly here
    setEditValue(displayValue);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
    if (editValue !== displayValue) {
      onUpdate(v.key, editValue);
    }
  };

  return (
    <div className={`flex items-start gap-4 py-3 px-4 hover:bg-ctp-surface0/30 border-b border-ctp-surface0/30 group transition-colors ${v.isDuplicate ? 'bg-ctp-yellow/10' : ''}`}>
      <div className="w-1/4 min-w-[180px] max-w-[250px] font-mono text-sm text-ctp-blue truncate flex items-center gap-2 pt-1" title={v.key}>
        {v.isDuplicate && <AlertTriangle size={14} className="text-ctp-yellow shrink-0" />}
        {v.key}
      </div>
      
      <div className="flex-1 flex items-start gap-2 min-w-0">
        {isEditing ? (
          <textarea 
            autoFocus
            value={editValue} 
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
              if (e.key === 'Escape') { setIsEditing(false); setEditValue(displayValue); }
            }}
            rows={editValue.length > 60 || editValue.includes('\n') ? 3 : 1}
            className="w-full bg-ctp-crust border border-ctp-surface1 rounded px-3 py-1.5 text-sm text-ctp-text outline-none focus:border-ctp-blue font-mono resize-y min-h-[36px]"
          />
        ) : (
          <div 
            onClick={handleStartEdit} 
            title={v.isEmpty ? 'empty' : displayValue}
            className={`w-full font-mono text-sm truncate cursor-text px-1 py-1 rounded hover:bg-ctp-surface0/40 ${v.isEmpty ? 'text-ctp-surface2 italic' : (v.isMasked && !isRevealed ? 'text-ctp-subtext0 tracking-widest' : 'text-ctp-text')}`}
          >
            {v.isEmpty ? 'empty' : displayValue}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 w-32 shrink-0 justify-end pt-1">
        {v.isMasked && (
          <button onClick={handleEyeClick} className="p-1.5 text-ctp-subtext0 hover:text-ctp-text transition-colors rounded hover:bg-ctp-surface0">
            {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
        <span className="text-[10px] px-2 py-0.5 rounded bg-ctp-crust border border-ctp-surface1 text-ctp-surface2 uppercase font-medium">{v.type}</span>
      </div>

      {v.comment && (
        <div className="w-1/4 min-w-[150px] max-w-[300px] text-xs text-ctp-surface2 truncate italic pl-3 border-l border-ctp-surface0 pt-1" title={v.comment}>
          # {v.comment}
        </div>
      )}
    </div>
  );
}

function EnvEditorView({ file, cwd, onBack }) {
  const { saveEnvFile, validateEnvFile, envValidationResults, revealValue, hideValue, revealedKeys } = useStore();
  const [localVars, setLocalVars] = useState(file.variables || []);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  // Sync local vars if file changes externally
  useEffect(() => {
    setLocalVars(file.variables || []);
  }, [file.variables]);

  const handleUpdateVar = (key, newValue) => {
    setLocalVars(prev => prev.map(v => v.key === key ? { ...v, value: newValue } : v));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const res = await saveEnvFile(file.id, localVars, cwd);
    setIsSaving(false);
    if (res.success) toast.success('Saved successfully');
    else toast.error(`Failed to save: ${res.error}`);
  };

  const handleValidate = async () => {
    setIsValidating(true);
    await validateEnvFile(file.id, cwd);
    setIsValidating(false);
  };

  const results = envValidationResults[file.id] || [];
  const errors = results.filter(r => r.severity === 'error');
  const warnings = results.filter(r => r.severity === 'warning');

  return (
    <div className="flex flex-col h-full bg-ctp-crust/20">
      <div className="p-4 border-b border-ctp-surface0 flex items-center justify-between bg-ctp-base shrink-0">
        <div className="flex items-center gap-3 font-mono text-base font-semibold">
          <FileText size={18} className="text-ctp-blue" />
          {file.profileName}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleValidate} disabled={isValidating} className="text-sm px-3 py-1.5 rounded bg-ctp-surface0 hover:bg-ctp-surface1 text-ctp-text flex items-center gap-2 transition-colors">
            {isValidating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Validate
          </button>
          <button onClick={handleSave} disabled={isSaving} className="text-sm px-3 py-1.5 rounded bg-ctp-blue text-ctp-crust hover:opacity-90 font-medium flex items-center gap-2 transition-colors">
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes
          </button>
          <div className="w-px h-6 bg-ctp-surface1 mx-1" />
          <button onClick={onBack} className="p-2 hover:bg-ctp-surface0 rounded-lg text-ctp-subtext0 hover:text-ctp-red transition-colors" title="Close">
            <X size={18} />
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="p-3 text-sm flex items-center gap-4 bg-ctp-surface0/30 border-b border-ctp-surface0 shrink-0">
          {errors.length > 0 && <span className="text-ctp-red flex items-center gap-1.5 font-medium"><AlertTriangle size={14} /> {errors.length} errors</span>}
          {warnings.length > 0 && <span className="text-ctp-yellow flex items-center gap-1.5 font-medium"><AlertTriangle size={14} /> {warnings.length} warnings</span>}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {localVars.map((v, idx) => {
          if (v.isBlank) return <div key={`blank-${idx}`} className="h-6" />;
          if (v.isComment) return <div key={`comment-${idx}`} className="text-sm text-ctp-surface2 italic py-1.5 px-4 font-mono"># {v.value}</div>;
          if (v.isMalformed) return <div key={`malf-${idx}`} className="text-sm text-ctp-red py-1.5 px-4 font-mono">{v.raw}</div>;
          
          return (
            <EnvVariableRow 
              key={`var-${idx}-${v.key}`} 
              v={v} 
              fileId={file.id} 
              cwd={cwd}
              onUpdate={handleUpdateVar}
              onReveal={revealValue}
              onHide={hideValue}
              revealedValue={revealedKeys[`${file.id}:${v.key}`]}
            />
          );
        })}
      </div>
    </div>
  );
}

function EnvDiffView({ fileA, fileB, onBack }) {
  if (!fileA || !fileB) return null;

  const varsA = (fileA.variables || []).filter(v => v.key).reduce((acc, v) => ({ ...acc, [v.key]: v }), {});
  const varsB = (fileB.variables || []).filter(v => v.key).reduce((acc, v) => ({ ...acc, [v.key]: v }), {});
  
  const allKeys = Array.from(new Set([...Object.keys(varsA), ...Object.keys(varsB)])).sort();

  return (
    <div className="flex flex-col h-full bg-ctp-crust/20">
      <div className="p-4 border-b border-ctp-surface0 flex items-center justify-between bg-ctp-base shrink-0">
        <div className="flex items-center gap-6 text-sm font-mono font-semibold">
          <span className="text-ctp-blue flex items-center gap-2"><FileText size={16} /> {fileA.profileName}</span>
          <GitMerge size={16} className="text-ctp-surface2" />
          <span className="text-ctp-green flex items-center gap-2"><FileText size={16} /> {fileB.profileName}</span>
        </div>
        <button onClick={onBack} className="p-2 hover:bg-ctp-surface0 rounded-lg text-ctp-subtext0 hover:text-ctp-red transition-colors" title="Close Diff">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="grid grid-cols-2 text-xs uppercase text-ctp-surface2 tracking-wider p-3 border-b border-ctp-surface0 bg-ctp-base sticky top-0 z-10 font-bold">
          <div className="px-4 truncate">{fileA.filePath.split('/').pop() || fileA.filePath.split('\\').pop()}</div>
          <div className="px-4 border-l border-ctp-surface0 truncate">{fileB.filePath.split('/').pop() || fileB.filePath.split('\\').pop()}</div>
        </div>

        {allKeys.map(key => {
          const valA = varsA[key];
          const valB = varsB[key];
          
          let state = 'identical'; // identical, changed, missing-a, missing-b
          if (!valA) state = 'missing-a';
          else if (!valB) state = 'missing-b';
          else if (valA.value !== valB.value) state = 'changed';

          const getBgA = () => {
            if (state === 'missing-a') return 'bg-ctp-red/10 border-l-2 border-ctp-red';
            if (state === 'changed') return 'bg-ctp-yellow/5 border-l-2 border-ctp-yellow';
            return 'border-l-2 border-transparent hover:bg-ctp-surface0/30';
          };

          const getBgB = () => {
            if (state === 'missing-b') return 'bg-ctp-red/10 border-l-2 border-ctp-red';
            if (state === 'changed') return 'bg-ctp-yellow/5 border-l-2 border-ctp-yellow';
            return 'border-l-2 border-transparent hover:bg-ctp-surface0/30 border-l border-ctp-surface0';
          };

          const renderVal = (v) => {
            if (!v) return <span className="text-ctp-surface2 italic">-</span>;
            if (v.isMasked) return <span className="text-ctp-subtext0 tracking-widest">••••••••</span>;
            if (v.isEmpty) return <span className="text-ctp-surface2 italic">empty</span>;
            return <span className="text-ctp-text whitespace-pre-wrap break-all">{v.value}</span>;
          };

          return (
            <div key={key} className="grid grid-cols-2 font-mono text-sm border-b border-ctp-surface0/30 group">
              <div className={`p-4 flex flex-col gap-2 overflow-hidden ${getBgA()}`}>
                <span className={`truncate font-semibold ${state === 'missing-a' ? 'text-ctp-red/50 line-through' : 'text-ctp-blue'}`}>{key}</span>
                <span>{renderVal(valA)}</span>
              </div>
              <div className={`p-4 flex flex-col gap-2 overflow-hidden ${getBgB()}`}>
                <span className={`truncate font-semibold ${state === 'missing-b' ? 'text-ctp-red/50 line-through' : 'text-ctp-green'}`}>{key}</span>
                <span>{renderVal(valB)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EnvModals() {
  const { envFiles, activeEnvFileId, selectEnvFile, envDiffPair, setEnvDiffPair, sessions, focusedPane } = useStore();
  
  if (!activeEnvFileId && !envDiffPair) return null;

  const focusedSession = sessions.find(s => s.id === focusedPane);
  const cwd = focusedSession?.pwd || null;

  let content = null;
  if (activeEnvFileId) {
    const file = envFiles.find(f => f.id === activeEnvFileId);
    if (file) {
      content = <EnvEditorView file={file} cwd={cwd} onBack={() => selectEnvFile(null)} />;
    }
  } else if (envDiffPair) {
    const fileA = envFiles.find(f => f.id === envDiffPair.aId);
    const fileB = envFiles.find(f => f.id === envDiffPair.bId);
    if (fileA && fileB) {
      content = <EnvDiffView fileA={fileA} fileB={fileB} onBack={() => setEnvDiffPair(null, null)} />;
    }
  }

  if (!content) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm transition-opacity">
      <div 
        className="w-full max-w-[1200px] h-full max-h-[85vh] bg-ctp-crust rounded-xl border border-ctp-surface0 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}

export default function EnvManagerPanel() {
  const { isSidebarOpen, activeSidebarTab, sessions, focusedPane } = useStore();
  const { envFiles, fetchEnvFiles, isEnvLoading, selectEnvFile, setEnvDiffPair, addToGitIgnore, clearAllRevealed } = useStore();
  const [isDiffMode, setIsDiffMode] = useState(false);
  const [diffSelectA, setDiffSelectA] = useState(null);

  // Get active session CWD
  const focusedSession = sessions.find(s => s.id === focusedPane);
  const cwd = focusedSession?.pwd || null;

  useEffect(() => {
    if (isSidebarOpen && activeSidebarTab === 'env' && cwd) {
      fetchEnvFiles(cwd);
    } else if (!isSidebarOpen || activeSidebarTab !== 'env') {
      // Clear revealed secrets when panel closes
      clearAllRevealed();
    }
  }, [isSidebarOpen, activeSidebarTab, cwd, fetchEnvFiles, clearAllRevealed]);

  if (!isSidebarOpen || activeSidebarTab !== 'env') return null;

  const handleAddGitignore = async (fileId, e) => {
    e.stopPropagation();
    const res = await addToGitIgnore(fileId, cwd);
    if (res.success) toast.success('Added to .gitignore');
    else toast.error('Failed to add to .gitignore');
  };

  const handleDiffClick = (file, e) => {
    e.stopPropagation();
    if (!isDiffMode) {
      setIsDiffMode(true);
      setDiffSelectA(file.id);
      toast.info('Select second file to compare');
    } else {
      if (diffSelectA === file.id) {
        setIsDiffMode(false);
        setDiffSelectA(null);
      } else {
        setEnvDiffPair(diffSelectA, file.id);
        setIsDiffMode(false);
        setDiffSelectA(null);
      }
    }
  };

  return (
    <>
      <div className="w-80 flex-shrink-0 glass-panel-solid rounded-r-xl flex flex-col h-full overflow-hidden text-sm shadow-lg">
        <div className="p-3 border-b border-ctp-surface0/50 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between font-semibold text-ctp-text">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-ctp-peach" />
              <span className="truncate">Environment Files</span>
            </div>
            <button 
              onClick={() => fetchEnvFiles(cwd)} 
              disabled={isEnvLoading}
              className={`p-1 rounded hover:bg-ctp-surface0/50 transition-colors ${isEnvLoading ? 'text-ctp-peach' : 'text-ctp-subtext0 hover:text-ctp-text'}`}
            >
              <RefreshCw size={14} className={isEnvLoading ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="text-[10px] text-ctp-surface2 truncate" title={cwd || 'No active directory'}>
            {cwd || 'No active directory'}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-2 bg-ctp-crust/20">
          {envFiles.length === 0 ? (
            <div className="text-center p-6 text-xs text-ctp-surface2 flex flex-col items-center gap-2">
              {isEnvLoading ? (
                <Loader2 size={20} className="animate-spin text-ctp-peach" />
              ) : (
                <>
                  <KeyRound size={20} className="opacity-50" />
                  <span>No .env files found.</span>
                </>
              )}
            </div>
          ) : (
            envFiles.map((file) => {
              const varCount = file.variables?.filter(v => v.key).length || 0;
              const secretCount = file.variables?.filter(v => v.isMasked && v.key).length || 0;

              return (
                <div 
                  key={file.id} 
                  onClick={() => isDiffMode ? handleDiffClick(file, {stopPropagation:()=> {}}) : selectEnvFile(file.id)}
                  className={`flex flex-col p-2 bg-ctp-base border rounded-lg transition-colors cursor-pointer group ${diffSelectA === file.id ? 'border-ctp-blue bg-ctp-blue/5' : 'border-ctp-surface0 hover:border-ctp-surface1'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className={file.isActive ? 'text-ctp-peach' : 'text-ctp-blue'} />
                      <span className="font-mono text-xs font-semibold">{file.filePath.split('/').pop() || file.filePath.split('\\').pop()}</span>
                      {file.isActive && <span className="text-[9px] px-1 bg-ctp-peach/10 text-ctp-peach rounded border border-ctp-peach/20">active</span>}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => handleDiffClick(file, e)} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-ctp-surface0 text-ctp-subtext0 flex items-center gap-1">
                        <GitMerge size={10}/> Diff
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-ctp-surface2 mb-2">
                    <span>{varCount} vars</span>
                    {secretCount > 0 && <span className="text-ctp-peach flex items-center gap-1"><Lock size={10}/> {secretCount}</span>}
                  </div>

                  {!file.hasGitIgnore && (
                    <div className="mt-1 pt-2 border-t border-ctp-red/20 flex items-center justify-between">
                      <span className="text-[10px] text-ctp-red flex items-center gap-1"><AlertTriangle size={10}/> Not in .gitignore</span>
                      <button onClick={(e) => handleAddGitignore(file.id, e)} className="text-[9px] px-1.5 py-0.5 rounded bg-ctp-red/10 text-ctp-red hover:bg-ctp-red/20 transition-colors">
                        Auto-fix
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      <EnvModals />
    </>
  );
}