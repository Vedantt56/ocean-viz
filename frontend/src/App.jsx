import React, { useState, useEffect } from 'react';
import ControlPanel from './components/ControlPanel.jsx';
import Scene from './components/Scene.jsx';
import Legend from './components/Legend.jsx';
import ProfilePanel from './components/ProfilePanel.jsx';
import TimeControl from './components/TimeControl.jsx';
import { getField, getDepths, getFloats, getFloatProfile, getTimesteps } from './api.js';

export default function App() {
  const [activeVariable, setActiveVariable] = useState('temperature');
  const [activeDepth, setActiveDepth] = useState(0);
  const [activeTime, setActiveTime] = useState('2024-06-01');
  const [timesteps, setTimesteps] = useState(['2024-06-01', '2024-06-02', '2024-06-03']);
  const [isPlaying, setIsPlaying] = useState(false);

  // Colorbar Editor State
  const [palette, setPalette] = useState('thermal');
  const [scaleMode, setScaleMode] = useState('linear');
  const [minOverride, setMinOverride] = useState(null);
  const [maxOverride, setMaxOverride] = useState(null);

  const [slicesData, setSlicesData] = useState([]);
  const [floatsData, setFloatsData] = useState([]);
  const [selectedFloatProfile, setSelectedFloatProfile] = useState(null);
  const [valueRange, setValueRange] = useState({ min: 0, max: 30 });
  const [loading, setLoading] = useState(true);

  // 1. Fetch available timesteps & float markers index on mount
  useEffect(() => {
    getTimesteps()
      .then((steps) => setTimesteps(steps))
      .catch((err) => console.error('[App] Error fetching timesteps:', err));

    getFloats()
      .then((floats) => setFloatsData(floats))
      .catch((err) => console.error('[App] Error fetching floats index:', err));
  }, []);

  // 2. Fetch all 5 depth level slices when variable or time changes
  useEffect(() => {
    let isSubscribed = true;
    setLoading(true);

    getDepths()
      .then((depths) => {
        const fetchPromises = depths.map((d) => getField(activeVariable, d, activeTime));
        return Promise.all(fetchPromises);
      })
      .then((slices) => {
        if (!isSubscribed) return;
        setSlicesData(slices);

        let globalMin = Infinity;
        let globalMax = -Infinity;
        slices.forEach((slice) => {
          if (!slice.values) return;
          slice.values.forEach((row) => {
            row.forEach((v) => {
              if (v !== null && v !== undefined && !isNaN(v)) {
                if (v < globalMin) globalMin = v;
                if (v > globalMax) globalMax = v;
              }
            });
          });
        });

        if (globalMin !== Infinity) {
          setValueRange({ min: globalMin, max: globalMax });
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('[App] Error fetching stacked slices data:', err);
        if (isSubscribed) setLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [activeVariable, activeTime]);

  const handleFloatSelect = (floatId) => {
    console.log(`[App] Selected float: ${floatId}`);
    getFloatProfile(floatId)
      .then((profile) => setSelectedFloatProfile(profile))
      .catch((err) => console.error(`[App] Error fetching profile for ${floatId}:`, err));
  };

  const handleResetRange = () => {
    setMinOverride(null);
    setMaxOverride(null);
  };

  const effectiveMin = minOverride !== null ? minOverride : valueRange.min;
  const effectiveMax = maxOverride !== null ? maxOverride : valueRange.max;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ocean-dark text-slate-100">
      {/* Left Sidebar Controls */}
      <ControlPanel
        activeVariable={activeVariable}
        onSelectVariable={setActiveVariable}
        activeDepth={activeDepth}
        onSelectDepth={setActiveDepth}
        palette={palette}
        onSelectPalette={setPalette}
        scaleMode={scaleMode}
        onToggleScaleMode={setScaleMode}
        minOverride={minOverride}
        maxOverride={maxOverride}
        onChangeMinOverride={setMinOverride}
        onChangeMaxOverride={setMaxOverride}
        onResetRange={handleResetRange}
        autoMin={typeof valueRange.min === 'number' ? parseFloat(valueRange.min.toFixed(1)) : valueRange.min}
        autoMax={typeof valueRange.max === 'number' ? parseFloat(valueRange.max.toFixed(1)) : valueRange.max}
      />

      {/* Main 3D Viewport Scene */}
      <main className="relative flex-1 h-full bg-slate-950">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-ocean-dark/60 backdrop-blur-sm">
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-ocean-panel border border-ocean-border shadow-xl">
              <div className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
              <span className="text-xs text-slate-300 font-medium">Loading field slice...</span>
            </div>
          </div>
        )}

        <Scene
          slicesData={slicesData}
          activeDepth={activeDepth}
          activeVariable={activeVariable}
          floatsData={floatsData}
          onFloatSelect={handleFloatSelect}
          palette={palette}
          scaleMode={scaleMode}
          minOverride={minOverride}
          maxOverride={maxOverride}
        />

        {/* Time Control Bar (Slider + Play/Pause Auto-Play) */}
        <TimeControl
          timesteps={timesteps}
          activeTime={activeTime}
          onSelectTime={setActiveTime}
          isPlaying={isPlaying}
          onTogglePlay={setIsPlaying}
        />

        {/* On-Screen Colormap Legend */}
        <Legend
          variable={activeVariable}
          minVal={effectiveMin}
          maxVal={effectiveMax}
          palette={palette}
        />

        {/* Sliding Profile Chart Panel */}
        {selectedFloatProfile && (
          <ProfilePanel
            profileData={selectedFloatProfile}
            onClose={() => setSelectedFloatProfile(null)}
          />
        )}
      </main>
    </div>
  );
}
