import os
import json
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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
    Scans data/slices/ to find all unique timesteps available.
    """
    if not os.path.exists(SLICES_DIR):
        return []
    
    timesteps = set()
    for root, _, files in os.walk(SLICES_DIR):
        for file in files:
            if file.endswith(".json"):
                timestep = file[:-5]  # Strip '.json'
                timesteps.add(timestep)
                
    return sorted(list(timesteps))

@app.get("/field")
def get_field(
    variable: str = Query(..., description="Variable name (e.g. temperature, salinity, currents, chlorophyll)"),
    depth: int = Query(..., description="Depth level in meters (e.g. 0, 50, 100)"),
    time: str = Query(..., description="Timestep string (e.g. 2024-06-01)")
):
    """
    HTTP Contract: GET /field?variable=&depth=&time=
    Returns the JSON content of data/slices/{variable}/{depth}/{time}.json
    """
    # Sanitize depth input (ensure numeric string path)
    depth_str = str(depth)
    target_file = os.path.join(SLICES_DIR, variable, depth_str, f"{time}.json")
    
    if not os.path.exists(target_file):
        raise HTTPException(
            status_code=404,
            detail=f"Field data slice not found for variable='{variable}', depth={depth}, time='{time}'. "
                   f"Path tried: data/slices/{variable}/{depth}/{time}.json"
        )
        
    try:
        with open(target_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error reading slice file: {str(e)}"
        )

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
    """
    float_file = os.path.join(FLOATS_DIR, f"{float_id}.json")
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
