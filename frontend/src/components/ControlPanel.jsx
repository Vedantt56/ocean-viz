import React, { useState } from 'react';

import ColorbarEditor from './ColorbarEditor.jsx';

import { X, Info, Sliders, Layers, Eye, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, FileText } from 'lucide-react';

const VARIABLES = [
  { id: 'temperature', name: 'Temperature', unit: '°C', color: 'from-amber-500 to-rose-500' },
  { id: 'salinity', name: 'Salinity', unit: 'PSU', color: 'from-cyan-500 to-blue-600' },
  { id: 'currents', name: 'Currents', unit: 'm/s', color: 'from-emerald-400 to-teal-600' },
  { id: 'chlorophyll', name: 'Chlorophyll', unit: 'mg/m³', color: 'from-lime-400 to-emerald-600' },
];

export default function ControlPanel({
  activeVariable,
  onSelectVariable,
  activeDepth,
  onSelectDepth,
  availableDepths = [],
  onOpenReportPanel,
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
  verticalExaggeration = 1.0,
  onChangeVerticalExaggeration,
  sliceOpacity = 0.92,
  onChangeSliceOpacity,
}) {
  const [showNotice, setShowNotice] = useState(true);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const depthLevels = availableDepths && availableDepths.length > 0 ? availableDepths : [activeDepth || 0];

  const handleVariableToggle = (varId) => {
    console.log(`[ControlPanel] Selected variable: ${varId}`);
    if (onSelectVariable) onSelectVariable(varId);
  };

  const handleSliderChange = (e) => {
    const depthIdx = parseInt(e.target.value, 10);
    const selectedDepth = Number(depthLevels[depthIdx]);
    if (onSelectDepth) onSelectDepth(selectedDepth);
  };

  const numericActiveDepth = Number(activeDepth);
  const currentDepthIdx = depthLevels.findIndex((d) => Number(d) === numericActiveDepth) !== -1
    ? depthLevels.findIndex((d) => Number(d) === numericActiveDepth)
    : 0;


  const handleToggleCollapse = (collapsedState) => {
    setIsCollapsed(collapsedState);
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 30);
  };

  if (isCollapsed) {
    return (
      <aside className="w-12 glass-panel border-r border-ocean-border flex flex-col items-center py-4 z-20 shadow-glass">
        <button
          onClick={() => handleToggleCollapse(false)}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-ocean-border/60 text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-400/60 transition-colors"
          title="Expand Panel"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-cyan-glow mt-5" />
      </aside>
    );
  }

  return (
    <aside className="w-80 glass-panel border-r border-ocean-border p-4 flex flex-col gap-4 z-20 shadow-glass overflow-y-auto font-sans relative">
      <button
        onClick={() => handleToggleCollapse(true)}
        className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-md border border-ocean-border/60 text-slate-400 hover:text-cyan-300 hover:border-cyan-400/60 transition-colors"
        title="Collapse Panel"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>


      {/* Header Bar */}
      <div className="pb-3.5 border-b border-ocean-border/60">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-cyan-glow shrink-0" />
          <h1 className="text-xs font-bold tracking-wider text-white uppercase font-mono">
            OCEAN 3D WORKSPACE
          </h1>
        </div>
        <p className="text-[10px] text-slate-400 font-mono tracking-tight mt-0.5">
          MoES / INCOIS Hydrodynamic Domain
        </p>
      </div>


      {/* Section 1: OCEAN VARIABLE FIELD */}
      <div className="pb-3 border-b border-ocean-border/40">
        <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono flex items-center justify-between">
          <span>FIELD VARIABLE</span>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80" />
        </h2>
        <div className="flex flex-col gap-1.5">
          {VARIABLES.map((item) => {
            const isActive = activeVariable === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleVariableToggle(item.id)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-all duration-200 flex items-center justify-between group ${
                  isActive
                    ? 'bg-cyan-500/15 border-cyan-400/80 text-white shadow-md shadow-cyan-950/40'
                    : 'bg-ocean-deep/40 border-ocean-border/60 text-slate-300 hover:border-slate-600 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${item.color} ${
                      isActive ? 'ring-2 ring-cyan-400/60 scale-110' : 'opacity-70'
                    }`}
                  />
                  <span className="text-xs font-medium tracking-wide">{item.name}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800/80 text-cyan-300 font-mono border border-slate-700/60">
                  {item.unit}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: DEPTH SLICE (Driven by BackendDepths) */}
      <div className="pb-3 border-b border-ocean-border/40">
        <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 font-mono flex items-center justify-between">
          <span>DEPTH LEVEL</span>
          <span className="text-xs font-mono text-cyan-300 font-bold bg-cyan-950/70 border border-cyan-800/60 px-2 py-0.5 rounded-md">
            {activeDepth}m
          </span>
        </h2>
        <div className="bg-ocean-deep/60 border border-ocean-border/60 rounded-xl p-3 flex flex-col gap-2.5">
          <input
            type="range"
            min="0"
            max={depthLevels.length - 1}
            step="1"
            value={currentDepthIdx}
            onChange={handleSliderChange}
            className="w-full accent-cyan-400 bg-slate-800 h-2 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 px-1 pt-1">
            {depthLevels.length <= 6 ? (
              depthLevels.map((d) => (
                <span
                  key={d}
                  onClick={() => onSelectDepth && onSelectDepth(d)}
                  className={`cursor-pointer hover:text-cyan-300 transition-colors ${
                    d === activeDepth ? 'text-cyan-400 font-bold scale-105' : 'text-slate-400'
                  }`}
                >
                  {d}m
                </span>
              ))
            ) : (
              <>
                <span className="text-cyan-400 font-bold">{depthLevels[0]}m</span>
                <span className="text-slate-300 font-mono">Active: {activeDepth}m</span>
                <span className="text-slate-400">{depthLevels[depthLevels.length - 1]}m</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Section 2.5: REPORT GENERATOR */}
      <div className="pb-3 border-b border-ocean-border/40">
        <button
          onClick={onOpenReportPanel}
          className="w-full py-2.5 px-3.5 bg-gradient-to-r from-sky-600/30 to-cyan-600/30 hover:from-sky-600/50 hover:to-cyan-600/50 border border-cyan-500/50 hover:border-cyan-400 text-white rounded-xl font-mono text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-200 shadow-md shadow-cyan-950/40 group"
        >
          <FileText className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
          <span>Report Generator</span>
        </button>
      </div>

      {/* Section 3: COLORBAR EDITOR */}

      <div>
        <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 font-mono flex items-center justify-between">
          <span>COLORBAR & RANGE</span>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80" />
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

      {/* Section 4: ADVANCED 3D RENDER CONTROLS (Collapsible) */}
      <div className="pt-1">
        <button
          onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
          className="w-full flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono py-1.5 px-1 hover:text-cyan-300 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Sliders className="w-3 h-3 text-cyan-400" />
            Advanced Viewport Options
          </span>
          {isAdvancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {isAdvancedOpen && (
          <div className="mt-2 bg-ocean-deep/60 border border-ocean-border/60 rounded-xl p-3 flex flex-col gap-3 text-xs font-mono animate-in fade-in duration-200">
            {/* Vertical Exaggeration Slider */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] text-slate-300">
                <span>Vertical Scale</span>
                <span className="text-cyan-400 font-bold">{verticalExaggeration.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={verticalExaggeration}
                onChange={(e) => onChangeVerticalExaggeration && onChangeVerticalExaggeration(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
              />
            </div>

            {/* Slice Opacity Slider */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] text-slate-300">
                <span>Slice Opacity</span>
                <span className="text-cyan-400 font-bold">{Math.round(sliceOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={sliceOpacity}
                onChange={(e) => onChangeSliceOpacity && onChangeSliceOpacity(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      {/* Dismissible Scientific Notice Card */}
      {showNotice && (
        <div className="mt-auto p-3 rounded-xl bg-ocean-deep/80 border border-ocean-border/70 text-[10px] text-slate-400 leading-relaxed flex items-start gap-2 relative shadow-inner">
          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div className="pr-4 font-sans">
            <span className="text-cyan-400 font-semibold">Live Data Feed:</span> Real Argo GDAC (Global Data Assembly Centre) float profiles active in Bay of Bengal domain.
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
