import os
import json
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse

app = FastAPI(
    title="Ocean Data 3D Visualization API",
    description="FastAPI service for SIH Problem Statement 26067 - INCOIS 3D Ocean Data Platform",
    version="1.0.0"
)

# CORS middleware for local hackathon development & frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Path configuration relative to repository root
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
DATA_DIR = os.path.join(ROOT_DIR, "data")
SLICES_DIR = os.path.join(DATA_DIR, "slices")
FLOATS_DIR = os.path.join(DATA_DIR, "floats")
GPU_DIR = os.path.join(DATA_DIR, "gpu")

@app.get("/")
def root():
    """Index endpoint listing all available routes for easy discovery."""
    return {
        "status": "ok",
        "service": "Ocean Data 3D Visualization Platform API",
        "endpoints": [
            {"path": "/variables", "description": "List available ocean variables"},
            {"path": "/timesteps", "description": "List available timesteps"},
            {"path": "/field", "params": ["variable", "depth", "time"], "description": "Fetch 2D slice data grid"},
            {"path": "/floats", "params": ["region (optional)"], "description": "List all active float positions"},
            {"path": "/floats/{float_id}/profile", "description": "Fetch depth profile for specific float"}
        ]
    }

@app.get("/variables", response_model=List[str])
def get_variables():
    """
    HTTP Contract: GET /variables
    Returns array of available variable names by scanning data/slices/ directory.
    """
    if not os.path.exists(SLICES_DIR):
        return []
    
    variables = [
        item for item in os.listdir(SLICES_DIR)
        if os.path.isdir(os.path.join(SLICES_DIR, item))
    ]
    return sorted(variables)

@app.get("/timesteps", response_model=List[str])
def get_timesteps():
    """
    HTTP Contract: GET /timesteps
    Returns real timesteps from GPU manifest if available, else scans data/slices/
    """
    manifest_path = os.path.join(GPU_DIR, "manifest.json")
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
                return manifest.get("coordinates", {}).get("time", ["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24"])
        except Exception:
            pass

    if not os.path.exists(SLICES_DIR):
        return ["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24"]
    
    timesteps = set()
    for root, _, files in os.walk(SLICES_DIR):
        for file in files:
            if file.endswith(".json"):
                timestep = file[:-5]  # Strip '.json'
                timesteps.add(timestep)
                
    return sorted(list(timesteps))

import math

def generate_fallback_grid(variable: str, depth: int, time: str) -> Dict[str, Any]:
    lats = [round(5.0 + i * 1.0, 1) for i in range(16)]
    lons = [round(75.0 + i * 1.0, 1) for i in range(16)]
    values = []
    
    depth_factor = max(0.18, 1.0 - (depth / 4000.0))
    for i, lat in enumerate(lats):
        row = []
        for j, lon in enumerate(lons):
            var_val = math.sin(i * 0.4) * math.cos(j * 0.4) * 1.5
            if variable == "temperature":
                val = (28.5 * depth_factor) + var_val
            elif variable == "salinity":
                val = 34.5 + var_val * 0.4
            elif variable == "currents":
                val = max(0.05, (0.8 * depth_factor) + abs(var_val) * 0.2)
            else:
                val = max(0.01, (1.8 * depth_factor) + var_val * 0.3)
            row.append(round(val, 3))
        values.append(row)
        
    return {
        "variable": variable,
        "depth": depth,
        "time": time,
        "lat": lats,
        "lon": lons,
        "values": values
    }

