/**
 * Fixture Data for Ocean 3D Viz Platform (SIH PS 26067)
 * Mock responses matching HTTP contract for day-one frontend development.
 */

export const FIXTURE_VARIABLES = ["temperature", "salinity", "currents", "chlorophyll"];

export const FIXTURE_TIMESTEPS = ["2024-06-01", "2024-06-02", "2024-06-03"];

export const FIXTURE_DEPTHS = [0, 50, 100, 200, 500];

// Grid dimensions for Indian Ocean / Bay of Bengal region
// Lat: 5.0°N to 20.0°N (16 points), Lon: 75.0°E to 90.0°E (16 points)
const lats = Array.from({ length: 16 }, (_, i) => parseFloat((5 + i * 1).toFixed(1)));
const lons = Array.from({ length: 16 }, (_, i) => parseFloat((75 + i * 1).toFixed(1)));

// Helper to generate 2D value grid with realistic gradient and noise
function generateGrid(variable, depth, timestepIndex) {
  const depthFactor = depth === 0 ? 1.0 : depth === 50 ? 0.85 : depth === 100 ? 0.7 : depth === 200 ? 0.55 : 0.4;
  const timeOffset = timestepIndex * 0.3;

  return lats.map((lat, i) => {
    return lons.map((lon, j) => {
      const distFromCenter = Math.sqrt(Math.pow(lat - 12.5, 2) + Math.pow(lon - 82.5, 2));
      const variation = Math.sin(i * 0.4 + timeOffset) * Math.cos(j * 0.4 + timeOffset) * 1.5;

      switch (variable) {
        case "temperature": {
          // Surface: ~28.5°C, 50m: ~24°C, 100m: ~20°C, 200m: ~16°C, 500m: ~12°C
          const baseTemp = depth === 0 ? 28.5 : depth === 50 ? 24.0 : depth === 100 ? 20.0 : depth === 200 ? 16.0 : 12.0;
          const val = baseTemp + (10 - distFromCenter) * 0.2 * depthFactor + variation * depthFactor;
          return parseFloat(Math.max(5, Math.min(32, val)).toFixed(2));
        }
        case "salinity": {
          // 33.0 - 36.0 PSU
          const baseSal = depth === 0 ? 33.8 : depth === 100 ? 34.8 : 35.2;
          const val = baseSal + Math.sin(lat * 0.2 + lon * 0.1) * 0.5 + (variation * 0.1);
          return parseFloat(Math.max(30, Math.min(37, val)).toFixed(2));
        }
        case "currents": {
          // Current speed in m/s (0.05 to 1.4 m/s)
          const baseSpeed = depth === 0 ? 0.8 : depth === 100 ? 0.4 : 0.15;
          const val = baseSpeed + Math.cos(distFromCenter * 0.5 + timeOffset) * 0.3;
          return parseFloat(Math.max(0.02, Math.min(2.0, val)).toFixed(2));
        }
        case "chlorophyll": {
          // mg/m^3 (highest at surface near coast, low at depth)
          const baseChl = depth === 0 ? 1.2 : depth === 100 ? 0.3 : 0.02;
          const coastalBoost = (90 - lon) * 0.05;
          const val = baseChl + coastalBoost + variation * 0.1;
          return parseFloat(Math.max(0.01, Math.min(5.0, val)).toFixed(2));
        }
        default:
          return 0;
      }
    });
  });
}

// Generate pre-populated mock fields for all (variable, depth, timestep) combinations
export const FIXTURE_FIELDS = {};

FIXTURE_VARIABLES.forEach((variable) => {
  FIXTURE_TIMESTEPS.forEach((time, tIdx) => {
    FIXTURE_DEPTHS.forEach((depth) => {
      const key = `${variable}_${depth}_${time}`;
      FIXTURE_FIELDS[key] = {
        variable,
        depth,
        time,
        lat: lats,
        lon: lons,
        values: generateGrid(variable, depth, tIdx),
      };
    });
  });
});

// Argo Float Index Data (4-5 floats in Indian Ocean / Bay of Bengal)
export const FIXTURE_FLOATS_INDEX = [
  { float_id: "argo_2901234", lat: 11.5, lon: 81.2 },
  { float_id: "argo_2901235", lat: 14.2, lon: 86.8 },
  { float_id: "argo_2901236", lat: 8.4, lon: 77.6 },
  { float_id: "argo_2901237", lat: 17.1, lon: 88.5 },
  { float_id: "argo_2901238", lat: 6.8, lon: 84.1 },
];

