import React from 'react';
import { useStore } from '../store';

// SVG Circular Gauge — Cyberpunk neon ring indicator
function NeonGauge({ value, label, color, size = 32 }) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex items-center gap-1.5 group cursor-default" title={`${label}: ${value}%`}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--ctp-surface0)" strokeWidth={strokeWidth}
        />
        {/* Animated value arc */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.8s ease-out',
            filter: `drop-shadow(0 0 4px ${color}40)`,
          }}
        />
      </svg>
      <div className="flex flex-col leading-none">
        <span className="text-[10px] font-bold tabular-nums" style={{ color }}>{value}%</span>
        <span className="text-[8px] text-ctp-subtext0 uppercase tracking-wider opacity-70">{label}</span>
      </div>
    </div>
  );
}

export default function SystemMonitor() {
  const systemStats = useStore(state => state.systemStats);

  if (!systemStats) return null;

  return (
    <div className="flex items-center gap-3">
      <NeonGauge value={systemStats.cpu} label="CPU" color="var(--ctp-blue)" />
      <NeonGauge value={systemStats.ram} label="RAM" color="var(--ctp-peach)" />
    </div>
  );
}