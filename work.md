# Work Log -- SIH PS 26067 -- Ocean Data 3D Visualization Platform

**Session Date**: 2026-08-23
**Role**: AI Pipeline Dev
**Project**: Web-based 3D Ocean Data Visualization Platform (SIH Problem Statement 26067, Sponsor: INCOIS)

---

## Summary

This session built, configured, and fully verified the **AI Pipeline Dev track** for the Ocean Data 3D Visualization Platform. The pipeline takes raw Copernicus Marine NetCDF ocean model files and Argo float data, preprocesses them into compact JSON files matching the filesystem contract, and delivers them to the FastAPI backend -- which was confirmed to serve real ocean data to the frontend via HTTP.

---

## 1. Project Analysis

Reviewed and understood all four core project documents:

| Document | Purpose |
|---|---|
| README.md | Product overview, definition of done, team structure |
| architecture.md | System design, filesystem contract, HTTP contract |
| roadmap.md | 48-hour phased build plan, checkpoints |
| prompts.md | AI prompt library for all three tracks |

**Key finding**: The architecture enforces two hard contracts that decouple the three parallel teams:
- **Filesystem Contract** (Pipeline -> Backend): JSON files at `data/slices/{variable}/{depth}/{time}.json` and `data/floats/`
- **HTTP Contract** (Backend -> Frontend): 5 REST endpoints at `http://localhost:8000`

---

## 2. Files Created

### 2.1 Pipeline Scripts

| File | Description |
|---|---|
| `pipeline/requirements.txt` | Dependencies: xarray, netCDF4, numpy, matplotlib, scipy |
| `pipeline/scripts/explore_netcdf.py` | Inspect any NetCDF file: variables, dims, lat/lon bounds, timesteps, surface plot |
| `pipeline/scripts/build_slices.py` | General-purpose downsampling pipeline for any NetCDF file to JSON slices |
| `pipeline/scripts/parse_argo.py` | Parse raw Argo GDAC float profile files to data/floats/ JSON format |
| `pipeline/scripts/process_copernicus.py` | **Main production pipeline** -- maps thetao->temperature, so->salinity, uo/vo->currents magnitude, downsamples grid, exports compact JSON slices |
| `pipeline/scripts/test_pipeline.py` | Full end-to-end test: scripts, data files, JSON shapes, floats contract, 10 HTTP API endpoints |
| `pipeline/raw/README.md` | Documents where to drop Copernicus/NOAA NetCDF raw files |

### 2.2 Data Outputs Generated

| Output | Location | Count |
|---|---|---|
| Temperature slices (real Copernicus data) | data/slices/temperature/ | 40 JSON files |
| Salinity slices (real Copernicus data) | data/slices/salinity/ | 40 JSON files |
| Currents slices (computed uo/vo magnitude) | data/slices/currents/ | 40 JSON files |
| Chlorophyll slices (dummy placeholder) | data/slices/chlorophyll/ | 15 JSON files |
| Argo float index | data/floats/floats_index.json | 4 floats |
| Argo float profiles | data/floats/{float_id}.json | 4 profile files |
| **Total** | | **139 JSON files** |

---

## 3. Copernicus Marine Dataset Inspection

Real Copernicus Marine files in `pipeline/raw/pipeline/raw/`:

| File | Variable | Size |
|---|---|---|
| cmems_mod_glo_phy-thetao_anfc_...nc | Potential Temperature (thetao) | 26 MB |
| cmems_mod_glo_phy-so_anfc_...nc | Sea Water Salinity (so) | 26 MB |
| cmems_mod_glo_phy-cur_anfc_...nc | Velocity components (uo, vo) | 52 MB |

### Dataset Specifications

| Property | Value |
|---|---|
| Spatial coverage | 6.67N - 21.00N, 78.67E - 92.25E (Bay of Bengal) |
| Grid resolution (native) | 0.083 degrees (~9 km) |
| Grid shape (post-downsample) | 29 lat x 28 lon |
| Depth levels (native) | 46 levels (0.49m to 3992.48m) |
| Depth levels (extracted) | 5 representative levels |
| Timesteps | 5 daily: 2026-08-20 to 2026-08-24 |
| Coordinate names | latitude, longitude, depth, time |

---

## 4. Variable Ranges -- For Frontend Dev Colorbar Defaults

> Hand these to the Frontend Dev for ColorbarEditor.jsx default min/max values.

| Variable | Min | Max | Units |
|---|---|---|---|
| Temperature | 22.93 | 31.02 | degrees C |
| Salinity | 21.56 | 35.42 | PSU |
| Currents (speed) | 0.00 | 1.64 | m/s |

---

## 5. Dependencies Installed This Session

```
matplotlib==3.11.1     (newly installed)
fastapi==0.141.1       (newly installed)
uvicorn==0.52.4        (newly installed)
httpx==0.28.1          (newly installed)

xarray==2025.9.0       (was already present)
netCDF4==1.7.4         (was already present)
numpy==2.5.2           (was already present)
scipy==1.18.1          (was already present)
```

