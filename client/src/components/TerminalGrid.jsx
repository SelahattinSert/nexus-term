import React from 'react';
import { useStore } from '../store';
import NexusTerm from './NexusTerm';
import ErrorOverlay from './ErrorOverlay';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { Rnd } from 'react-rnd';

const TerminalWrapper = ({ paneId, focusedPane, setFocusedPane }) => (
  <div 
    onClickCapture={() => setFocusedPane(paneId)}
    className={`w-full h-full relative border ${focusedPane === paneId ? 'border-ctp-blue z-10' : 'border-ctp-surface0'} bg-ctp-base overflow-hidden`}
  >
    <ErrorOverlay sessionId={paneId} />
    {/* Terminal Container - Absolute inset-0 forces strict height constraint for xterm.js fitAddon */}
    <div className="absolute inset-0 pl-2 pt-2">
      <NexusTerm sessionId={paneId} />
    </div>
  </div>
);

const CustomResizeHandle = ({ direction }) => (
  <PanelResizeHandle 
    className={`group flex items-center justify-center bg-ctp-crust transition-colors ${direction === 'horizontal' ? 'w-1.5 cursor-col-resize hover:bg-ctp-surface0' : 'h-1.5 cursor-row-resize hover:bg-ctp-surface0'}`}
    orientation={direction}
  >
    <div className={`bg-ctp-surface2 rounded-full transition-colors group-hover:bg-ctp-blue ${direction === 'horizontal' ? 'w-0.5 h-8' : 'h-0.5 w-8'}`} />
  </PanelResizeHandle>
);

const FloatingTerminal = ({ paneId, isMinimized, toggleMinimize, removePane }) => {
    const { focusedPane, setFocusedPane } = useStore();

    if (isMinimized) return null; // Minimized rendering handled elsewhere

    return (
        <Rnd
            default={{
                x: 100, y: 100, width: 500, height: 350
            }}
            minWidth={300}
            minHeight={200}
            bounds="parent"
            className="z-50 bg-ctp-crust border border-ctp-blue shadow-2xl rounded-lg overflow-hidden flex flex-col"
            onMouseDownCapture={() => setFocusedPane(paneId)}
            style={{ zIndex: focusedPane === paneId ? 51 : 50 }}
            dragHandleClassName="floating-header"
        >
            <div className="floating-header bg-ctp-mantle p-1 flex justify-between items-center cursor-move border-b border-ctp-surface0">
                <span className="text-xs text-ctp-text pl-2 truncate max-w-[250px]">Floating Term: {paneId}</span>
                <div className="flex gap-2 pr-2">
                    <button onClick={(e) => { e.stopPropagation(); toggleMinimize(paneId); }} className="text-ctp-overlay1 hover:text-ctp-text">-</button>
                    <button onClick={(e) => { e.stopPropagation(); removePane(paneId); }} className="text-ctp-red hover:text-ctp-red-dark">x</button>
                </div>
            </div>
            <div className="flex-1 relative">
                <TerminalWrapper paneId={paneId} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
            </div>
        </Rnd>
    );
};

export default function TerminalGrid() {
  const { panes, minimizedPanes = [], toggleMinimize, removePane, focusedPane, setFocusedPane } = useStore();

  const gridPanes = panes.slice(0, 4);
  const floatingPanes = panes.slice(4);

  const renderGrid = () => {
      if (gridPanes.length === 0) {
        return (
          <div className="w-full h-full flex items-center justify-center text-ctp-subtext0">
            No active terminals. Create one from the tab bar!
          </div>
        );
      }

      // 1 Pane
      if (gridPanes.length === 1) {
        return (
          <div className="w-full h-full p-1 bg-ctp-crust">
            <TerminalWrapper paneId={gridPanes[0]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
          </div>
        );
      }

      // 2 Panes
      if (gridPanes.length === 2) {
        return (
          <div className="w-full h-full p-1 bg-ctp-crust">
            <PanelGroup orientation="horizontal">
              <Panel minSize={20}>
                <TerminalWrapper paneId={gridPanes[0]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
              </Panel>
              <CustomResizeHandle direction="horizontal" />
              <Panel minSize={20}>
                <TerminalWrapper paneId={gridPanes[1]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
              </Panel>
            </PanelGroup>
          </div>
        );
      }

      // 3 Panes
      if (gridPanes.length === 3) {
        return (
          <div className="w-full h-full p-1 bg-ctp-crust">
            <PanelGroup orientation="horizontal">
              <Panel minSize={20}>
                <TerminalWrapper paneId={gridPanes[0]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
              </Panel>
              <CustomResizeHandle direction="horizontal" />
              <Panel minSize={20}>
                <PanelGroup orientation="vertical">
                  <Panel minSize={20}>
                    <TerminalWrapper paneId={gridPanes[1]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
                  </Panel>
                  <CustomResizeHandle direction="vertical" />
                  <Panel minSize={20}>
                    <TerminalWrapper paneId={gridPanes[2]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
                  </Panel>
                </PanelGroup>
              </Panel>
            </PanelGroup>
          </div>
        );
      }

      // 4 Panes
      return (
        <div className="w-full h-full p-1 bg-ctp-crust">
          <PanelGroup orientation="horizontal">
            <Panel minSize={20}>
              <PanelGroup orientation="vertical">
                <Panel minSize={20}>
                  <TerminalWrapper paneId={gridPanes[0]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
                </Panel>
                <CustomResizeHandle direction="vertical" />
                <Panel minSize={20}>
                  <TerminalWrapper paneId={gridPanes[2]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
                </Panel>
              </PanelGroup>
            </Panel>
            <CustomResizeHandle direction="horizontal" />
            <Panel minSize={20}>
              <PanelGroup orientation="vertical">
                <Panel minSize={20}>
                  <TerminalWrapper paneId={gridPanes[1]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
                </Panel>
                <CustomResizeHandle direction="vertical" />
                <Panel minSize={20}>
                  <TerminalWrapper paneId={gridPanes[3]} focusedPane={focusedPane} setFocusedPane={setFocusedPane} />
                </Panel>
              </PanelGroup>
            </Panel>
          </PanelGroup>
        </div>
      );
  };

  return (
    <div className="w-full h-full relative">
      
      {renderGrid()}

      {/* Render Floating Panes */}
      {floatingPanes.map(paneId => (
          <FloatingTerminal 
              key={paneId} 
              paneId={paneId} 
              isMinimized={minimizedPanes.includes(paneId)}
              toggleMinimize={toggleMinimize}
              removePane={removePane}
          />
      ))}

      {/* Minimized Bar Overlay */}
      {minimizedPanes.length > 0 && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-ctp-mantle border border-ctp-surface0 rounded-full px-4 py-2 flex gap-2 z-[60] shadow-lg">
              {minimizedPanes.map(id => (
                  <button 
                      key={id}
                      onClick={() => toggleMinimize(id)}
                      className="px-3 py-1 text-xs bg-ctp-surface0 hover:bg-ctp-surface1 text-ctp-text rounded-full truncate max-w-[150px]"
                      title={id}
                  >
                      {id}
                  </button>
              ))}
          </div>
      )}
    </div>
  );
}