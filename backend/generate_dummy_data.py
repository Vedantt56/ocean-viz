import json
import os
import math
import random

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
DATA_DIR = os.path.join(ROOT_DIR, "data")
SLICES_DIR = os.path.join(DATA_DIR, "slices")
FLOATS_DIR = os.path.join(DATA_DIR, "floats")

# Variables, depths, timesteps as per architecture spec
VARIABLES = ["temperature", "salinity", "currents", "chlorophyll"]
DEPTHS = [0, 50, 100, 200, 500]
TIMESTEPS = ["2024-06-01", "2024-06-02", "2024-06-03"]

# Indian Ocean / Bay of Bengal region
LAT_MIN, LAT_MAX, LAT_STEPS = 10.0, 20.0, 11
LON_MIN, LON_MAX, LON_STEPS = 80.0, 90.0, 11

def generate_lat_lon():
    lats = [round(LAT_MIN + i * (LAT_MAX - LAT_MIN) / (LAT_STEPS - 1), 2) for i in range(LAT_STEPS)]
    lons = [round(LON_MIN + j * (LON_MAX - LON_MIN) / (LON_STEPS - 1), 2) for j in range(LON_STEPS)]
    return lats, lons

def generate_grid_values(var_name, depth, day_offset):
    lats, lons = generate_lat_lon()
    grid = []
    for i, lat in enumerate(lats):
        row = []
        for j, lon in enumerate(lons):
            # Base variation with lat, lon, depth, and time
            spatial = math.sin(math.radians(lat * 3)) * math.cos(math.radians(lon * 2))
            depth_factor = math.exp(-depth / 200.0)
            time_factor = math.sin(day_offset * 0.5)
            
            if var_name == "temperature":
                # Temperature: ~15-30°C decreasing with depth
                val = 15.0 + (13.0 + 2.0 * spatial + 0.5 * time_factor) * depth_factor
            elif var_name == "salinity":
                # Salinity: ~32-37 PSU
                val = 34.5 + 1.5 * spatial + (0.5 if depth > 100 else -0.3)
            elif var_name == "currents":
                # Currents speed: 0.0 - 2.5 m/s
                val = max(0.0, (1.2 + 0.8 * spatial + 0.2 * time_factor) * depth_factor)
            elif var_name == "chlorophyll":
                # Chlorophyll: high near surface, low at depth (0.01 - 3.5 mg/m3)
                val = max(0.01, (2.0 + 1.0 * spatial) * math.exp(-depth / 80.0))
            else:
                val = 10.0
                
            row.append(round(val, 2))
        grid.append(row)
    return grid

def build_slices():
    lats, lons = generate_lat_lon()
    count = 0
    for var in VARIABLES:
        for depth in DEPTHS:
            for day_idx, t in enumerate(TIMESTEPS):
                target_dir = os.path.join(SLICES_DIR, var, str(depth))
                os.makedirs(target_dir, exist_ok=True)
                
                slice_data = {
                    "variable": var,
                    "depth": depth,
                    "time": t,
                    "lat": lats,
                    "lon": lons,
                    "values": generate_grid_values(var, depth, day_idx)
                }
                
                file_path = os.path.join(target_dir, f"{t}.json")
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(slice_data, f, separators=(',', ':'))
                count += 1
    print(f"[+] Generated {count} slice files under {SLICES_DIR}")

def build_floats():
    os.makedirs(FLOATS_DIR, exist_ok=True)
    floats_info = [
        {"float_id": "ARGO_2901234", "lat": 12.5, "lon": 83.2},
        {"float_id": "ARGO_2901235", "lat": 15.8, "lon": 87.1},
        {"float_id": "ARGO_2901236", "lat": 18.2, "lon": 85.0},
        {"float_id": "ARGO_2901237", "lat": 11.0, "lon": 88.5},
    ]
    
    # Save floats index
    index_path = os.path.join(FLOATS_DIR, "floats_index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(floats_info, f, separators=(',', ':'))
    print(f"[+] Generated floats_index.json with {len(floats_info)} floats")
    
    # Generate profile for each float
    profile_depths = [0, 10, 20, 50, 100, 200, 500, 1000]
    for flt in floats_info:
        fid = flt["float_id"]
        profiles = []
        for t_idx, t in enumerate(TIMESTEPS):
            temp_profile = []
            sal_profile = []
            for d in profile_depths:
                # Realistic depth drop off
                t_val = round(28.5 - 20.0 * (1 - math.exp(-d / 250.0)) + (random.random() * 0.4 - 0.2), 2)
                s_val = round(34.2 + 1.2 * (1 - math.exp(-d / 150.0)) + (random.random() * 0.2 - 0.1), 2)
                temp_profile.append(t_val)
                sal_profile.append(s_val)
                
            profiles.append({
                "time": t,
                "depth": profile_depths,
                "temperature": temp_profile,
                "salinity": sal_profile
            })
            
        float_data = {
            "float_id": fid,
            "profiles": profiles
        }
        
        file_path = os.path.join(FLOATS_DIR, f"{fid}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(float_data, f, separators=(',', ':'))
            
    print(f"[+] Generated {len(floats_info)} float profile JSON files under {FLOATS_DIR}")

if __name__ == "__main__":
    print("Generating dummy ocean dataset matching Filesystem Contract...")
    build_slices()
    build_floats()
    print("Done!")
