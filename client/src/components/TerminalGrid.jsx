import React from 'react';
import { useStore } from '../store';
import NexusTerm from './NexusTerm';
import ErrorOverlay from './ErrorOverlay';
import FileEditor from './FileEditor';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';

const PaneWrapper = ({ paneId, focusedPane, setFocusedPane }) => {
  const { sessions, editors = [] } = useStore();
  const isEditor = editors.some(e => e.id === paneId);
  const isSession = sessions.some(s => s.id === paneId);
  const share = useStore(state => state.shares[paneId]);
  const openShareDialog = useStore(state => state.openShareDialog);

  return (
    <div 
      onClickCapture={() => setFocusedPane(paneId)}
      className={`w-full h-full relative border ${focusedPane === paneId ? 'border-ctp-blue z-10' : 'border-ctp-surface0'} bg-ctp-base overflow-hidden flex flex-col`}
    >
      <ErrorOverlay sessionId={paneId} />
      {share && (
        <button
          onClick={() => openShareDialog(paneId)}
          className="absolute top-1.5 right-3 z-20 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold"
          style={{ borderColor: 'var(--ctp-red)', color: 'var(--ctp-red)', backgroundColor: 'color-mix(in srgb, var(--ctp-mantle) 85%, transparent)' }}
          title="Shared live — click to manage"
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--ctp-red)' }} /> LIVE
          {(share.guests || []).slice(0, 4).map(g => (
            <span key={g.id} className="w-4 h-4 rounded-full grid place-items-center text-[8px] border"
              style={{ borderColor: `var(${g.color}, var(--ctp-blue))`, color: `var(${g.color}, var(--ctp-blue))` }}
              title={`${g.name}${share.controllerId === g.id ? ' (typing)' : ''}`}>
              {g.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </button>
      )}
      {isSession && (
        <div className="absolute inset-0 p-2 overflow-hidden">
          <NexusTerm sessionId={paneId} />
        </div>
      )}
      {isEditor && (
        <div className="absolute inset-0">
          <FileEditor paneId={paneId} />
        </div>
      )}
    </div>
  );
};

const CustomResizeHandle = ({ direction }) => (
  <PanelResizeHandle 
    className={`group flex items-center justify-center bg-ctp-base/30 transition-all duration-300 ${direction === 'horizontal' ? 'w-1 cursor-col-resize hover:bg-ctp-blue/20' : 'h-1 cursor-row-resize hover:bg-ctp-blue/20'}`}
    orientation={direction}
  >
    <div className={`bg-ctp-surface1 rounded-full transition-all duration-300 group-hover:bg-ctp-blue group-active:bg-ctp-blue shadow-[0_0_8px_rgba(137,180,250,0)] group-hover:shadow-[0_0_8px_rgba(137,180,250,0.5)] ${direction === 'horizontal' ? 'w-0.5 h-12' : 'h-0.5 w-12'}`} />
  </PanelResizeHandle>
);

export default function TerminalGrid() {
  const { panes, focusedPane, setFocusedPane } = useStore();

  if (panes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-ctp-subtext0">
        No active terminals. Create one from the tab bar!
      </div>
    );
  }

  // 1 Pane
  if (panes.length === 1) {
    return (
      <div className="w-full h-full p-1 bg-ctp-crust">
        <PaneWrapper paneId={panes[0]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
      </div>
    );
  }

  // 2 Panes
  if (panes.length === 2) {
    return (
      <div className="w-full h-full p-1 bg-ctp-crust">
        <PanelGroup orientation="horizontal">
          <Panel minSize={20}>
            <PaneWrapper paneId={panes[0]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
          </Panel>
          <CustomResizeHandle direction="horizontal" />
          <Panel minSize={20}>
            <PaneWrapper paneId={panes[1]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
          </Panel>
        </PanelGroup>
      </div>
    );
  }

  // 3 Panes
  if (panes.length === 3) {
    return (
      <div className="w-full h-full p-1 bg-ctp-crust">
        <PanelGroup orientation="horizontal">
          <Panel minSize={20}>
            <PaneWrapper paneId={panes[0]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
          </Panel>
          <CustomResizeHandle direction="horizontal" />
          <Panel minSize={20}>
            <PanelGroup orientation="vertical">
              <Panel minSize={20}>
                <PaneWrapper paneId={panes[1]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
              </Panel>
              <CustomResizeHandle direction="vertical" />
              <Panel minSize={20}>
                <PaneWrapper paneId={panes[2]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    );
  }

  // 4 Panes (max)
  return (
    <div className="w-full h-full p-1 bg-ctp-crust">
      <PanelGroup orientation="horizontal">
        <Panel minSize={20}>
          <PanelGroup orientation="vertical">
            <Panel minSize={20}>
              <PaneWrapper paneId={panes[0]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
            </Panel>
            <CustomResizeHandle direction="vertical" />
            <Panel minSize={20}>
              <PaneWrapper paneId={panes[2]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
            </Panel>
          </PanelGroup>
        </Panel>
        <CustomResizeHandle direction="horizontal" />
        <Panel minSize={20}>
          <PanelGroup orientation="vertical">
            <Panel minSize={20}>
              <PaneWrapper paneId={panes[1]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
            </Panel>
            <CustomResizeHandle direction="vertical" />
            <Panel minSize={20}>
              <PaneWrapper paneId={panes[3]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  );
}