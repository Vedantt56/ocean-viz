import React, { useState } from 'react';
import ColorbarEditor from './ColorbarEditor.jsx';
import { X, Info } from 'lucide-react';

const VARIABLES = [
  { id: 'temperature', name: 'Temperature', unit: '°C', color: 'from-amber-500 to-rose-500' },
  { id: 'salinity', name: 'Salinity', unit: 'PSU', color: 'from-cyan-500 to-blue-600' },
  { id: 'currents', name: 'Currents', unit: 'm/s', color: 'from-emerald-400 to-teal-600' },
  { id: 'chlorophyll', name: 'Chlorophyll', unit: 'mg/m³', color: 'from-lime-400 to-emerald-600' },
];

const DEPTH_LEVELS = [0, 50, 100, 200, 500];

export default function ControlPanel({
  activeVariable,
  onSelectVariable,
  activeDepth,
  onSelectDepth,
  palette,
  onSelectPalette,
  scaleMode,
  onToggleScaleMode,
  minOverride,
  maxOverride,
  onChangeMinOverride,
  onChangeMaxOverride,
  onResetRange,
  autoMin,
  autoMax,
}) {
  const [showNotice, setShowNotice] = useState(true);

  const handleVariableToggle = (varId) => {
    console.log(`[ControlPanel] Selected variable: ${varId}`);
    if (onSelectVariable) onSelectVariable(varId);
  };

  const handleSliderChange = (e) => {
    const depthIdx = parseInt(e.target.value, 10);
    const selectedDepth = DEPTH_LEVELS[depthIdx];
    if (onSelectDepth) onSelectDepth(selectedDepth);
  };

  const currentDepthIdx = DEPTH_LEVELS.indexOf(activeDepth) !== -1
    ? DEPTH_LEVELS.indexOf(activeDepth)
    : 0;

  return (
    <aside className="w-72 bg-ocean-panel/90 backdrop-blur-md border-r border-ocean-border p-4 flex flex-col gap-4.5 z-10 shadow-2xl overflow-y-auto">
      {/* Top Header Bar */}
      <div className="pb-3 border-b border-ocean-border/60">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <h1 className="text-xs font-bold tracking-widest text-white uppercase font-mono">
            OCEAN 3D PLATFORM
          </h1>
        </div>
        <p className="text-[10px] text-slate-400 font-mono tracking-tight">
          SIH PS 26067 • MoES / INCOIS
        </p>
      </div>

      {/* Section 1: OCEAN MODEL FIELD */}
      <div className="pb-3 border-b border-ocean-border/40">
        <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono flex items-center justify-between">
          <span>OCEAN MODEL FIELD</span>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/60" />
        </h2>
        <div className="flex flex-col gap-1.5">
          {VARIABLES.map((item) => {
            const isActive = activeVariable === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleVariableToggle(item.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-all duration-200 flex items-center justify-between group ${
                  isActive
                    ? 'bg-ocean-border/80 border-cyan-400 text-white shadow-lg shadow-cyan-950/40'
                    : 'bg-ocean-dark/40 border-ocean-border/60 text-slate-300 hover:border-slate-500 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${item.color} ${
                      isActive ? 'ring-2 ring-cyan-400/50 scale-110' : 'opacity-70'
                    }`}
                  ></span>
                  <span className="text-xs font-medium">{item.name}</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                  {item.unit}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: DEPTH SLICE */}
      <div className="pb-3 border-b border-ocean-border/40">
        <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 font-mono flex items-center justify-between">
          <span>DEPTH SLICE</span>
          <span className="text-xs font-mono text-cyan-400 font-bold bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded">
            {activeDepth}m
          </span>
        </h2>

        <div className="bg-ocean-dark/50 border border-ocean-border/60 rounded-xl p-3 flex flex-col gap-2">
          <input
            type="range"
            min="0"
            max={DEPTH_LEVELS.length - 1}
            step="1"
            value={currentDepthIdx}
            onChange={handleSliderChange}
            className="w-full accent-cyan-400 bg-slate-800 h-2 rounded-lg cursor-pointer"
          />

          <div className="flex justify-between text-[10px] font-mono text-slate-400 px-0.5">
            {DEPTH_LEVELS.map((d) => (
              <span
                key={d}
                onClick={() => onSelectDepth && onSelectDepth(d)}
                className={`cursor-pointer hover:text-cyan-300 transition-colors ${
                  d === activeDepth ? 'text-cyan-400 font-bold' : ''
                }`}
              >
                {d}m
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Section 3: COLORBAR EDITOR */}
      <div>
        <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 font-mono flex items-center justify-between">
          <span>COLORBAR EDITOR</span>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/60" />
        </h2>
        <ColorbarEditor
          palette={palette}
          onSelectPalette={onSelectPalette}
          scaleMode={scaleMode}
          onToggleScaleMode={onToggleScaleMode}
          minOverride={minOverride}
          maxOverride={maxOverride}
          onChangeMinOverride={onChangeMinOverride}
          onChangeMaxOverride={onChangeMaxOverride}
          onResetRange={onResetRange}
          autoMin={autoMin}
          autoMax={autoMax}
        />
      </div>

      {/* Dismissible Notice Card */}
      {showNotice && (
        <div className="mt-auto p-2.5 rounded-xl bg-ocean-dark/70 border border-ocean-border/60 text-[10px] text-slate-400 leading-relaxed flex items-start gap-2 relative">
          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div className="pr-4">
            <span className="text-amber-400 font-semibold">Notice:</span> Ocean model field data is substituted with public NOAA / Copernicus datasets. Real Argo float observational overlays are live.
          </div>
          <button
            onClick={() => setShowNotice(false)}
            className="absolute top-2 right-2 text-slate-500 hover:text-slate-300 transition-colors"
            title="Dismiss Notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </aside>
  );
}
