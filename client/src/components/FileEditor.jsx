import React, { useEffect, useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '../store';
import { toast } from 'sonner';

export default function FileEditor({ paneId }) {
  const { editors, updateEditor, theme } = useStore();
  const editorState = editors.find(e => e.id === paneId);
  const [loading, setLoading] = useState(true);
  const editorRef = useRef(null);

  useEffect(() => {
    if (!editorState) return;
    const token = new URLSearchParams(window.location.search).get('token');
    
    fetch(`/api/file/content?path=${encodeURIComponent(editorState.path)}&token=${token}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch file');
        return res.json();
      })
      .then(data => {
        updateEditor(paneId, { content: data.content, isDirty: false });
        setLoading(false);
      })
      .catch(err => {
        toast.error('Error opening file: ' + err.message);
        setLoading(false);
      });
  }, [paneId, editorState?.path, editorState, updateEditor]);

  const handleSave = () => {
    if (!editorState) return;
    const token = new URLSearchParams(window.location.search).get('token');
    
    fetch(`/api/file/content?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: editorState.path, content: editorState.content })
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to save');
        updateEditor(paneId, { isDirty: false });
        toast.success('File saved');
      })
      .catch(err => toast.error('Error saving file: ' + err.message));
  };

  const handleEditorChange = (value) => {
    updateEditor(paneId, { content: value || '', isDirty: true });
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    
    // Add built-in command for saving
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });
  };

  if (!editorState || loading) {
    return <div className="w-full h-full flex items-center justify-center text-ctp-subtext0 text-sm">Loading editor...</div>;
  }

  const filename = editorState.path.split(/[/\\]/).pop();
  const monacoTheme = theme === 'theme-latte' ? 'vs' : 'vs-dark';

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
        <Editor
          height="100%"
          theme={monacoTheme}
          path={filename} // helps Monaco infer the language from extension
          value={editorState.content}
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
          }}        />
      </div>
    </div>
  );
}