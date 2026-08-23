"""
Downsample & slice NetCDF data into JSON files (Prompt P2 implementation)
Exports data matching the filesystem contract: data/slices/{variable}/{depth}/{time}.json
"""
import os
import sys
import json
import numpy as np

try:
    import xarray as xr
except ImportError:
    print("[!] xarray not installed. Run `pip install -r pipeline/requirements.txt`.")
    sys.exit(1)

# Bounding box & target parameters
LAT_BOUNDS = (10.0, 20.0)
LON_BOUNDS = (80.0, 90.0)

def process_netcdf_to_slices(nc_path: str, output_data_dir: str):
    if not os.path.exists(nc_path):
        print(f"[!] Input NetCDF file missing: {nc_path}")
        return

    slices_dir = os.path.join(output_data_dir, "slices")
    os.makedirs(slices_dir, exist_ok=True)

    print(f"Opening dataset: {nc_path}")
    ds = xr.open_dataset(nc_path)

    # Standardize dimension names
    lat_name = next((d for d in ['lat', 'latitude', 'nav_lat'] if d in ds.coords or d in ds.dims), None)
    lon_name = next((d for d in ['lon', 'longitude', 'nav_lon'] if d in ds.coords or d in ds.dims), None)
    depth_name = next((d for d in ['depth', 'deptht', 'lev', 'z'] if d in ds.coords or d in ds.dims), None)
    time_name = next((d for d in ['time', 'rec', 't'] if d in ds.coords or d in ds.dims), None)

    if not (lat_name and lon_name):
        print(f"[!] Could not locate spatial coordinates (lat/lon) in dataset.")
        return

    # Slice spatial extent
    sub = ds.sel({lat_name: slice(*LAT_BOUNDS), lon_name: slice(*LON_BOUNDS)})

    lats = [round(float(v), 2) for v in sub[lat_name].values]
    lons = [round(float(v), 2) for v in sub[lon_name].values]

    processed_count = 0
    stats = {}

    for varname, da in sub.data_vars.items():
        stats[varname] = {"min": float('inf'), "max": float('-inf')}
        
        # Determine depth and time levels
        depth_vals = [0] if not depth_name or depth_name not in da.dims else [int(d) for d in da[depth_name].values[:5]]
        time_vals = [0] if not time_name or time_name not in da.dims else [str(t)[:10] for t in da[time_name].values[:5]]

        for d_idx, d_val in enumerate(depth_vals):
            for t_idx, t_val in enumerate(time_vals):
                slice_sel = {}
                if depth_name and depth_name in da.dims:
                    slice_sel[depth_name] = da[depth_name].values[d_idx]
                if time_name and time_name in da.dims:
                    slice_sel[time_name] = da[time_name].values[t_idx]

                grid_data = da.sel(**slice_sel).values
                # Replace NaNs with None for standard JSON serialization
                cleaned_grid = []
                for row in grid_data:
                    cleaned_row = []
                    for val in row:
                        if np.isnan(val) or np.isinf(val):
                            cleaned_row.append(None)
                        else:
                            fval = round(float(val), 2)
                            cleaned_row.append(fval)
                            stats[varname]["min"] = min(stats[varname]["min"], fval)
                            stats[varname]["max"] = max(stats[varname]["max"], fval)
                    cleaned_grid.append(cleaned_row)

                target_dir = os.path.join(slices_dir, varname, str(d_val))
                os.makedirs(target_dir, exist_ok=True)

                out_payload = {
                    "variable": varname,
                    "depth": d_val,
                    "time": t_val,
                    "lat": lats,
                    "lon": lons,
                    "values": cleaned_grid
                }

                out_path = os.path.join(target_dir, f"{t_val}.json")
                with open(out_path, "w", encoding="utf-8") as f:
                    json.dump(out_payload, f, separators=(',', ':'))

                processed_count += 1

    print(f"\n[+] Processing complete. Saved {processed_count} slice files to {slices_dir}")
    print("\n=== Variable Summary Statistics ===")
    for var, stat in stats.items():
        print(f"  - {var}: min={stat['min']}, max={stat['max']}")

if __name__ == "__main__":
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    data_dir = os.path.join(root_dir, "data")
    if len(sys.argv) > 1:
        process_netcdf_to_slices(sys.argv[1], data_dir)
    else:
        print("Usage: python build_slices.py <path_to_netcdf_file.nc>")
