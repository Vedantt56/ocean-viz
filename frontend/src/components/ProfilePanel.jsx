import React, { useState, useEffect } from 'react';
import { X, Activity, Thermometer, Droplet, Radio, Compass, Clock, Zap, Leaf } from 'lucide-react';

const METRIC_CONFIG = {
  temperature: {
    label: 'Temp',
    fullLabel: 'Temperature (°C)',
    color: '#ff6b00',
    bgClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    icon: Thermometer,
  },
  salinity: {
    label: 'Salinity',
    fullLabel: 'Salinity (PSU)',
    color: '#00d2ff',
    bgClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    icon: Droplet,
  },
  currents: {
    label: 'Currents',
    fullLabel: 'Current Speed (m/s)',
    color: '#38bdf8',
    bgClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    icon: Zap,
  },
  chlorophyll: {
    label: 'Chl-a',
    fullLabel: 'Chlorophyll-a (mg/m³)',
    color: '#10b981',
    bgClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    icon: Leaf,
  },
};

export default function ProfilePanel({ profileData, activeVariable = 'temperature', onClose }) {
  const [activeMetric, setActiveMetric] = useState(activeVariable);

  useEffect(() => {
    if (activeVariable && METRIC_CONFIG[activeVariable]) {
      setActiveMetric(activeVariable);
    }
  }, [activeVariable, profileData]);


  if (!profileData || !profileData.profiles || profileData.profiles.length === 0) {
    return null;
  }

  const latestProfile = profileData.profiles[0];
  const depthArray = latestProfile.depth || [];
  const valueArray = latestProfile[activeMetric] || latestProfile.temperature || [];

  const floatId = String(profileData.float_id || 'argo_2901234').replace(/^argo_?/i, '#');
  const time = latestProfile.time || 'Latest Cycle';
  const lat = latestProfile.lat ?? (profileData.lat || '15.42°N');
  const lon = latestProfile.lon ?? (profileData.lon || '88.15°E');

  // SVG Chart Dimensions & Padding
  const width = 290;
  const height = 320;
  const margin = { top: 30, right: 25, bottom: 40, left: 55 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Min / Max calculation for X axis
  let minVal = Math.min(...(valueArray.length ? valueArray : [0]));
  let maxVal = Math.max(...(valueArray.length ? valueArray : [1]));
  if (minVal === maxVal) {
    minVal -= 1;
    maxVal += 1;
  }
  const valRange = maxVal - minVal || 1;

  // Min / Max for Y axis (Depth inverted: 0 at top)
  const maxDepth = Math.max(...depthArray, 1000);
  const minDepth = 0;
  const depthRange = maxDepth - minDepth;

  // Scale Functions
  const scaleX = (val) => margin.left + ((val - minVal) / valRange) * innerWidth;
  const scaleY = (d) => margin.top + ((d - minDepth) / depthRange) * innerHeight;

  // Build SVG Path string
  const polylinePoints = depthArray
    .map((d, i) => {
      const val = valueArray[i] !== undefined ? valueArray[i] : minVal;
      const x = scaleX(val);
      const y = scaleY(d);
      return `${x},${y}`;
    })
    .join(' ');

  const depthTicks = [0, 200, 400, 600, 800, 1000].filter((d) => d <= maxDepth);
  const xStep = valRange / 4;
  const xTicks = Array.from({ length: 5 }, (_, i) => parseFloat((minVal + i * xStep).toFixed(2)));

  const currentConfig = METRIC_CONFIG[activeMetric] || METRIC_CONFIG.temperature;
  const metricLabel = currentConfig.fullLabel;
  const lineStrokeColor = currentConfig.color;

  return (
    <aside className="absolute top-4 right-4 bottom-4 w-96 glass-panel border border-ocean-border rounded-2xl p-5 flex flex-col z-30 shadow-glass animate-in slide-in-from-right duration-300 font-sans">
      {/* Instrument Readout Header */}
      <div className="flex justify-between items-start pb-3.5 border-b border-ocean-border/60 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="text-[10px] font-mono text-cyan-300 font-bold uppercase tracking-wider bg-cyan-950/70 border border-cyan-800/60 px-2 py-0.5 rounded-md">
              BGC-ARGO TELEMETRY FEED
            </span>
          </div>
          <h3 className="text-base font-bold text-white font-mono tracking-wide">ARGO FLOAT {floatId}</h3>
          <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono mt-1">
            <span className="flex items-center gap-1">
              <Compass className="w-3 h-3 text-slate-500" /> {lat}, {lon}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-500" /> {time}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors"
          title="Close Profile Readout"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 4 BGC-Argo Metric Toggle Tabs */}
      <div className="grid grid-cols-4 bg-ocean-deep/70 p-1 rounded-xl border border-ocean-border/60 mb-4 gap-1">
        {Object.entries(METRIC_CONFIG).map(([key, item]) => {
          const Icon = item.icon;
          const isActive = activeMetric === key;
          return (
            <button
              key={key}
              onClick={() => setActiveMetric(key)}
              className={`py-1.5 px-1 rounded-lg text-[10px] font-mono font-semibold flex items-center justify-center gap-1 transition-all duration-200 ${
                isActive
                  ? `${item.bgClass} border shadow-sm`
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Observation vs Model Indicator Legend */}
      <div className="flex justify-between items-center px-1 mb-2 text-[10px] font-mono">
        <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
          <span>OBSERVATION / ARGO</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <span className="w-2.5 h-0.5 bg-slate-500" />
          <span>HYDRODYNAMIC MODEL</span>
        </div>
      </div>

      {/* Profile Chart Canvas Container */}
      <div className="flex-1 bg-ocean-deep/60 rounded-xl border border-ocean-border/60 p-2 flex flex-col justify-center items-center relative overflow-hidden">
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
                  stroke="#162744"
                  strokeDasharray="2 2"
                />
                <text
                  x={margin.left - 6}
                  y={y + 3}
                  fontSize="9"
                  fill="#64748b"
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
                  stroke="#162744"
                  strokeDasharray="2 2"
                />
                <text
                  x={x}
                  y={height - margin.bottom + 14}
                  fontSize="9"
                  fill="#64748b"
                  textAnchor="middle"
                  className="font-mono"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Axis Lines */}
          <line
            x1={margin.left}
            y1={margin.top}
            x2={margin.left}
            y2={height - margin.bottom}
            stroke="#334155"
          />
          <line
            x1={margin.left}
            y1={height - margin.bottom}
            x2={width - margin.right}
            y2={height - margin.bottom}
            stroke="#334155"
          />

          {/* Axis Titles */}
          <text
            x={-height / 2}
            y={14}
            transform="rotate(-90)"
            fontSize="10"
            fill="#94a3b8"
            textAnchor="middle"
            className="font-mono"
          >
            Depth (m) →
          </text>
          <text
            x={margin.left + innerWidth / 2}
            y={height - 6}
            fontSize="10"
            fill="#94a3b8"
            textAnchor="middle"
            className="font-mono"
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
            const val = valueArray[i] !== undefined ? valueArray[i] : minVal;
            const cx = scaleX(val);
            const cy = scaleY(d);
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r="3.5"
                fill={lineStrokeColor}
                stroke="#070f21"
                strokeWidth="1.5"
              >
                <title>{`Depth: ${d}m | ${activeMetric}: ${val}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>

      {/* Footer Info Readout */}
      <div className="mt-3 text-[10px] text-slate-400 text-center font-mono tracking-tight flex items-center justify-center gap-1.5">
        <Activity className="w-3 h-3 text-cyan-400" />
        <span>Source: Global Data Assembly Center (GDAC) BGC-Argo Telemetry Feed</span>
      </div>
    </aside>
  );
}
