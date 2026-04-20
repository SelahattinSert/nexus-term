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

  return (
    <div 
      onClickCapture={() => setFocusedPane(paneId)}
      className={`w-full h-full relative border ${focusedPane === paneId ? 'border-ctp-blue z-10' : 'border-ctp-surface0'} bg-ctp-base overflow-hidden flex flex-col`}
    >
      <ErrorOverlay sessionId={paneId} />
      {isSession && (
        <div className="absolute inset-0 pl-2 pt-2">
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
    className={`group flex items-center justify-center bg-ctp-crust transition-colors ${direction === 'horizontal' ? 'w-1.5 cursor-col-resize hover:bg-ctp-surface0' : 'h-1.5 cursor-row-resize hover:bg-ctp-surface0'}`}
    orientation={direction}
  >
    <div className={`bg-ctp-surface2 rounded-full transition-colors group-hover:bg-ctp-blue ${direction === 'horizontal' ? 'w-0.5 h-8' : 'h-0.5 w-8'}`} />
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