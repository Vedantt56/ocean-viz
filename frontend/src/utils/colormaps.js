/**
 * Ocean Colormaps Utility
 * Supports thermal, viridis, and coolwarm palettes with linear and log scaling modes.
 */

// Preset 1: Thermal (Deep Blue -> Cyan -> Green -> Yellow -> Red)
function evalThermal(t) {
  let r = 0, g = 0, b = 0;
  if (t < 0.25) {
    const factor = t / 0.25;
    r = 0; g = Math.round(30 + factor * 170); b = Math.round(200 + factor * 55);
  } else if (t < 0.5) {
    const factor = (t - 0.25) / 0.25;
    r = Math.round(factor * 30); g = Math.round(200 + factor * 20); b = Math.round(255 - factor * 175);
  } else if (t < 0.75) {
    const factor = (t - 0.5) / 0.25;
    r = Math.round(30 + factor * 225); g = Math.round(220 - factor * 10); b = Math.round(80 - factor * 80);
  } else {
    const factor = (t - 0.75) / 0.25;
    r = Math.round(255 - factor * 15); g = Math.round(210 - factor * 170); b = Math.round(factor * 40);
  }
  return [r, g, b];
}

// Preset 2: Viridis (Perceptually Uniform & Colorblind Safe: Dark Purple -> Teal -> Green -> Yellow)
function evalViridis(t) {
  // Approximate viridis polynomial curve
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
 */
export function evaluateColormapValue(val, minVal, maxVal, palette = 'thermal', scaleMode = 'linear') {
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