// Profile data for individual Argo floats (BGC-Argo parameters)
export const FIXTURE_FLOAT_PROFILES = {
  argo_2901234: {
    float_id: "argo_2901234",
    profiles: [
      {
        time: "2024-06-01",
        depth: [0, 10, 25, 50, 100, 200, 300, 500, 750, 1000],
        temperature: [29.2, 29.0, 28.5, 25.1, 20.4, 15.2, 12.1, 9.3, 7.1, 5.8],
        salinity: [33.5, 33.6, 33.9, 34.4, 34.9, 35.1, 35.0, 34.9, 34.8, 34.8],
        currents: [0.85, 0.81, 0.72, 0.54, 0.38, 0.24, 0.16, 0.09, 0.05, 0.03],
        chlorophyll: [1.45, 1.68, 1.92, 1.25, 0.58, 0.21, 0.08, 0.03, 0.01, 0.00],
      },
    ],
  },
  argo_2901235: {
    float_id: "argo_2901235",
    profiles: [
      {
        time: "2024-06-01",
        depth: [0, 10, 25, 50, 100, 200, 300, 500, 750, 1000],
        temperature: [28.8, 28.7, 28.1, 24.6, 19.8, 14.9, 11.8, 9.0, 6.9, 5.6],
        salinity: [33.2, 33.3, 33.7, 34.2, 34.8, 35.0, 34.9, 34.8, 34.7, 34.8],
        currents: [0.76, 0.72, 0.61, 0.45, 0.31, 0.19, 0.12, 0.07, 0.04, 0.02],
        chlorophyll: [1.12, 1.34, 1.58, 0.98, 0.42, 0.15, 0.05, 0.02, 0.01, 0.00],
      },
    ],
  },
  argo_2901236: {
    float_id: "argo_2901236",
    profiles: [
      {
        time: "2024-06-01",
        depth: [0, 10, 25, 50, 100, 200, 300, 500, 750, 1000],
        temperature: [29.8, 29.5, 29.1, 26.2, 21.5, 16.0, 13.0, 10.1, 7.8, 6.2],
        salinity: [34.1, 34.2, 34.4, 34.8, 35.2, 35.3, 35.1, 35.0, 34.9, 34.9],
        currents: [0.94, 0.89, 0.78, 0.62, 0.42, 0.28, 0.19, 0.11, 0.06, 0.03],
        chlorophyll: [1.82, 2.10, 2.35, 1.45, 0.72, 0.28, 0.10, 0.04, 0.01, 0.00],
      },
    ],
  },
  argo_2901237: {
    float_id: "argo_2901237",
    profiles: [
      {
        time: "2024-06-01",
        depth: [0, 10, 25, 50, 100, 200, 300, 500, 750, 1000],
        temperature: [28.3, 28.2, 27.8, 23.9, 19.1, 14.3, 11.2, 8.7, 6.6, 5.4],
        salinity: [32.9, 33.0, 33.5, 34.0, 34.6, 34.9, 34.8, 34.7, 34.6, 34.7],
        currents: [0.68, 0.64, 0.52, 0.38, 0.25, 0.15, 0.09, 0.05, 0.03, 0.01],
        chlorophyll: [0.95, 1.15, 1.38, 0.82, 0.35, 0.12, 0.04, 0.01, 0.00, 0.00],
      },
    ],
  },
  argo_2901238: {
    float_id: "argo_2901238",
    profiles: [
      {
        time: "2024-06-01",
        depth: [0, 10, 25, 50, 100, 200, 300, 500, 750, 1000],
        temperature: [29.5, 29.3, 28.9, 25.8, 20.9, 15.6, 12.5, 9.7, 7.4, 6.0],
        salinity: [33.7, 33.8, 34.1, 34.6, 35.0, 35.2, 35.0, 34.9, 34.8, 34.8],
        currents: [0.88, 0.83, 0.70, 0.52, 0.35, 0.22, 0.14, 0.08, 0.04, 0.02],
        chlorophyll: [1.52, 1.76, 2.05, 1.32, 0.62, 0.24, 0.09, 0.03, 0.01, 0.00],
      },
    ],
  },
};
