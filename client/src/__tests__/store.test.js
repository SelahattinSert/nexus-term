import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('useStore', () => {
  beforeEach(() => {
    const initialState = useStore.getInitialState();
    useStore.setState(initialState, true);
    localStorage.clear();
  });

  it('should toggle sidebar', () => {
    expect(useStore.getState().isSidebarOpen).toBe(false);
    useStore.getState().toggleSidebar();
    expect(useStore.getState().isSidebarOpen).toBe(true);
    useStore.getState().toggleSidebar();
    expect(useStore.getState().isSidebarOpen).toBe(false);
  });

  it('should create, remove, and manage sessions/panes', () => {
    const { createSession, removeSession, updateSession, setFocusedPane, addPane, removePane, swapPane } = useStore.getState();
    
    // Create 5 sessions to test pane limit and background behavior
    createSession(); // 1
    createSession(); // 2
    createSession(); // 3
    createSession(); // 4
    createSession(); // 5
    
    let state = useStore.getState();
    expect(state.sessions.length).toBe(5);
    expect(state.panes.length).toBe(4); // Max 4 visible
    
    const firstSessionId = state.sessions[0].id;
    const fifthSessionId = state.sessions[4].id;

    // Test updateSession
    updateSession(firstSessionId, { pwd: '/var/www' });
    state = useStore.getState();
    expect(state.sessions[0].pwd).toBe('/var/www');

    // Test setFocusedPane
    setFocusedPane(firstSessionId);
    state = useStore.getState();
    expect(state.focusedPane).toBe(firstSessionId);

    // Test removePane (move to background)
    removePane(firstSessionId);
    state = useStore.getState();
    expect(state.panes.includes(firstSessionId)).toBe(false);
    expect(state.panes.length).toBe(3);

    // Test addPane
    addPane(firstSessionId);
    state = useStore.getState();
    expect(state.panes.includes(firstSessionId)).toBe(true);
    expect(state.panes.length).toBe(4);

    // Try adding a pane when full
    addPane(fifthSessionId);
    state = useStore.getState();
    expect(state.panes.includes(fifthSessionId)).toBe(false);

    // Test swapPane
    swapPane(0, fifthSessionId);
    state = useStore.getState();
    expect(state.panes[0]).toBe(fifthSessionId);

    // Test removing a visible session to see if background session fills in
    const visibleSessionId = state.panes[1];
    removeSession(visibleSessionId);
    state = useStore.getState();
    expect(state.sessions.length).toBe(4);
    // Panes should still be 4 if there are enough background sessions, but here there are exactly 4 sessions
    expect(state.panes.length).toBe(4);
  });

  it('should add and remove snippets', () => {
    const { addSnippet, removeSnippet } = useStore.getState();
    addSnippet({ name: 'test', command: 'echo test' });
    
    let state = useStore.getState();
    const id = state.snippets[0].id;
    expect(state.snippets.length).toBe(1);
    
    removeSnippet(id);
    expect(useStore.getState().snippets.length).toBe(0);
  });

  it('should add, update, and dismiss errors', () => {
    const { addError, dismissError } = useStore.getState();
    
    addError('sess-1', { description: 'Error 1' }, 'err-1');
    expect(useStore.getState().errors.length).toBe(1);
    
    // Updating existing error
    addError('sess-1', { description: 'Updated Error' }, 'err-1');
    expect(useStore.getState().errors[0].description).toBe('Updated Error');

    dismissError('err-1');
    expect(useStore.getState().errors.length).toBe(0);
  });

  it('should handle system executables and stats', () => {
    const { setExecutables, setSystemStats } = useStore.getState();
    
    setExecutables(['ls', 'cd', 'git']);
    expect(useStore.getState().executables.length).toBe(3);

    const stats = { cpu: 10, ram: 50 };
    setSystemStats(stats);
    expect(useStore.getState().systemStats).toEqual(stats);
  });
});
