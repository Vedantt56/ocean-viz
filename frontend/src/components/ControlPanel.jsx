import React from 'react';
import ColorbarEditor from './ColorbarEditor.jsx';

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
    <aside className="w-72 bg-ocean-panel/90 backdrop-blur-md border-r border-ocean-border p-4 flex flex-col gap-5 z-10 shadow-2xl overflow-y-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full bg-ocean-accent animate-pulse"></span>
          <h1 className="text-sm font-semibold tracking-wider text-slate-200 uppercase">
            Ocean 3D Platform
          </h1>
        </div>
        <p className="text-xs text-slate-400">SIH PS 26067 • MoES / INCOIS</p>
      </div>

      {/* Variables Layer Panel */}
      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
          Ocean Model Field
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
                    ? 'bg-ocean-border/80 border-ocean-accent text-white shadow-lg shadow-cyan-950/40'
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

      {/* Depth Slice Isolation Control */}
      <div className="bg-ocean-dark/50 border border-ocean-border/60 rounded-xl p-3 flex flex-col gap-2.5">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Depth Slice
          </span>
          <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded">
            {activeDepth}m
          </span>
        </div>

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

      {/* Colorbar Editor Component */}
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

      {/* Info Notice */}
      <div className="mt-auto p-2.5 rounded-lg bg-ocean-dark/60 border border-ocean-border/50 text-[10px] text-slate-400 leading-relaxed">
        <span className="text-amber-400 font-medium">Notice:</span> Model field data substituted with public NOAA / Copernicus datasets. Real Argo float overlays enabled.
      </div>
    </aside>
  );
}
