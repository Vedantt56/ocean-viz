/**
 * Ocean Colormaps Utility (SIH PS 26067 - MoES/INCOIS)
 * Supports thermal, viridis, and coolwarm palettes with linear and log scaling modes,
 * plus enhanced contrast for Thermal preset (Prompt F16) & optional discrete color stepping.
 */

// Preset 1: High-Contrast Ocean Thermal (Abyss Navy -> Electric Cyan -> Emerald Green -> Gold -> Fiery Red)
function evalThermal(t) {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.25) {
    const f = t / 0.25;
    return [
      Math.round(8 + f * (0 - 8)),
      Math.round(29 + f * (180 - 29)),
      Math.round(88 + f * (216 - 88)),
    ];
  } else if (t < 0.50) {
    const f = (t - 0.25) / 0.25;
    return [
      Math.round(0 + f * (0 - 0)),
      Math.round(180 + f * (230 - 180)),
      Math.round(216 + f * (118 - 216)),
    ];
  } else if (t < 0.75) {
    const f = (t - 0.50) / 0.25;
    return [
      Math.round(0 + f * (255 - 0)),
      Math.round(230 + f * (234 - 230)),
      Math.round(118 + f * (0 - 118)),
    ];
  } else {
    const f = (t - 0.75) / 0.25;
    return [
      Math.round(255 + f * (255 - 255)),
      Math.round(234 - f * 211),
      Math.round(0 + f * (68 - 0)),
    ];
  }
}

// Preset 2: Viridis (Perceptually Uniform: Deep Purple -> Ocean Blue -> Teal -> Lime -> Solar Yellow)
function evalViridis(t) {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.25) {
    const f = t / 0.25;
    return [
      Math.round(68 + f * (59 - 68)),
      Math.round(1 + f * (82 - 1)),
      Math.round(84 + f * (139 - 84)),
    ];
  } else if (t < 0.50) {
    const f = (t - 0.25) / 0.25;
    return [
      Math.round(59 + f * (33 - 59)),
      Math.round(82 + f * (145 - 82)),
      Math.round(139 + f * (140 - 139)),
    ];
  } else if (t < 0.75) {
    const f = (t - 0.50) / 0.25;
    return [
      Math.round(33 + f * (94 - 33)),
      Math.round(145 + f * (201 - 145)),
      Math.round(140 + f * (98 - 140)),
    ];
  } else {
    const f = (t - 0.75) / 0.25;
    return [
      Math.round(94 + f * (253 - 94)),
      Math.round(201 + f * (231 - 201)),
      Math.round(98 + f * (37 - 98)),
    ];
  }
}

// Preset 3: Coolwarm (Diverging: Deep Cobalt -> Ice White -> Crimson Red)
function evalCoolwarm(t) {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.50) {
    const f = t / 0.50;
    return [
      Math.round(30 + f * (230 - 30)),
      Math.round(80 + f * (240 - 80)),
      Math.round(220 + f * (255 - 220)),
    ];
  } else {
    const f = (t - 0.50) / 0.50;
    return [
      Math.round(230 + f * (235 - 230)),
      Math.round(240 - f * 200),
      Math.round(255 - f * 215),
    ];
  }
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
