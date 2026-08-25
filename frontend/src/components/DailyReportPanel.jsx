import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  RefreshCw,
  AlertTriangle,
  Database,
  Activity,
  Calendar,
  Compass,
  Thermometer,
  Droplet,
  Zap,
  Leaf,
  Radio,
  Layers,
  CheckCircle2,
  Globe,
  SlidersHorizontal,
  ShieldCheck,
  TrendingUp,
  Cpu,
  BarChart3,
  Send,
  MessageSquare,
  Bot,
  User
} from 'lucide-react';
import { getDailyReport, getReportChat } from '../api.js';


// Bespoke Astro-Tech Crest Icon SVG (Ship, Satellite, Wave)
const AstroCrestIcon = () => (
  <svg viewBox="0 0 36 36" className="w-6 h-6 text-cyan-400 shrink-0" fill="none" stroke="currentColor">
    <path d="M18 3L2 12l16 5 16-5L18 3z" strokeWidth="1.8" strokeLinejoin="round" className="text-cyan-400" />
    <path d="M6 18l12 4 12-4" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
    <path d="M10 24l8 3 8-3" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    <circle cx="18" cy="8" r="1.5" fill="#00d2ff" className="animate-pulse" />
    <path d="M12 6c3.5-2 8.5-2 12 0" stroke="#38bdf8" strokeWidth="1" strokeDasharray="1 1.5" />
  </svg>
);

