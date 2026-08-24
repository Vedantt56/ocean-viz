import React, { useState, useEffect, useCallback } from 'react';


import ControlPanel from './components/ControlPanel.jsx';

import Scene from './components/Scene.jsx';

import Legend from './components/Legend.jsx';

import ProfilePanel from './components/ProfilePanel.jsx';

import TimeControl from './components/TimeControl.jsx';

import GlobeView from './components/GlobeView.jsx';

import { Globe, Layers, Eye, RefreshCw } from 'lucide-react';

import { getField, getDepths, getFloats, getFloatProfile, getTimesteps } from './api.js';

export default function App() {
  // 1. View Routing State: "globe" or "region"
  const [view, setView] = useState("globe");
  const [activeVariable, setActiveVariable] = useState('currents');
  const [activeDepth, setActiveDepth] = useState(0);
  const [availableDepths, setAvailableDepths] = useState([0, 50, 100, 200, 500, 1000, 2000, 3000, 3992]);
  const [activeTime, setActiveTime] = useState('2026-08-20');
  const [timesteps, setTimesteps] = useState(['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24']);
  const [isPlaying, setIsPlaying] = useState(false);

  // Colorbar & Scene Control State
  const [palette, setPalette] = useState('ocean');
  const [scaleMode, setScaleMode] = useState('linear');
  const [minOverride, setMinOverride] = useState(null);
  const [maxOverride, setMaxOverride] = useState(null);
  const [verticalExaggeration, setVerticalExaggeration] = useState(1.0);
  const [sliceOpacity, setSliceOpacity] = useState(0.92);
  const [slicesData, setSlicesData] = useState([]);
  const [floatsData, setFloatsData] = useState([]);
  const [selectedFloatProfile, setSelectedFloatProfile] = useState(null);
  const [valueRange, setValueRange] = useState({ min: 0, max: 30 });
  const [loading, setLoading] = useState(true);

  // View mode state: "slices" | "volume" | "isosurface"
  const [renderMode, setRenderMode] = useState("slices");

  const VARIABLE_RANGES = {
    currents: { min: 0.0, max: 0.85, palette: 'flow' },
    temperature: { min: 12.0, max: 31.0, palette: 'thermal' },
    salinity: { min: 30.0, max: 35.5, palette: 'haline' },
    chlorophyll: { min: 0.05, max: 3.50, palette: 'algae' },
  };

  // Sync colorbar range and palette per variable
  useEffect(() => {
    const config = VARIABLE_RANGES[activeVariable] || VARIABLE_RANGES.currents;
    setValueRange({ min: config.min, max: config.max });
    setMinOverride(config.min);
    setMaxOverride(config.max);
    setPalette(config.palette);
  }, [activeVariable]);

  // Fetch available depths for activeVariable, timesteps & float markers index on mount / variable change
  useEffect(() => {
    getDepths(activeVariable)
      .then((depths) => {
        if (Array.isArray(depths) && depths.length > 0) {
          const numDepths = depths.map(Number);
          setAvailableDepths(numDepths);
          if (!numDepths.includes(Number(activeDepth))) {
            setActiveDepth(numDepths[0]);
          }

        }
      })
      .catch((err) => console.error('[App] Error fetching depths metadata:', err));

    getTimesteps()
      .then((steps) => {
        if (Array.isArray(steps) && steps.length > 0) {
          setTimesteps(steps);
          if (!steps.includes(activeTime)) {
            setActiveTime(steps[0]);
          }
        }
      })
      .catch((err) => console.error('[App] Error fetching timesteps:', err));

    getFloats()
      .then((floats) => setFloatsData(floats))
      .catch((err) => console.error('[App] Error fetching floats index:', err));
  }, [activeVariable]);

  // Fetch depth level slices from backend when variable, availableDepths, or time changes
  useEffect(() => {
    if (!availableDepths || availableDepths.length === 0) return;
    let isSubscribed = true;
    setLoading(true);
    const depthsToFetch = availableDepths;
    const fetchPromises = depthsToFetch.map((d) => getField(activeVariable, d, activeTime));
    Promise.allSettled(fetchPromises)
      .then((results) => {
        if (!isSubscribed) return;
        const validSlices = results
          .filter((res) => res.status === 'fulfilled' && res.value)
          .map((res) => res.value);
        setSlicesData(validSlices);
        setLoading(false);
      })
      .catch((err) => {
        if (isSubscribed) setLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [activeVariable, availableDepths, activeTime]);

  const handleFloatSelect = useCallback((floatId) => {
    console.log(`[App] Selected float: ${floatId}`);
    getFloatProfile(floatId)
      .then((profile) => setSelectedFloatProfile(profile))
      .catch((err) => console.error(`[App] Error fetching profile for ${floatId}:`, err));
  }, []);


  const handleResetRange = () => {
    setMinOverride(null);
    setMaxOverride(null);
  };

  let activeSliceMin = null;
  let activeSliceMax = null;

  if (scaleMode === 'local' && slicesData?.length) {
    const activeSlice = slicesData.find((s) => Number(s.depth) === Number(activeDepth)) || slicesData[0];
    if (activeSlice?.values?.length) {
      let min = Infinity;
      let max = -Infinity;
      activeSlice.values.forEach((row) => {
        row.forEach((val) => {
          if (Number.isFinite(val)) {
            min = Math.min(min, val);
            max = Math.max(max, val);
          }
        });
      });
      if (min !== Infinity && min !== max) {
        activeSliceMin = min;
        activeSliceMax = max;
      }
    }
  }



  const effectiveMin = minOverride !== null ? minOverride : (activeSliceMin !== null ? activeSliceMin : valueRange.min);
  const effectiveMax = maxOverride !== null ? maxOverride : (activeSliceMax !== null ? activeSliceMax : valueRange.max);


  // 2. Render Globe View if view === "globe"
  if (view === "globe") {
    return <GlobeView onSelectRegion={() => setView("region")} floatsCount={floatsData.length} />;
  }

  // 3. Render Region View if view === "region"
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ocean-deep text-slate-100 font-sans">
      {/* Left Sidebar Controls */}
      <ControlPanel
        activeVariable={activeVariable}
        onSelectVariable={setActiveVariable}
        activeDepth={activeDepth}
        onSelectDepth={setActiveDepth}
        availableDepths={availableDepths}
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
        verticalExaggeration={verticalExaggeration}
        onChangeVerticalExaggeration={setVerticalExaggeration}
        sliceOpacity={sliceOpacity}
        onChangeSliceOpacity={setSliceOpacity}
      />

      {/* Main 3D Viewport Scene */}
      <main className="relative flex-1 h-full bg-ocean-dark overflow-hidden">
        {/* Back to Globe Button */}
        <button
          onClick={() => setView("globe")}
          className="absolute top-4 left-4 z-30 px-3.5 py-2 rounded-xl bg-ocean-panel/85 backdrop-blur-xl border border-ocean-border hover:border-cyan-400/80 text-slate-200 hover:text-white text-xs font-mono font-medium flex items-center gap-2 shadow-2xl transition-all duration-200 hover:scale-105 group"
          title="Return to Global View"
        >
          <Globe className="w-4 h-4 text-cyan-400 group-hover:rotate-12 transition-transform duration-300" />
          <span>Global Earth View</span>
        </button>

        {/* Loading Overlay Spinner */}
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-ocean-dark/70 backdrop-blur-md transition-opacity duration-300">
            <div className="flex items-center gap-3.5 px-5 py-3 rounded-2xl bg-ocean-panel border border-ocean-border shadow-2xl shadow-cyan-950/50">
              <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
              <span className="text-xs text-slate-200 font-mono tracking-wide">Synthesizing 3D Ocean Volume...</span>
            </div>
          </div>
        )}

        {/* Hero Three.js Canvas Workspace */}
        <Scene
          slicesData={slicesData}
          activeDepth={activeDepth}
          availableDepths={availableDepths}
          activeVariable={activeVariable}
          floatsData={floatsData}
          onFloatSelect={handleFloatSelect}
          palette={palette}
          scaleMode={scaleMode}
          minOverride={minOverride}
          maxOverride={maxOverride}
          renderMode={renderMode}
          verticalExaggeration={verticalExaggeration}
          sliceOpacity={sliceOpacity}
        />

        {/* Top Center Segmented Date Slider */}
        <TimeControl
          timesteps={timesteps}
          activeTime={activeTime}
          onSelectTime={setActiveTime}
          isPlaying={isPlaying}
          onTogglePlay={setIsPlaying}
        />

        {/* Mode Switcher Pill (Stacked Slices / Volumetric Stack / Isosurface) */}
        <div className="absolute bottom-6 left-6 z-30 flex items-center gap-1 p-1 rounded-xl bg-ocean-panel/90 backdrop-blur-xl border border-ocean-border shadow-2xl">
          {[
            { id: 'slices', label: 'Stacked Slices' },
            { id: 'volume', label: 'Volumetric Stack' },
            { id: 'isosurface', label: 'Isosurface (Beta)' },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setRenderMode(mode.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all duration-200 ${
                renderMode === mode.id
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Scientific Colormap Legend */}
        <Legend
          variable={activeVariable}
          minVal={effectiveMin}
          maxVal={effectiveMax}
          palette={palette}
        />


        {/* Argo Profile Readout Panel */}
        {selectedFloatProfile && (
          <ProfilePanel
            profileData={selectedFloatProfile}
            activeVariable={activeVariable}
            onClose={() => setSelectedFloatProfile(null)}
          />
        )}

      </main>
    </div>
  );
}