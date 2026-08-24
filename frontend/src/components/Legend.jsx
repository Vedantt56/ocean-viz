import React from 'react';

const VARIABLE_UNITS = {
  temperature: '°C',
  salinity: 'PSU',
  currents: 'm/s',
  chlorophyll: 'mg/m³',
};

const PALETTE_STOPS = {
  ocean: ['#DEEAF1', '#96BED2', '#468CAA', '#0A233C'],
  thermal: ['#001EC8', '#00C8FF', '#1EDE50', '#FFD200', '#F02828'],
  flow: ['#0A283C', '#147882', '#5AC88C', '#FFC83C'],
  haline: ['#DFF1D0', '#75C1AC', '#2D7D9F', '#17366E'],
  algae: ['#F7F4C4', '#A7D171', '#428F4A', '#0D4A2D'],
  viridis: ['#440154', '#31688e', '#35b779', '#fde725'],
  coolwarm: ['#3B4CC0', '#8CBDFF', '#DDDDDD', '#F7A789', '#B40426'],
};

export default function Legend({ variable = 'temperature', minVal = 0, maxVal = 30, palette = 'thermal' }) {
  const unit = VARIABLE_UNITS[variable] || '';
  const midVal = typeof minVal === 'number' && typeof maxVal === 'number'
    ? ((minVal + maxVal) / 2).toFixed(1)
    : '--';
  const formattedMin = typeof minVal === 'number' ? minVal.toFixed(1) : minVal;
  const formattedMax = typeof maxVal === 'number' ? maxVal.toFixed(1) : maxVal;
  const stops = PALETTE_STOPS[palette] || PALETTE_STOPS.thermal;

  return (
    <div className="absolute bottom-6 right-6 glass-panel border border-ocean-border px-4 py-3 rounded-2xl shadow-glass z-20 w-72 flex flex-col gap-2 font-sans">
      <div className="flex justify-between items-center text-xs font-mono">
        <span className="capitalize font-bold text-white tracking-wider">{variable}</span>
        <span className="text-cyan-300 font-bold bg-cyan-950/70 border border-cyan-800/60 px-1.5 py-0.5 rounded text-[10px]">
          {unit}
        </span>
      </div>
      {/* Dynamic Colormap Gradient Bar */}
      <div
        className="h-3 w-full rounded-md shadow-inner border border-white/10"
        style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }}
      />
      {/* Min / Mid / Max Range Labels */}
      <div className="flex justify-between text-[10px] font-mono text-slate-400 px-0.5">
        <span>{formattedMin}</span>
        <span className="text-slate-500">{midVal}</span>
        <span>{formattedMax}</span>
      </div>
    </div>
  );
}