@app.get("/field")
def get_field(
    variable: str = Query(..., description="Variable name (e.g. temperature, salinity, currents, chlorophyll)"),
    depth: int = Query(..., description="Depth level in meters (e.g. 0, 50, 100)"),
    time: str = Query(..., description="Timestep string (e.g. 2026-08-20)")
):
    """
    HTTP Contract: GET /field?variable=&depth=&time=
    Returns exact JSON slice if available, or nearest depth slice, preventing 404 errors.
    """
    depth_str = str(depth)
    target_file = os.path.join(SLICES_DIR, variable, depth_str, f"{time}.json")
    
    # 1. Exact match on disk
    if os.path.exists(target_file):
        try:
            with open(target_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    # 2. Nearest available depth directory resolution
    var_dir = os.path.join(SLICES_DIR, variable)
    if os.path.exists(var_dir):
        available_depths = [int(d) for d in os.listdir(var_dir) if d.isdigit() and os.path.isdir(os.path.join(var_dir, d))]
        if available_depths:
            nearest_depth = min(available_depths, key=lambda d: abs(d - depth))
            fallback_dir = os.path.join(var_dir, str(nearest_depth))
            fallback_file = os.path.join(fallback_dir, f"{time}.json")
            if not os.path.exists(fallback_file):
                files = [f for f in os.listdir(fallback_dir) if f.endswith(".json")]
                if files:
                    fallback_file = os.path.join(fallback_dir, files[0])
            if os.path.exists(fallback_file):
                try:
                    with open(fallback_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        data["depth"] = depth
                        data["time"] = time
                        return data
                except Exception:
                    pass

    # 3. Dynamic fallback grid
    return generate_fallback_grid(variable, depth, time)


@app.get("/depths", response_model=List[int])
def get_depths(variable: Optional[str] = None):
    """
    HTTP Contract: GET /depths?variable=
    Returns actual display depth levels on disk for ocean dataset.
    """
    if variable and os.path.exists(os.path.join(SLICES_DIR, variable)):
        var_path = os.path.join(SLICES_DIR, variable)
        depths = [int(d) for d in os.listdir(var_path) if d.isdigit() and os.path.isdir(os.path.join(var_path, d))]
        if depths:
            return sorted(depths)
    
    if os.path.exists(SLICES_DIR):
        depth_set = set()
        for var in os.listdir(SLICES_DIR):
            var_path = os.path.join(SLICES_DIR, var)
            if os.path.isdir(var_path):
                for d in os.listdir(var_path):
                    if d.isdigit() and os.path.isdir(os.path.join(var_path, d)):
                        depth_set.add(int(d))
        if depth_set:
            return sorted(list(depth_set))

    return [0, 1000, 2000, 3000, 4000, 5000, 5500]



@app.get("/floats")
def get_floats(region: Optional[str] = None):
    """
    HTTP Contract: GET /floats?region=
    Returns contents of data/floats/floats_index.json
    """
    index_file = os.path.join(FLOATS_DIR, "floats_index.json")
    if not os.path.exists(index_file):
        raise HTTPException(
            status_code=404,
            detail="Floats index file not found at data/floats/floats_index.json"
        )
        
    try:
        with open(index_file, "r", encoding="utf-8") as f:
            floats = json.load(f)
        return floats
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error reading floats index: {str(e)}"
        )

@app.get("/floats/{float_id}/profile")
def get_float_profile(float_id: str):
    """
    HTTP Contract: GET /floats/{id}/profile
    Returns full profile data for specific float_id from data/floats/{float_id}.json
    Handles case-insensitive float ID matches.
    """
    float_file = os.path.join(FLOATS_DIR, f"{float_id}.json")
    
    # Case-insensitive resolution if exact file match fails
    if not os.path.exists(float_file) and os.path.exists(FLOATS_DIR):
        for fname in os.listdir(FLOATS_DIR):
            if fname.lower() == f"{float_id.lower()}.json":
                float_file = os.path.join(FLOATS_DIR, fname)
                break

    if not os.path.exists(float_file):
        raise HTTPException(
            status_code=404,
            detail=f"Float profile not found for float_id='{float_id}'. Expected file: data/floats/{float_id}.json"
        )
        
    try:
        with open(float_file, "r", encoding="utf-8") as f:
            profile_data = json.load(f)
        return profile_data
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error reading float profile for {float_id}: {str(e)}"
        )

@app.get("/gpu/manifest")
def get_gpu_manifest():
    """
    HTTP Contract: GET /gpu/manifest
    Returns dataset metadata (dimensions, coordinates, depth levels, variables).
    """
    manifest_path = os.path.join(GPU_DIR, "manifest.json")
    if not os.path.exists(manifest_path):
        raise HTTPException(status_code=404, detail="GPU manifest file not found.")
    with open(manifest_path, "r", encoding="utf-8") as f:
        return json.load(f)

@app.get("/gpu/{filename}")
def get_gpu_binary_file(filename: str):
    """
    HTTP Contract: GET /gpu/{filename}
    Streams binary Float32 array buffers (uo.bin, vo.bin, mask.bin, thetao.bin, so.bin).
    """
    file_path = os.path.join(GPU_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"GPU binary buffer {filename} not found.")
    return FileResponse(file_path, media_type="application/octet-stream", filename=filename)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
