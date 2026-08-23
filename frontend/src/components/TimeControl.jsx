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

  // Auto-play interval timer (auto-advance every 1.5 seconds)
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
    // Manual scrub immediately stops auto-play as required by spec!
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
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-ocean-panel/90 backdrop-blur-xl border border-ocean-border px-5 py-2.5 rounded-2xl shadow-2xl z-20 flex items-center gap-4 w-[460px]">
      {/* Play / Pause Toggle Button */}
      <button
        onClick={() => onTogglePlay(!isPlaying)}
        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
          isPlaying
            ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
            : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/30'
        }`}
        title={isPlaying ? 'Pause Auto-Play' : 'Play Auto-Advance'}
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>

      {/* Prev / Next Buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={handlePrev}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Previous Timestep"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={handleNext}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Next Timestep"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      {/* Timeline Scrub Slider */}
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex justify-between items-center text-[11px] font-mono">
          <span className="flex items-center gap-1 text-slate-400">
            <Clock className="w-3 h-3 text-cyan-400" /> Time Step
          </span>
          <span className="text-cyan-300 font-bold bg-cyan-950/60 border border-cyan-800/40 px-1.5 py-0.2 rounded">
            {activeTime}
          </span>
        </div>

        <input
          type="range"
          min="0"
          max={Math.max(0, timesteps.length - 1)}
          value={currentIndex}
          onChange={handleSliderChange}
          className="w-full accent-cyan-400 bg-slate-800 h-2 rounded-lg cursor-pointer"
        />
      </div>
    </div>
  );
}
