import React from 'react';

const VARIABLE_UNITS = {
  temperature: '°C',
  salinity: 'PSU',
  currents: 'm/s',
  chlorophyll: 'mg/m³',
};

const PALETTE_GRADIENTS = {
  thermal: 'bg-gradient-to-r from-[#001EC8] via-[#00C8FF] via-[#1EDE50] via-[#FFD200] to-[#F02828]',
  viridis: 'bg-gradient-to-r from-[#440154] via-[#31688e] via-[#35b779] to-[#fde725]',
  coolwarm: 'bg-gradient-to-r from-[#3B4CC0] via-[#8CBDFF] via-[#DDDDDD] via-[#F7A789] to-[#B40426]',
};

export default function Legend({ variable = 'temperature', minVal = 0, maxVal = 30, palette = 'thermal' }) {
  const unit = VARIABLE_UNITS[variable] || '';
  const midVal = typeof minVal === 'number' && typeof maxVal === 'number'
    ? ((minVal + maxVal) / 2).toFixed(1)
    : '--';

  const formattedMin = typeof minVal === 'number' ? minVal.toFixed(1) : minVal;
  const formattedMax = typeof maxVal === 'number' ? maxVal.toFixed(1) : maxVal;
  const gradientClass = PALETTE_GRADIENTS[palette] || PALETTE_GRADIENTS.thermal;

  return (
    <div className="absolute bottom-6 right-6 bg-ocean-panel/85 backdrop-blur-md border border-ocean-border/80 px-4 py-3 rounded-xl shadow-2xl z-10 w-72 flex flex-col gap-1.5">
      <div className="flex justify-between items-center text-xs font-medium text-slate-300">
        <span className="capitalize font-semibold text-white">{variable} Range</span>
        <span className="text-cyan-400 font-mono text-[11px] font-bold">{unit}</span>
      </div>

      {/* Dynamic Colormap Gradient Bar */}
      <div className={`h-3.5 w-full rounded-md shadow-inner border border-white/10 ${gradientClass}`} />

      {/* Min / Mid / Max Range Labels */}
      <div className="flex justify-between text-[11px] font-mono text-slate-400 px-0.5">
        <span>{formattedMin} {unit}</span>
        <span>{midVal}</span>
        <span>{formattedMax} {unit}</span>
      </div>
    </div>
  );
}
