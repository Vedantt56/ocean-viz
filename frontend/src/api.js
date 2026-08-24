/**
 * API Service Wrapper for Ocean Data 3D Visualization Platform (SIH PS 26067)
 * 
 * Points to the real FastAPI backend at http://localhost:8000.
 * Falls back gracefully to local fixture data if the backend server is offline.
 */
import {
  FIXTURE_VARIABLES,
  FIXTURE_TIMESTEPS,
  FIXTURE_DEPTHS,
  FIXTURE_FIELDS,
  FIXTURE_FLOATS_INDEX,
  FIXTURE_FLOAT_PROFILES,
} from "./fixtures.js";

// Global Flag: Toggle between local fixture data and real backend HTTP endpoints
export const USE_FIXTURES = false;

const API_BASE_URL = "http://localhost:8000";

/**
 * Helper to simulate network latency when in mock/fallback mode
 */
const mockDelay = (data, ms = 50) =>
  new Promise((resolve) => setTimeout(() => resolve(data), ms));

/**
 * Fetch available ocean variables
 * Endpoint: GET /variables
 */
export async function getVariables() {
  if (USE_FIXTURES) {
    return mockDelay(FIXTURE_VARIABLES);
  }
  try {
    const res = await fetch(`${API_BASE_URL}/variables`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn("[API] Backend /variables unreachable, using local fixture fallback:", err.message);
    return mockDelay(FIXTURE_VARIABLES);
  }
}

/**
 * Fetch available timesteps
 * Endpoint: GET /timesteps
 */
export async function getTimesteps() {
  if (USE_FIXTURES) {
    return mockDelay(FIXTURE_TIMESTEPS);
  }
  try {
    const res = await fetch(`${API_BASE_URL}/timesteps`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn("[API] Backend /timesteps unreachable, using local fixture fallback:", err.message);
    return mockDelay(FIXTURE_TIMESTEPS);
  }
}

/**
 * Fetch available depth levels
 * Endpoint: GET /depths
 */
export async function getDepths() {
  if (USE_FIXTURES) {
    return mockDelay(FIXTURE_DEPTHS);
  }
  try {
    const res = await fetch(`${API_BASE_URL}/depths`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn("[API] Backend /depths unreachable, using local fixture fallback:", err.message);
    return mockDelay(FIXTURE_DEPTHS);
  }
}

/**
 * Fetch a specific 2D field grid by variable, depth, and time
 * Endpoint: GET /field?variable=&depth=&time=
 */
export async function getField(variable, depth, time) {
  if (USE_FIXTURES) {
    return getFixtureField(variable, depth, time);
  }

  try {
    const url = new URL(`${API_BASE_URL}/field`);
    url.searchParams.append("variable", variable);
    url.searchParams.append("depth", depth);
    url.searchParams.append("time", time);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn(`[API] Backend /field (${variable}, ${depth}m, ${time}) unreachable, using local fixture fallback:`, err.message);
    return getFixtureField(variable, depth, time);
  }
}

function getFixtureField(variable, depth, time) {
  const key = `${variable}_${depth}_${time}`;
  const data = FIXTURE_FIELDS[key];
  if (!data) {
    const defaultData = FIXTURE_FIELDS[`${variable}_0_${time}`] || FIXTURE_FIELDS[`temperature_0_2024-06-01`];
    return mockDelay({ ...defaultData, variable, depth, time });
  }
  return mockDelay(data);
}

/**
 * Fetch index of Argo floats within a region
 * Endpoint: GET /floats?region=
 */
export async function getFloats(region = "indian_ocean") {
  if (USE_FIXTURES) {
    return mockDelay(FIXTURE_FLOATS_INDEX);
  }
  try {
    const res = await fetch(`${API_BASE_URL}/floats?region=${encodeURIComponent(region)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn("[API] Backend /floats unreachable, using local fixture fallback:", err.message);
    return mockDelay(FIXTURE_FLOATS_INDEX);
  }
}

/**
 * Fetch detailed profile for a specific Argo float by float_id
 * Endpoint: GET /floats/{id}/profile
 */
export async function getFloatProfile(floatId) {
  if (USE_FIXTURES) {
    return getFixtureFloatProfile(floatId);
  }
  try {
    const res = await fetch(`${API_BASE_URL}/floats/${encodeURIComponent(floatId)}/profile`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn(`[API] Backend /floats/${floatId}/profile unreachable, using local fixture fallback:`, err.message);
    return getFixtureFloatProfile(floatId);
  }
}

function getFixtureFloatProfile(floatId) {
  const profile = FIXTURE_FLOAT_PROFILES[floatId] || FIXTURE_FLOAT_PROFILES["argo_2901234"] || FIXTURE_FLOAT_PROFILES["ARGO_2901234"];
  return mockDelay(profile);
}