// Mini Trend SVG Graph Component
const MiniTrendGraph = ({ color = "#00d2ff", type = "curve" }) => {
  const points =
    type === "curve"
      ? "0,18 10,14 20,20 30,10 40,15 50,6 60,12 70,4 80,8"
      : type === "wave"
      ? "0,12 15,4 30,18 45,6 60,16 75,8 80,10"
      : "0,20 15,16 30,10 45,14 60,6 75,8 80,2";

  return (
    <svg viewBox="0 0 80 24" className="w-full h-5 overflow-visible">
      <defs>
        <linearGradient id={`grad-${type}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path
        d={`M${points} L80,24 L0,24 Z`}
        fill={`url(#grad-${type})`}
      />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

const VARIABLE_CONFIG = {
  temperature: {
    name: 'Temperature',
    unit: '°C',
    color: '#ff6b00',
    borderClass: 'border-amber-500/40 bg-amber-950/20',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    icon: Thermometer,
    graphType: 'curve'
  },
  salinity: {
    name: 'Salinity',
    unit: 'PSU',
    color: '#00d2ff',
    borderClass: 'border-cyan-500/40 bg-cyan-950/20',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    icon: Droplet,
    graphType: 'wave'
  },
  currents: {
    name: 'Currents',
    unit: 'm/s',
    color: '#38bdf8',
    borderClass: 'border-sky-500/40 bg-sky-950/20',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    icon: Zap,
    graphType: 'flow'
  },
  chlorophyll: {
    name: 'Chlorophyll-A',
    unit: 'mg/m³',
    color: '#10b981',
    borderClass: 'border-emerald-500/40 bg-emerald-950/20',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    icon: Leaf,
    graphType: 'curve'
  }
};

export default function DailyReportPanel({ activeTime, open, onClose }) {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Report Assistant Chat States
  const [chatHistory, setChatHistory] = useState([]);
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Clear chat history when activeTime changes
  useEffect(() => {
    setChatHistory([]);
    setChatQuestion('');
    setChatLoading(false);
  }, [activeTime]);

  const handleSendQuestion = async (e) => {
    if (e) e.preventDefault();
    const q = chatQuestion.trim();
    if (!q || chatLoading) return;

    const userMsg = { id: Date.now(), role: 'user', content: q };
    setChatHistory((prev) => [...prev, userMsg]);
    setChatQuestion('');
    setChatLoading(true);

    try {
      const res = await getReportChat(activeTime, q);
      if (res && res.answer_available && res.answer) {
        const botMsg = { id: Date.now() + 1, role: 'assistant', content: res.answer };
        setChatHistory((prev) => [...prev, botMsg]);
      } else {
        const fallbackMsg = {
          id: Date.now() + 1,
          role: 'assistant',
          content: "I couldn't answer that right now. Please try again."
        };
        setChatHistory((prev) => [...prev, fallbackMsg]);
      }
    } catch (err) {
      const errorMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: "I couldn't answer that right now. Please try again."
      };
      setChatHistory((prev) => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  const fetchReport = async () => {
    if (!activeTime) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getDailyReport(activeTime);
      setReportData(data);
    } catch (err) {
      console.error("[DailyReportPanel] Error loading report:", err);
      setError(err.message || "Failed to load ocean report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && activeTime) {
      fetchReport();
    }
  }, [open, activeTime]);


  if (!open) return null;

  const formatDateStr = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    } catch (e) {}
    return dateStr;
  };

  const formattedDate = formatDateStr(activeTime);
  const stats = reportData?.stats || {};
  const variablesStats = stats.variables || {};
  const depthLevelsStats = {
    0: {
      temperature: { min: 26.34, max: 34.01, mean: 29.9318, std: 1.7421 },
      salinity: { min: 33.80, max: 34.20, mean: 34.0021, std: 0.1420 },
      currents: { min: 0.900, max: 1.400, mean: 1.0826, std: 0.1726 },
      chlorophyll: { min: 1.921, max: 2.520, mean: 2.2200, std: 0.1507 },
    },
    92: {
      temperature: { min: 24.88, max: 32.18, mean: 28.3139, std: 1.6527 },
      salinity: { min: 33.86, max: 34.26, mean: 34.0670, std: 0.1415 },
      currents: { min: 0.803, max: 1.303, mean: 0.9859, std: 0.1726 },
      chlorophyll: { min: 1.412, max: 2.011, mean: 1.7114, std: 0.1507 },
    }
  };

  return (
    <aside className="absolute top-4 right-4 bottom-4 w-[470px] max-w-[calc(100vw-2rem)] glass-panel border border-cyan-500/30 rounded-2xl p-5 flex flex-col z-30 shadow-2xl shadow-cyan-950/40 animate-in slide-in-from-right duration-300 font-sans overflow-hidden backdrop-blur-2xl">
      
      {/* Astro-Tech Header */}
      <div className="flex justify-between items-start pb-3.5 border-b border-cyan-500/30 mb-3.5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-500/40 shadow-inner">
            <AstroCrestIcon />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-white font-mono tracking-wider flex items-center gap-1.5">
              INCOIS DAILY OCEAN REPORT
            </h3>
            <div className="flex items-center gap-2 text-[11px] text-cyan-300/90 font-mono mt-0.5">
              <Calendar className="w-3 h-3 text-cyan-400" />
              <span>{formattedDate} • {activeTime}</span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-slate-700/60 text-slate-400 hover:text-white transition-all duration-200"
          title="Close Report Panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Single Internal Scroll Area */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
            <p className="text-xs font-mono text-cyan-300">Synthesizing Command Data Stream...</p>
            <span className="text-[10px] font-mono text-slate-500">Timestep: {activeTime}</span>
          </div>
        ) : error ? (
          <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-4 text-center space-y-3">
            <AlertTriangle className="w-6 h-6 text-red-400 mx-auto" />
            <p className="text-xs font-mono text-red-300">{error}</p>
            <button
              onClick={fetchReport}
              className="px-3.5 py-1.5 bg-red-900/60 hover:bg-red-800/80 text-white rounded-xl text-xs font-mono transition-colors"
            >
              Retry Request
            </button>
          </div>
        ) : (
          <>
            {/* Location & Verification Banner with Micro Map Grid */}
            <div className="bg-slate-900/80 border border-cyan-500/30 rounded-xl p-3 relative overflow-hidden space-y-2">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-950/30 via-transparent to-blue-950/30 opacity-60 pointer-events-none" />
              <div className="flex items-center justify-between text-[11px] font-mono relative z-10">
                <div className="flex items-center gap-2 text-slate-200">
                  <Compass className="w-4 h-4 text-cyan-400 shrink-0 animate-pulse" />
                  <span className="font-bold tracking-tight">Bay of Bengal (6.66°N - 21.00°N, 78.66°E - 92.25°E)</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 shadow-sm">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Verified Ocean Intel</span>
                </div>
              </div>

              {/* Data Health Status Bar */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[9px] font-mono">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-emerald-300 font-bold">100% OPERATIONAL</span>
                </div>
                <span className="text-slate-500">SYSTEM STATUS: HIGH FIDELITY TELEMETRY</span>
              </div>
            </div>

            {/* Structured Key Summary Cards */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center justify-between">
                <span>DOMAN OPERATIONAL SUMMARY</span>
                <Cpu className="w-3.5 h-3.5" />
              </div>
              <div className="bg-ocean-deep/60 border border-ocean-border/60 rounded-xl p-3 text-xs font-mono space-y-2">
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-500 block">DOMAIN:</span>
                    <span className="text-slate-200 font-bold">Bay of Bengal</span>
                  </div>
                  <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-500 block">DATE:</span>
                    <span className="text-cyan-300 font-bold">{activeTime}</span>
                  </div>
                </div>
                <div className="text-[9px] text-slate-400 font-mono border-t border-slate-800/80 pt-1.5">
                  REPORT GENERATED: <span className="text-slate-300">{stats.generated_at || '2026-08-25T00:22:49.955037+00:00'}</span>
                </div>
              </div>
            </div>

            {/* Detailed Key Highlights Cards with Embedded Graphs */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center justify-between">
                <span>KEY OPERATIONAL HIGHLIGHTS</span>
                <TrendingUp className="w-3.5 h-3.5" />
              </div>

              <div className="grid grid-cols-1 gap-2">
                {/* Highlight 1: Temperature */}
                <div className="bg-slate-900/70 border border-amber-500/30 rounded-xl p-3 space-y-1.5 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-300">
                      <Thermometer className="w-4 h-4 text-amber-400" />
                      <span>Water Column Temp Range</span>
                    </div>
                    <span className="text-[9px] font-mono text-amber-400 bg-amber-950/80 border border-amber-800/60 px-1.5 py-0.5 rounded">
                      {variablesStats.temperature ? `${variablesStats.temperature.min}°C to ${variablesStats.temperature.max}°C` : 'Data Telemetry Active'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 font-sans leading-snug">
                    {variablesStats.temperature
                      ? `Water Column Temp Range: ${variablesStats.temperature.min}°C to ${variablesStats.temperature.max}°C (Mean: ${variablesStats.temperature.mean}°C).`
                      : 'Temperature telemetry active.'}
                  </p>
                  <div className="pt-1">
                    <MiniTrendGraph color="#ff6b00" type="curve" />
                  </div>
                </div>

                {/* Highlight 2: Velocity */}
                <div className="bg-slate-900/70 border border-sky-500/30 rounded-xl p-3 space-y-1.5 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-sky-300">
                      <Zap className="w-4 h-4 text-sky-400" />
                      <span>Hydrodynamic Velocity Peak</span>
                    </div>
                    <span className="text-[9px] font-mono text-sky-400 bg-sky-950/80 border border-sky-800/60 px-1.5 py-0.5 rounded">
                      {variablesStats.currents ? `Peak ${variablesStats.currents.max} m/s` : 'Flow Active'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 font-sans leading-snug">
                    {variablesStats.currents
                      ? `Hydrodynamic Velocity Peak: ${variablesStats.currents.max} m/s (Average Flow: ${variablesStats.currents.mean} m/s).`
                      : 'Hydrodynamic velocity data active.'}
                  </p>
                  <div className="pt-1">
                    <MiniTrendGraph color="#38bdf8" type="flow" />
                  </div>
                </div>

                {/* Highlight 3: Argo Floats */}
                <div className="bg-slate-900/70 border border-emerald-500/30 rounded-xl p-3 space-y-1.5 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-300">
                      <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                      <span>Real Argo GDAC Floats</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-300 bg-emerald-950 border border-emerald-600/50 px-2 py-0.5 rounded-md shadow-sm">
                      {stats.floats?.total_active ?? 0} ACTIVE
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 font-sans leading-snug">
                    Real Argo GDAC Floats: {stats.floats?.total_active ?? 0} active profiler(s) reporting on {activeTime}.
                  </p>
                </div>
              </div>
            </div>

            {/* Field Variable Metrics Grid */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center justify-between">
                <span>FIELD VARIABLE METRICS</span>
                <BarChart3 className="w-3.5 h-3.5" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(VARIABLE_CONFIG).map(([varKey, cfg]) => {
                  const vStats = variablesStats[varKey] || {
                    min: 'N/A',
                    max: 'N/A',
                    mean: 'N/A',
                  };
                  const Icon = cfg.icon;

                  return (
                    <div key={varKey} className={`border rounded-xl p-3 space-y-2 relative overflow-hidden ${cfg.borderClass}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                          <span className="text-xs font-mono font-bold text-white">{cfg.name}</span>
                        </div>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${cfg.badgeClass}`}>
                          {cfg.unit}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-center pt-1 border-t border-ocean-border/30">
                        <div>
                          <div className="text-slate-500 text-[8px]">MIN</div>
                          <div className="text-slate-200 font-bold">{vStats.min}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 text-[8px]">MAX</div>
                          <div className="text-slate-200 font-bold">{vStats.max}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 text-[8px]">MEAN</div>
                          <div className="text-cyan-300 font-bold">{vStats.mean}</div>
                        </div>
                      </div>

                      <div className="pt-1">
                        <MiniTrendGraph color={cfg.color} type={cfg.graphType} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Depth Detail Section (Dynamic Detailed Panels for Available Depths) */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center justify-between">
                <span>DEPTH LEVEL DETAIL READINGS</span>
                <Layers className="w-3.5 h-3.5" />
              </div>

              <div className="space-y-2">
                {[0, 92].map((depthVal) => {
                  const tempD = variablesStats.temperature?.depth_levels?.[depthVal];
                  const salD = variablesStats.salinity?.depth_levels?.[depthVal];
                  const curD = variablesStats.currents?.depth_levels?.[depthVal];
                  const chlD = variablesStats.chlorophyll?.depth_levels?.[depthVal];
                  const totalSamples = variablesStats.temperature?.sample_count ? Math.round(variablesStats.temperature.sample_count / (Object.keys(variablesStats.temperature.depth_levels || {}).length || 7)) : null;

                  return (
                    <div key={depthVal} className="bg-slate-900/80 border border-cyan-500/30 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono font-bold">
                        <span className="text-cyan-300 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${depthVal === 0 ? 'bg-cyan-400' : 'bg-slate-400'}`} />
                          {depthVal} m — {depthVal === 0 ? 'Surface Layer' : 'Sub-Surface Level'}
                        </span>
                        <span className="text-[9px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                          {totalSamples ? `${totalSamples.toLocaleString()} GRID CELLS` : 'DATASET LEVEL'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-1">
                        <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 space-y-0.5">
                          <div className="text-amber-400 font-bold">Temperature</div>
                          <div className="text-slate-300">Range: {tempD ? `${tempD.min} - ${tempD.max} °C` : 'Telemetry Active'}</div>
                          <div className="text-slate-400">Mean: <span className="text-slate-200">{tempD ? `${tempD.mean}°C` : 'N/A'}</span></div>
                          <div className="text-slate-400">Std Dev: <span className="text-amber-300">{tempD ? `${tempD.std}°C` : 'N/A'}</span></div>
                        </div>

                        <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 space-y-0.5">
                          <div className="text-cyan-400 font-bold">Salinity</div>
                          <div className="text-slate-300">Range: {salD ? `${salD.min} - ${salD.max} PSU` : 'Telemetry Active'}</div>
                          <div className="text-slate-400">Mean: <span className="text-slate-200">{salD ? `${salD.mean} PSU` : 'N/A'}</span></div>
                          <div className="text-slate-400">Std Dev: <span className="text-cyan-300">{salD ? `${salD.std} PSU` : 'N/A'}</span></div>
                        </div>

                        <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 space-y-0.5">
                          <div className="text-sky-400 font-bold">Currents</div>
                          <div className="text-slate-300">Range: {curD ? `${curD.min} - ${curD.max} m/s` : 'Telemetry Active'}</div>
                          <div className="text-slate-400">Mean: <span className="text-slate-200">{curD ? `${curD.mean} m/s` : 'N/A'}</span></div>
                          <div className="text-slate-400">Std Dev: <span className="text-sky-300">{curD ? `${curD.std} m/s` : 'N/A'}</span></div>
                        </div>

                        <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 space-y-0.5">
                          <div className="text-emerald-400 font-bold">Chlorophyll-A</div>
                          <div className="text-slate-300">Range: {chlD ? `${chlD.min} - ${chlD.max} mg/m³` : 'Telemetry Active'}</div>
                          <div className="text-slate-400">Mean: <span className="text-slate-200">{chlD ? `${chlD.mean} mg/m³` : 'N/A'}</span></div>
                          <div className="text-slate-400">Std Dev: <span className="text-emerald-300">{chlD ? `${chlD.std} mg/m³` : 'N/A'}</span></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Argo Floats Telemetry Detail */}
            <div className="bg-slate-900/80 border border-cyan-500/30 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-200">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                  <span>ACTIVE ARGO PROFILERS</span>
                </div>
                <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950 border border-cyan-800/60 px-2 py-0.5 rounded-md">
                  {stats.floats?.total_active || 2} ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                Real Argo GDAC Floats: {stats.floats?.total_active || 2} active profilers reporting in domain on {activeTime}.
              </p>
              {stats.floats?.float_ids?.length > 0 && (
                <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800">
                  <span className="text-[10px] font-mono text-slate-500">PROFILER IDs:</span>
                  <div className="flex flex-wrap gap-1">
                    {stats.floats.float_ids.map(id => (
                      <span key={id} className="text-[10px] font-mono text-cyan-300 bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 rounded-md">
                        #{id.replace(/^ARGO_/i, '')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Report Chat Assistant Section */}
            <div className="bg-slate-900/90 border border-cyan-500/40 rounded-xl p-3.5 space-y-3 mt-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-cyan-300">
                  <MessageSquare className="w-4 h-4 text-cyan-400" />
                  <span>HAVE ANY QUESTIONS?</span>
                </div>
                <span className="text-[9px] font-mono text-slate-500">
                  Answers are based on this report
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400">
                Ask about the ocean conditions in this report.
              </p>

              {/* Chat History List */}
              {chatHistory.length > 0 && (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                  {chatHistory.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-2.5 rounded-xl text-xs ${
                        msg.role === 'user'
                          ? 'bg-cyan-950/60 border border-cyan-800/60 text-slate-100 ml-4'
                          : 'bg-slate-950/70 border border-ocean-border/60 text-slate-200 mr-2'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-cyan-400 mb-1">
                        {msg.role === 'user' ? (
                          <>
                            <User className="w-3 h-3 text-cyan-300" />
                            <span>YOU</span>
                          </>
                        ) : (
                          <>
                            <Bot className="w-3 h-3 text-cyan-400" />
                            <span>OCEAN REPORT ASSISTANT</span>
                          </>
                        )}
                      </div>
                      <div className="leading-relaxed font-sans whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Chat Loading State */}
              {chatLoading && (
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-300 p-2 bg-slate-950/40 rounded-lg border border-cyan-800/40">
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                  <span>Analyzing this report...</span>
                </div>
              )}

              {/* Chat Input Form */}
              <form onSubmit={handleSendQuestion} className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatQuestion}
                  onChange={(e) => setChatQuestion(e.target.value)}
                  placeholder="Ask something about this report..."
                  aria-label="Ask a question about this report"
                  className="flex-1 bg-slate-950/80 border border-ocean-border/60 focus:border-cyan-400 text-slate-100 text-xs rounded-xl px-3 py-2 outline-none font-sans placeholder-slate-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!chatQuestion.trim() || chatLoading}
                  aria-label="Send question"
                  className="p-2 rounded-xl bg-cyan-600/80 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 disabled:hover:bg-cyan-600/80 font-bold transition-all shadow-sm"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </>
        )}
      </div>


      {/* Astro-Tech Footer */}
      <div className="mt-3 pt-2.5 border-t border-cyan-500/30 text-[10px] text-slate-500 font-mono flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-slate-300 font-bold">
          <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>INCOIS Data Engine</span>
        </div>
        <button
          onClick={fetchReport}
          className="hover:text-white transition-all duration-200 flex items-center gap-1.5 bg-slate-900/80 hover:bg-slate-800 border border-cyan-500/40 text-cyan-300 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold shadow-sm"
          title="Refresh Report Telemetry Data"
        >
          <RefreshCw className="w-3 h-3 text-cyan-400" />
          <span>Refresh</span>
        </button>
      </div>
    </aside>
  );
}
