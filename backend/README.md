# Ocean Data 3D Visualization Platform — Backend API

**Role:** Backend Dev (FastAPI)  
**SIH Problem Statement 26067** — Ministry of Earth Sciences (MoES) / INCOIS

---

## Overview

The Backend API acts as the central integration layer connecting the **Pipeline** output (pre-processed JSON data slice files) to the **Frontend** (React + Three.js 3D application).

- **Reads from:** `data/slices/` and `data/floats/`
- **Serves:** HTTP endpoints matching the HTTP contract

---

## Directory Structure

```
backend/
├── main.py                ← FastAPI service & routes
├── generate_dummy_data.py ← Day-one dummy data generator
├── test_backend.py        ← Automated contract test suite
├── requirements.txt       ← Dependencies (fastapi, uvicorn)
└── README.md              ← You are here
```

---

## Quickstart Guide

### 1. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Generate Initial / Dummy Data (Phase 0 / Day 1)
```bash
python generate_dummy_data.py
```
This populates `data/slices` and `data/floats` with realistic sample ocean data so backend and frontend can develop in parallel before pipeline output arrives.

### 3. Run FastAPI Server
```bash
uvicorn main:app --reload --port 8000
```
- API root: `http://localhost:8000/`
- Interactive Swagger UI docs: `http://localhost:8000/docs`

---

## Endpoints (HTTP Contract)

| Endpoint | Method | Params | Description |
|---|---|---|---|
| `/` | `GET` | None | API status & route index |
| `/variables` | `GET` | None | Returns list of available variables (e.g. `["temperature", "salinity", ...]`) |
| `/timesteps` | `GET` | None | Returns list of available timesteps (e.g. `["2024-06-01", ...]`) |
| `/field` | `GET` | `variable`, `depth`, `time` | Returns 2D grid slice JSON |
| `/floats` | `GET` | `region` (optional) | Returns list of active float markers |
| `/floats/{float_id}/profile` | `GET` | None | Returns depth profile series for float |

---

## Running Verification Tests

```bash
python test_backend.py
```
Validates all 5 endpoints against active files in `data/`.
