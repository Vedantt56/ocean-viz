import React from 'react';
import { Palette, Sliders, RotateCcw } from 'lucide-react';

export default function ColorbarEditor({
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
  return (
    <div className="bg-ocean-dark/60 border border-ocean-border/60 rounded-xl p-3.5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 uppercase tracking-wider">
          <Palette className="w-3.5 h-3.5 text-cyan-400" />
          Colorbar Editor
        </div>
        <button
          onClick={onResetRange}
          className="text-[10px] text-slate-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
          title="Reset Range to Auto"
        >
          <RotateCcw className="w-3 h-3" /> Auto
        </button>
      </div>

      {/* Palette Selection Dropdown */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-slate-400 font-medium">Palette Preset</label>
        <select
          value={palette}
          onChange={(e) => onSelectPalette(e.target.value)}
          className="bg-ocean-panel border border-ocean-border/80 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-400 cursor-pointer"
        >
          <option value="thermal">Thermal (Blue → Red)</option>
          <option value="viridis">Viridis (Colorblind Safe)</option>
          <option value="coolwarm">Coolwarm (Diverging)</option>
        </select>
      </div>

      {/* Scaling Mode Toggle (Linear vs Log) */}
      <div className="flex justify-between items-center bg-ocean-panel/80 p-1 rounded-lg border border-ocean-border/60">
        <span className="text-[11px] text-slate-400 font-medium pl-2">Scale Mode</span>
        <div className="flex bg-slate-900 rounded-md p-0.5 border border-slate-750">
          <button
            onClick={() => onToggleScaleMode('linear')}
            className={`px-2.5 py-0.5 text-[11px] font-semibold rounded ${
              scaleMode === 'linear'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Linear
          </button>
          <button
            onClick={() => onToggleScaleMode('log')}
            className={`px-2.5 py-0.5 text-[11px] font-semibold rounded ${
              scaleMode === 'log'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Log
          </button>
        </div>
      </div>

      {/* Min / Max Range Numeric Overrides */}
      <div className="flex gap-2">
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-[10px] text-slate-400">Min Val</label>
          <input
            type="number"
            step="0.5"
            placeholder={autoMin !== undefined ? String(autoMin) : 'Auto'}
            value={minOverride ?? ''}
            onChange={(e) => onChangeMinOverride(e.target.value === '' ? null : parseFloat(e.target.value))}
            className="w-full bg-ocean-panel border border-ocean-border/80 text-xs text-slate-200 font-mono rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-400"
          />
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-[10px] text-slate-400">Max Val</label>
          <input
            type="number"
            step="0.5"
            placeholder={autoMax !== undefined ? String(autoMax) : 'Auto'}
            value={maxOverride ?? ''}
            onChange={(e) => onChangeMaxOverride(e.target.value === '' ? null : parseFloat(e.target.value))}
            className="w-full bg-ocean-panel border border-ocean-border/80 text-xs text-slate-200 font-mono rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-400"
          />
        </div>
      </div>
    </div>
  );
}
