import React from 'react';
import { useStore } from '../store';

export default function SystemMonitor() {
  const systemStats = useStore(state => state.systemStats);

  if (!systemStats) return null;

  return (
    <>
      <span title={`RAM: ${Math.round(systemStats.usedMem / 1073741824 * 10) / 10}GB / ${Math.round(systemStats.totalMem / 1073741824 * 10) / 10}GB`}>
        🧠 {systemStats.ram}%
      </span>
      <span>
        💻 {systemStats.cpu}%
      </span>
    </>
  );
}