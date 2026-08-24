import React, { useEffect, useRef } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (m >= 0 && m < 12) {
      return `${d} ${monthNames[m]}`;
    }
  }
  return dateStr;
}

export default function TimeControl({
  timesteps = [],
  activeTime,
  onSelectTime,
  isPlaying,
  onTogglePlay,
}) {
  const timerRef = useRef(null);

  const currentIndex = timesteps.indexOf(activeTime) !== -1
    ? timesteps.indexOf(activeTime)
    : 0;

  // Auto-play interval timer
  useEffect(() => {
    if (isPlaying && timesteps.length > 0) {
      timerRef.current = setInterval(() => {
        const nextIndex = (currentIndex + 1) % timesteps.length;
        onSelectTime(timesteps[nextIndex]);
      }, 1800);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, currentIndex, timesteps, onSelectTime]);

  const handlePrev = () => {
    const prevIdx = (currentIndex - 1 + timesteps.length) % timesteps.length;
    onSelectTime(timesteps[prevIdx]);
  };

  const handleNext = () => {
    const nextIdx = (currentIndex + 1) % timesteps.length;
    onSelectTime(timesteps[nextIdx]);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2 py-1 rounded-xl bg-ocean-panel/90 backdrop-blur-xl border border-ocean-border shadow-2xl font-sans max-w-fit">
      {/* Play / Pause Toggle */}
      {onTogglePlay && (
        <button
          onClick={() => onTogglePlay(!isPlaying)}
          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-200 shrink-0 ${
            isPlaying
              ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/25 scale-105'
              : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40'
          }`}
          title={isPlaying ? 'Pause Auto-Advance' : 'Play Timeline'}
        >
          {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
        </button>
      )}

      {/* Prev Arrow */}
      <button
        onClick={handlePrev}
        className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors shrink-0"
        title="Previous Date"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      {/* Segmented Compact Date Pills */}
      <div className="flex items-center gap-1 py-0.5 px-0.5">
        {timesteps.map((time) => {
          const isActive = activeTime === time;
          const label = formatDateShort(time);
          return (
            <button
              key={time}
              title={time}
              onClick={() => {
                if (isPlaying) onTogglePlay(false);
                onSelectTime(time);
              }}
              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono transition-all duration-200 select-none whitespace-nowrap flex items-center gap-1 ${
                isActive
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/25 scale-105'
                  : 'bg-slate-900/70 hover:bg-slate-800/80 text-slate-300 border border-slate-700/60 hover:text-white'
              }`}
            >
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-pulse" />}
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Next Arrow */}
      <button
        onClick={handleNext}
        className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors shrink-0"
        title="Next Date"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
