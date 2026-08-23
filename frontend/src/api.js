/**
 * API Service Wrapper for Ocean Data 3D Visualization Platform (SIH PS 26067)
 * 
 * Switching USE_FIXTURES flag to false points the app at the real FastAPI backend.
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
export const USE_FIXTURES = true;

const API_BASE_URL = "http://localhost:8000";

/**
 * Helper to simulate network latency when in mock mode
 */
const mockDelay = (data, ms = 100) =>
  new Promise((resolve) => setTimeout(() => resolve(data), ms));

/**
 * Fetch available ocean variables
 * Endpoint: GET /variables
 */
export async function getVariables() {
  if (USE_FIXTURES) {
    return mockDelay(FIXTURE_VARIABLES);
  }
  const res = await fetch(`${API_BASE_URL}/variables`);
  if (!res.ok) throw new Error(`Failed to fetch variables: ${res.statusText}`);
  return res.json();
}

/**
 * Fetch available timesteps
 * Endpoint: GET /timesteps
 */
export async function getTimesteps() {
  if (USE_FIXTURES) {
    return mockDelay(FIXTURE_TIMESTEPS);
  }
  const res = await fetch(`${API_BASE_URL}/timesteps`);
  if (!res.ok) throw new Error(`Failed to fetch timesteps: ${res.statusText}`);
  return res.json();
}

/**
 * Fetch available depth levels
 */
export async function getDepths() {
  if (USE_FIXTURES) {
    return mockDelay(FIXTURE_DEPTHS);
  }
  return mockDelay(FIXTURE_DEPTHS);
}

/**
 * Fetch a specific 2D field grid by variable, depth, and time
 * Endpoint: GET /field?variable=&depth=&time=
 */
export async function getField(variable, depth, time) {
  if (USE_FIXTURES) {
    const key = `${variable}_${depth}_${time}`;
    const data = FIXTURE_FIELDS[key];
    if (!data) {
      // Fallback fallback if specific combination key isn't in fixture dictionary
      const defaultData = FIXTURE_FIELDS[`${variable}_0_${time}`] || FIXTURE_FIELDS[`temperature_0_2024-06-01`];
      return mockDelay({ ...defaultData, variable, depth, time });
    }
    return mockDelay(data);
  }

  const url = new URL(`${API_BASE_URL}/field`);
  url.searchParams.append("variable", variable);
  url.searchParams.append("depth", depth);
  url.searchParams.append("time", time);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch field data (${variable}, depth ${depth}, time ${time}): ${res.statusText}`);
  return res.json();
}

/**
 * Fetch index of Argo floats within a region
 * Endpoint: GET /floats?region=
 */
export async function getFloats(region = "indian_ocean") {
  if (USE_FIXTURES) {
    return mockDelay(FIXTURE_FLOATS_INDEX);
  }
  const res = await fetch(`${API_BASE_URL}/floats?region=${encodeURIComponent(region)}`);
  if (!res.ok) throw new Error(`Failed to fetch float index: ${res.statusText}`);
  return res.json();
}

/**
 * Fetch detailed profile for a specific Argo float by float_id
 * Endpoint: GET /floats/{id}/profile
 */
export async function getFloatProfile(floatId) {
  if (USE_FIXTURES) {
    const profile = FIXTURE_FLOAT_PROFILES[floatId] || FIXTURE_FLOAT_PROFILES["argo_2901234"];
    return mockDelay(profile);
  }
  const res = await fetch(`${API_BASE_URL}/floats/${encodeURIComponent(floatId)}/profile`);
  if (!res.ok) throw new Error(`Failed to fetch profile for float ${floatId}: ${res.statusText}`);
  return res.json();
}
