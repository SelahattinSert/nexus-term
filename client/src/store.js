import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useStore = create(
  persist(
    (set) => ({
      // Array of all sessions (background and visible)
      // session: { id: string, pwd: string, gitStatus: { branch, changedFiles } | null }
      sessions: [],
      
      // Array of session IDs that are currently visible in the grid (max 4)
      panes: [],
      
      // The ID of the currently focused/active terminal pane
      focusedPane: null,

      // Global errors array, each error now has an associated sessionId
      errors: [],

      // Sidebar visibility state
      isSidebarOpen: false,
      activeSidebarTab: 'explorer', // 'explorer' or 'git' or 'snippets'

      // Theme
      theme: 'theme-mocha',

      // Snippets
      snippets: [],

      // System executables for autocomplete
      executables: [],

      // --- UI Management ---
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab, isSidebarOpen: true }),
      setTheme: (theme) => set({ theme }),

      // --- Snippet Management ---
      addSnippet: (snippet) => set((state) => ({
        snippets: [...state.snippets, { ...snippet, id: crypto.randomUUID() }]
      })),
      removeSnippet: (id) => set((state) => ({
        snippets: state.snippets.filter(s => s.id !== id)
      })),


      // --- Session Management ---

      createSession: () => set((state) => {
        const newId = crypto.randomUUID();
        const newSession = { id: newId, pwd: '~', gitStatus: null };
        
        // If we have less than 4 visible panes, show it immediately, else add to background
        const newPanes = state.panes.length < 4 ? [...state.panes, newId] : state.panes;
        
        return {
          sessions: [...state.sessions, newSession],
          panes: newPanes,
          focusedPane: newId // Focus the newly created session
        };
      }),

      removeSession: (id) => set((state) => {
        const newSessions = state.sessions.filter((s) => s.id !== id);
        const newPanes = state.panes.filter((paneId) => paneId !== id);
        
        // If we removed a visible pane, try to fill the gap with a background session if available
        if (newPanes.length < state.panes.length) {
          const backgroundSessions = newSessions.filter(s => !newPanes.includes(s.id));
          if (backgroundSessions.length > 0 && newPanes.length < 4) {
            newPanes.push(backgroundSessions[0].id);
          }
        }

        // Determine new focus
        let newFocusedPane = state.focusedPane;
        if (state.focusedPane === id) {
          newFocusedPane = newPanes.length > 0 ? newPanes[newPanes.length - 1] : null;
        }

        // Also clean up any errors associated with this session
        const newErrors = state.errors.filter((e) => e.sessionId !== id);

        return {
          sessions: newSessions,
          panes: newPanes,
          focusedPane: newFocusedPane,
          errors: newErrors
        };
      }),

      updateSession: (id, updates) => set((state) => ({
        sessions: state.sessions.map((s) => 
          s.id === id ? { ...s, ...updates } : s
        )
      })),

      // --- Grid & Pane Management ---

      setFocusedPane: (id) => set({ focusedPane: id }),

      // Add a background session to the visible grid
      addPane: (id) => set((state) => {
        if (state.panes.includes(id) || state.panes.length >= 4) return state;
        return { 
          panes: [...state.panes, id],
          focusedPane: id
        };
      }),

      // Remove a session from the visible grid (moves it to background)
      removePane: (id) => set((state) => {
        const newPanes = state.panes.filter((paneId) => paneId !== id);
        return {
          panes: newPanes,
          focusedPane: state.focusedPane === id ? (newPanes[0] || null) : state.focusedPane
        };
      }),

      // Swap a visible pane at a specific index with another session
      swapPane: (paneIndex, newSessionId) => set((state) => {
        if (!state.sessions.find(s => s.id === newSessionId)) return state;
        
        const newPanes = [...state.panes];
        if (!newPanes.includes(newSessionId)) {
          newPanes[paneIndex] = newSessionId;
        }
        
        return { 
          panes: newPanes,
          focusedPane: newSessionId
        };
      }),

      // --- Error Management ---
      addError: (sessionId, rule, errorId) => set((state) => {
        const id = errorId || Date.now();
        const existingIndex = state.errors.findIndex(e => e.id === id);
        
        if (existingIndex >= 0) {
          const newErrors = [...state.errors];
          newErrors[existingIndex] = { ...rule, id, sessionId };
          return { errors: newErrors };
        }
        
        return {
          errors: [...state.errors, { ...rule, id, sessionId }]
        };
      }),
      
      dismissError: (id) => set((state) => ({
        errors: state.errors.filter((e) => e.id !== id),
      })),

      // --- Autocomplete Management ---
      setExecutables: (executables) => set({ executables }),

      // --- System Monitor ---
      systemStats: null,
      setSystemStats: (stats) => set({ systemStats: stats })
    }),
    {
      name: 'nexus-store', // unique name
      storage: createJSONStorage(() => localStorage), // use localStorage to persist snippets and tabs
      partialize: (state) => ({
        snippets: state.snippets,
        activeSidebarTab: state.activeSidebarTab,
        isSidebarOpen: state.isSidebarOpen,
        theme: state.theme,
      }),
    }
  )
);
