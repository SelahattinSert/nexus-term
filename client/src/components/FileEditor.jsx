import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '../store';
import { toast } from 'sonner';

export default function FileEditor({ paneId }) {
  const { editors, updateEditor, theme } = useStore();
  const editorState = editors.find(e => e.id === paneId);
  const [loading, setLoading] = useState(!!editorState?.path); // Initialize as loading if path exists
  const [initialContent, setInitialContent] = useState('');
  const editorRef = useRef(null);
  
  // Track isDirty in a ref to avoid stale closures in the memoized Editor
  const isDirtyRef = useRef(editorState?.isDirty);
  useEffect(() => {
    isDirtyRef.current = editorState?.isDirty;
  }, [editorState?.isDirty]);

  useEffect(() => {
    if (!editorState?.path) {
      return;
    }
    const token = new URLSearchParams(window.location.search).get('token');
    
    // We don't call setLoading(true) here anymore because it's initialized above
    // or handled by the dependency change if paneId changes.
    
    let isMounted = true;
    
    fetch(`/api/file/content?path=${encodeURIComponent(editorState.path)}&token=${token}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch file');
        return res.json();
      })
      .then(data => {
        if (isMounted) {
          setInitialContent(data.content);
          updateEditor(paneId, { isDirty: false });
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          toast.error('Error opening file: ' + err.message);
          setLoading(false);
        }
      });
      
    return () => { isMounted = false; };
  }, [paneId, editorState?.path, updateEditor]);

  const handleSave = useCallback(() => {
    if (!editorState || !editorRef.current) return;
    const token = new URLSearchParams(window.location.search).get('token');
    const currentContent = editorRef.current.getValue();
    
    fetch(`/api/file/content?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: editorState.path, content: currentContent })
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to save');
        updateEditor(paneId, { isDirty: false });
        toast.success('File saved');
      })
      .catch(err => toast.error('Error saving file: ' + err.message));
  }, [editorState, paneId, updateEditor]);

  const handleEditorChange = useCallback(() => {
    if (!isDirtyRef.current) {
      updateEditor(paneId, { isDirty: true });
    }
  }, [paneId, updateEditor]);

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    
    // Add built-in command for saving
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });
  }, [handleSave]);

  const filename = editorState?.path ? editorState.path.split(/[/\\]/).pop() : '';
  const monacoTheme = theme === 'theme-latte' ? 'vs' : 'vs-dark';
  const editorPath = editorState?.path || '';

  // Memoize the Editor to prevent React re-renders (triggered by isDirty changes)
  // from passing new props to Monaco and resetting its internal state.
  const EditorComponent = useMemo(() => {
    if (!editorPath) return null;
    return (
      <Editor
        height="100%"
        theme={monacoTheme}
        path={editorPath} // Use full path to prevent model collisions between files with same name
        defaultValue={initialContent}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontWeight: '550',
          letterSpacing: -0.5,
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          padding: { top: 8 }
        }}
      />
    );
  }, [monacoTheme, editorPath, initialContent, handleEditorChange, handleEditorDidMount]);

  if (!editorState || loading) {
    return <div className="w-full h-full flex items-center justify-center text-ctp-subtext0 text-sm">Loading editor...</div>;
  }

  return (
    <div className="w-full h-full flex flex-col" onKeyDown={handleKeyDown}>
      <div className="h-8 border-b border-ctp-surface0 flex items-center px-4 bg-ctp-crust text-xs text-ctp-text shrink-0 justify-between">
        <span className="font-mono">{filename}{editorState.isDirty ? ' •' : ''}</span>
        <button 
          onClick={handleSave} 
          className={`px-2 py-0.5 rounded transition-colors ${editorState.isDirty ? 'bg-ctp-blue text-ctp-crust hover:bg-opacity-80' : 'text-ctp-subtext0 cursor-not-allowed'}`}
          disabled={!editorState.isDirty}
        >
          Save
        </button>
      </div>
      <div className="flex-1 overflow-hidden bg-ctp-base">
        {EditorComponent}
      </div>
    </div>
  );
}