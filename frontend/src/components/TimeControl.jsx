import React, { useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Clock } from 'lucide-react';

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

  // Auto-play interval timer (advance every 1.5 seconds)
  useEffect(() => {
    if (isPlaying && timesteps.length > 0) {
      timerRef.current = setInterval(() => {
        const nextIndex = (currentIndex + 1) % timesteps.length;
        onSelectTime(timesteps[nextIndex]);
      }, 1500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, currentIndex, timesteps, onSelectTime]);

  const handleSliderChange = (e) => {
    if (isPlaying) {
      onTogglePlay(false);
    }
    const idx = parseInt(e.target.value, 10);
    if (timesteps[idx]) {
      onSelectTime(timesteps[idx]);
    }
  };

  const handlePrev = () => {
    if (isPlaying) onTogglePlay(false);
    const prevIdx = (currentIndex - 1 + timesteps.length) % timesteps.length;
    onSelectTime(timesteps[prevIdx]);
  };

  const handleNext = () => {
    if (isPlaying) onTogglePlay(false);
    const nextIdx = (currentIndex + 1) % timesteps.length;
    onSelectTime(timesteps[nextIdx]);
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 glass-panel border border-ocean-border px-5 py-3 rounded-2xl shadow-glass z-30 flex items-center gap-4 w-[480px] font-sans">
      {/* Play / Pause Toggle Button */}
      <button
        onClick={() => onTogglePlay(!isPlaying)}
        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
          isPlaying
            ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25 scale-105'
            : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/25 hover:scale-105'
        }`}
        title={isPlaying ? 'Pause Auto-Advance' : 'Play Auto-Advance Sequence'}
      >
        {isPlaying ? <Pause className="w-4.5 h-4.5 fill-current" /> : <Play className="w-4.5 h-4.5 fill-current ml-0.5" />}
      </button>

      {/* Prev / Next Buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={handlePrev}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          title="Previous Timestep"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={handleNext}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          title="Next Timestep"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      {/* Timeline Scrub Slider */}
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-[11px] font-mono">
          <span className="flex items-center gap-1.5 text-slate-400 uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5 text-cyan-400" /> Timestep
          </span>
          <span className="text-cyan-300 font-bold bg-cyan-950/70 border border-cyan-800/60 px-2 py-0.5 rounded-md">
            {activeTime}
          </span>
        </div>

        <input
          type="range"
          min="0"
          max={Math.max(0, timesteps.length - 1)}
          value={currentIndex}
          onChange={handleSliderChange}
          className="w-full accent-cyan-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
        />
      </div>
    </div>
  );
}

