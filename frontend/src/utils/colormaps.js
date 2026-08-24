/**
 * Ocean Colormaps Utility (SIH PS 26067 - MoES/INCOIS)
 * Supports thermal, viridis, and coolwarm palettes with linear and log scaling modes,
 * plus enhanced contrast for Thermal preset (Prompt F16) & optional discrete color stepping.
 */

// Preset 1: High-Contrast Thermal (Navy -> Electric Cyan -> Emerald Green -> Gold -> Crimson)
function evalThermal(t) {
  let r = 0, g = 0, b = 0;
  if (t < 0.25) {
    // Cold: Deep Navy Blue (5, 20, 75) -> Electric Cyan (0, 220, 255)
    const factor = t / 0.25;
    r = Math.round(5 - factor * 5);
    g = Math.round(20 + factor * 200);
    b = Math.round(75 + factor * 180);
  } else if (t < 0.5) {
    // Cool: Electric Cyan (0, 220, 255) -> Vivid Emerald Green (0, 230, 118)
    const factor = (t - 0.25) / 0.25;
    r = 0;
    g = Math.round(220 + factor * 10);
    b = Math.round(255 - factor * 137);
  } else if (t < 0.75) {
    // Temperate: Emerald Green (0, 230, 118) -> Golden Yellow (255, 235, 0)
    const factor = (t - 0.5) / 0.25;
    r = Math.round(factor * 255);
    g = Math.round(230 + factor * 5);
    b = Math.round(118 - factor * 118);
  } else {
    // Hot: Golden Yellow (255, 235, 0) -> Intense Crimson Red (225, 0, 20)
    const factor = (t - 0.75) / 0.25;
    r = Math.round(255 - factor * 30);
    g = Math.round(235 - factor * 235);
    b = Math.round(factor * 20);
  }
  return [r, g, b];
}

// Preset 2: Viridis (Perceptually Uniform: Dark Purple -> Teal -> Green -> Yellow)
function evalViridis(t) {
  const r = Math.round(255 * Math.max(0, Math.min(1, -0.35 + 1.25 * t + 0.1 * Math.sin(t * Math.PI))));
  const g = Math.round(255 * Math.max(0, Math.min(1, 0.05 + 0.95 * Math.sin(t * Math.PI * 0.95))));
  const b = Math.round(255 * Math.max(0, Math.min(1, 0.55 - 0.55 * t + 0.45 * Math.cos(t * Math.PI * 0.5))));
  return [r, g, b];
}

// Preset 3: Coolwarm (Diverging: Deep Blue -> Light Gray -> Deep Red)
function evalCoolwarm(t) {
  let r = 0, g = 0, b = 0;
  if (t < 0.5) {
    const factor = t / 0.5;
    r = Math.round(59 + factor * 161);
    g = Math.round(76 + factor * 144);
    b = Math.round(192 + factor * 28);
  } else {
    const factor = (t - 0.5) / 0.5;
    r = Math.round(220 + factor * 20);
    g = Math.round(220 - factor * 170);
    b = Math.round(220 - factor * 170);
  }
  return [r, g, b];
}

/**
 * Evaluates scalar value v into [r, g, b, alpha] according to palette settings.
 * Supports optional discrete color stepping (isStepped = true, numSteps = 10).
 */
export function evaluateColormapValue(
  val,
  minVal,
  maxVal,
  palette = 'thermal',
  scaleMode = 'linear',
  isStepped = false,
  numSteps = 10
) {
  if (val === null || val === undefined || isNaN(val)) {
    return [30, 40, 60, 0]; // Transparent dark gray for missing/NaN
  }

  const range = maxVal - minVal || 1.0;
  let t = (val - minVal) / range;

  // Apply Logarithmic scaling if requested
  if (scaleMode === 'log') {
    const safeVal = Math.max(0, val - minVal);
    t = Math.log1p(safeVal) / Math.log1p(Math.max(1e-5, range));
  }

  t = Math.max(0, Math.min(1, t));

  // Quantize t into discrete color steps if requested
  if (isStepped && numSteps > 1) {
    t = Math.floor(t * numSteps) / (numSteps - 1);
    t = Math.max(0, Math.min(1, t));
  }

  let rgb = [0, 0, 0];
  if (palette === 'viridis') {
    rgb = evalViridis(t);
  } else if (palette === 'coolwarm') {
    rgb = evalCoolwarm(t);
  } else {
    rgb = evalThermal(t);
  }

  return [...rgb, 230]; // 90% opacity
}
