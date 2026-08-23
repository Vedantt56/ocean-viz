import React, { useState } from 'react';
import { X, Activity, Thermometer, Droplet } from 'lucide-react';

export default function ProfilePanel({ profileData, onClose }) {
  const [activeMetric, setActiveMetric] = useState('temperature'); // 'temperature' or 'salinity'

  if (!profileData || !profileData.profiles || profileData.profiles.length === 0) {
    return null;
  }

  const latestProfile = profileData.profiles[0];
  const depthArray = latestProfile.depth || [];
  const valueArray = latestProfile[activeMetric] || [];

  const floatId = profileData.float_id;
  const time = latestProfile.time || 'Latest';

  // SVG Chart Dimensions & Padding
  const width = 280;
  const height = 320;
  const margin = { top: 30, right: 25, bottom: 40, left: 55 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Min / Max calculation for X axis (Temperature or Salinity)
  let minVal = Math.min(...valueArray);
  let maxVal = Math.max(...valueArray);
  if (minVal === maxVal) {
    minVal -= 1;
    maxVal += 1;
  }
  const valRange = maxVal - minVal || 1;

  // Min / Max for Y axis (Depth inverted: 0 at top, max depth at bottom)
  const maxDepth = Math.max(...depthArray, 1000);
  const minDepth = 0;
  const depthRange = maxDepth - minDepth;

  // Scale Functions
  const scaleX = (val) => margin.left + ((val - minVal) / valRange) * innerWidth;
  const scaleY = (d) => margin.top + ((d - minDepth) / depthRange) * innerHeight; // 0 depth at top, max depth at bottom!

  // Build SVG Path string
  const polylinePoints = depthArray
    .map((d, i) => {
      const x = scaleX(valueArray[i]);
      const y = scaleY(d);
      return `${x},${y}`;
    })
    .join(' ');

  // Y Axis ticks (Depth levels)
  const depthTicks = [0, 200, 400, 600, 800, 1000].filter((d) => d <= maxDepth);

  // X Axis ticks
  const xStep = valRange / 4;
  const xTicks = Array.from({ length: 5 }, (_, i) => parseFloat((minVal + i * xStep).toFixed(1)));

  const metricLabel = activeMetric === 'temperature' ? 'Temperature (°C)' : 'Salinity (PSU)';
  const lineStrokeColor = activeMetric === 'temperature' ? '#FF6B00' : '#00D2FF';

  return (
    <aside className="absolute top-4 right-4 bottom-4 w-80 bg-ocean-panel/95 backdrop-blur-xl border border-ocean-border rounded-2xl p-4 flex flex-col z-30 shadow-2xl animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex justify-between items-center pb-3 border-b border-ocean-border/60 mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <div>
            <h3 className="text-sm font-bold text-white font-mono">{floatId}</h3>
            <p className="text-[10px] text-slate-400">Recorded: {time}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          title="Close Profile Panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Metric Toggle Tabs */}
      <div className="flex bg-ocean-dark/70 p-1 rounded-xl border border-ocean-border/60 mb-4">
        <button
          onClick={() => setActiveMetric('temperature')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeMetric === 'temperature'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Thermometer className="w-3.5 h-3.5" />
          Temperature
        </button>
        <button
          onClick={() => setActiveMetric('salinity')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeMetric === 'salinity'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Droplet className="w-3.5 h-3.5" />
          Salinity
        </button>
      </div>

      {/* Profile Chart Container */}
      <div className="flex-1 bg-ocean-dark/60 rounded-xl border border-ocean-border/50 p-2 flex flex-col justify-center items-center relative overflow-hidden">
        <h4 className="text-[11px] font-medium text-slate-300 mb-1 text-center">
          Depth vs {activeMetric === 'temperature' ? 'Temperature' : 'Salinity'} Profile
        </h4>

        {/* SVG Depth Profile Chart (Inverted Y-axis) */}
        <svg width={width} height={height} className="overflow-visible">
          {/* Grid lines (horizontal for depth) */}
          {depthTicks.map((d) => {
            const y = scaleY(d);
            return (
              <g key={d}>
                <line
                  x1={margin.left}
                  y1={y}
                  x2={width - margin.right}
                  y2={y}
                  stroke="#1E2D4A"
                  strokeDasharray="2 2"
                />
                <text
                  x={margin.left - 6}
                  y={y + 4}
                  fontSize="9"
                  fill="#94A3B8"
                  textAnchor="end"
                  className="font-mono"
                >
                  {d}m
                </text>
              </g>
            );
          })}

          {/* Grid lines (vertical for variable value) */}
          {xTicks.map((val) => {
            const x = scaleX(val);
            return (
              <g key={val}>
                <line
                  x1={x}
                  y1={margin.top}
                  x2={x}
                  y2={height - margin.bottom}
                  stroke="#1E2D4A"
                  strokeDasharray="2 2"
                />
                <text
                  x={x}
                  y={height - margin.bottom + 14}
                  fontSize="9"
                  fill="#94A3B8"
                  textAnchor="middle"
                  className="font-mono"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Y Axis Line */}
          <line
            x1={margin.left}
            y1={margin.top}
            x2={margin.left}
            y2={height - margin.bottom}
            stroke="#475569"
          />

          {/* X Axis Line */}
          <line
            x1={margin.left}
            y1={height - margin.bottom}
            x2={width - margin.right}
            y2={height - margin.bottom}
            stroke="#475569"
          />

          {/* Y Axis Title (Depth) */}
          <text
            x={-height / 2}
            y={14}
            transform="rotate(-90)"
            fontSize="10"
            fill="#CBD5E1"
            textAnchor="middle"
            className="font-sans font-medium"
          >
            Depth (m) →
          </text>

          {/* X Axis Title */}
          <text
            x={margin.left + innerWidth / 2}
            y={height - 6}
            fontSize="10"
            fill="#CBD5E1"
            textAnchor="middle"
            className="font-sans font-medium"
          >
            {metricLabel}
          </text>

          {/* Profile Line Path */}
          <polyline
            fill="none"
            stroke={lineStrokeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
          />

          {/* Data Point Circles */}
          {depthArray.map((d, i) => {
            const cx = scaleX(valueArray[i]);
            const cy = scaleY(d);
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r="3.5"
                fill={lineStrokeColor}
                stroke="#0B1325"
                strokeWidth="1.5"
              >
                <title>{`Depth: ${d}m | ${activeMetric}: ${valueArray[i]}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>

      {/* Footer Info */}
      <div className="mt-3 text-[10px] text-slate-400 text-center font-mono">
        Source: Real Argo GDAC Instrument Feed
      </div>
    </aside>
  );
}