---

## 6. End-to-End Test Results (21/21 PASS)

Run with: `python -W ignore pipeline/scripts/test_pipeline.py`

```
=================================================================
FULL END-TO-END PIPELINE TEST -- SIH PS 26067 Ocean Viz
=================================================================

[1] Pipeline Scripts Present:
  [OK] pipeline/scripts/explore_netcdf.py      PASS (1899 bytes)
  [OK] pipeline/scripts/build_slices.py        PASS (4439 bytes)
  [OK] pipeline/scripts/parse_argo.py          PASS (2353 bytes)
  [OK] pipeline/scripts/process_copernicus.py  PASS (6277 bytes)
  [OK] pipeline/requirements.txt               PASS (78 bytes)

[2] Data Slices -- Filesystem Contract:
  [OK] Variable 'chlorophyll'                  PASS (15 slice files)
  [OK] Variable 'currents'                     PASS (40 slice files)
  [OK] Variable 'salinity'                     PASS (40 slice files)
  [OK] Variable 'temperature'                  PASS (40 slice files)
  => Total slice files: 135

[3] Real Copernicus Slice JSON Shape:
  [OK] Required JSON keys present              PASS [variable, depth, time, lat, lon, values]
  [OK] Values grid non-empty                   PASS (29 lat x 28 lon)
  [OK] Depth value correct                     PASS depth=0
  [OK] Time value correct                      PASS time=2026-08-20
  [OK] Sample value is float                   PASS sample_val=28.27

[4] Floats -- Filesystem Contract:
  [OK] floats_index.json exists                PASS (4 floats)
  [OK] Index has float_id/lat/lon keys         PASS
  [OK] Individual float profile files          PASS (4 files)
  [OK] Profile has depth/temp/salinity keys    PASS

[5] Backend FastAPI HTTP Contract:
  [OK] GET /                                   PASS 200
  [OK] GET /variables                          PASS 200
  [OK] GET /timesteps                          PASS 200
  [OK] GET /field (temperature, real data)     PASS 200
  [OK] GET /field (salinity, real data)        PASS 200
  [OK] GET /field (currents, real data)        PASS 200
  [OK] GET /field (invalid variable)           PASS 404
  [OK] GET /floats                             PASS 200
  [OK] GET /floats/ARGO_2901234/profile        PASS 200
  [OK] GET /floats/NONEXISTENT_9999/profile    PASS 404
  [OK] HTTP /field grid shape (real data)      PASS (29 x 28)

=================================================================
RESULT: ALL CHECKS PASSED -- Pipeline is fully operational!
=================================================================
```

---

## 7. How to Re-run the Pipeline

```bash
# One-time setup
cd ocean-viz
pip install -r pipeline/requirements.txt

# Inspect a new raw NetCDF file
python pipeline/scripts/explore_netcdf.py pipeline/raw/<yourfile>.nc

# Process all Copernicus files to JSON slices
python pipeline/scripts/process_copernicus.py

# Parse Argo float profiles
python pipeline/scripts/parse_argo.py

# Start the backend
cd backend && uvicorn main:app --reload --port 8000

# Run full test suite
python -W ignore pipeline/scripts/test_pipeline.py

# Start frontend
cd frontend && npm run dev
```

---

## 8. Known Issues

- **argopy/erddapy warnings**: argopy globally installed has broken erddapy import. Harmless. Suppress with `-W ignore`.
- **StarletteDeprecationWarning**: FastAPI TestClient recommends httpx2. No functional impact.
- **Chlorophyll**: No real Copernicus bio file provided. Chlorophyll uses dummy slices. Download cmems_mod_bio_* from Copernicus Marine to get real data.
- **Argo floats**: Dummy float profiles used. For real data, download from https://data-argo.ifremer.fr (Bay of Bengal region) and run parse_argo.py.
- **Raw folder nesting**: Raw files are inside pipeline/raw/pipeline/raw/ due to local arrangement. process_copernicus.py uses os.walk() so this is handled automatically.

---

## 9. Filesystem Contract Reference

```
data/slices/{variable}/{depth}/{time}.json
  -> { "variable": "temperature", "depth": 0, "time": "2026-08-20",
       "lat": [6.83, 7.33, ...], "lon": [78.83, 79.33, ...],
       "values": [[28.27, ...], [...]] }

data/floats/floats_index.json
  -> [{ "float_id": "ARGO_2901234", "lat": 12.5, "lon": 83.2 }, ...]

data/floats/{float_id}.json
  -> { "float_id": "ARGO_2901234",
       "profiles": [{ "time": "2026-08-20",
                      "depth": [0, 10, 50, 100, 200, 500, 1000],
                      "temperature": [28.2, 28.0, 25.1, 21.0, 15.4, 8.2, 5.1],
                      "salinity":    [34.1, 34.1, 34.5, 34.8, 34.9, 35.0, 35.1] }] }
```
