"""
Copernicus Marine NetCDF Preprocessing Pipeline
Reads real Copernicus Marine NetCDF dataset files for:
- Temperature (thetao) -> saved as variable 'temperature'
- Salinity (so) -> saved as variable 'salinity'
- Currents (uo, vo) -> calculated magnitude sqrt(uo^2 + vo^2) saved as variable 'currents'

Outputs JSON grid files matching the Filesystem Contract to data/slices/{variable}/{depth}/{time}.json
"""
import os
import sys
import json
import numpy as np

def run_copernicus_pipeline(raw_dir: str, output_data_dir: str):
    try:
        import xarray as xr
    except ImportError:
        print("[!] xarray is not available yet. Make sure dependencies are installed.")
        return

    slices_dir = os.path.join(output_data_dir, "slices")
    os.makedirs(slices_dir, exist_ok=True)

    print(f"Scanning directory for Copernicus NetCDF files: {raw_dir}")
    nc_files = []
    for root, _, files in os.walk(raw_dir):
        for f in files:
            if f.endswith(".nc"):
                nc_files.append(os.path.join(root, f))

    if not nc_files:
        print(f"[!] No .nc files found in {raw_dir}")
        return

    print(f"Found {len(nc_files)} NetCDF file(s). Processing...")

    stats = {}

    for filepath in nc_files:
        print(f"\n--- Processing: {os.path.basename(filepath)} ---")
        ds = xr.open_dataset(filepath)

        # Spatial / Temporal / Vertical Dimensions
        lat_coord = ds.latitude if 'latitude' in ds.coords else ds.lat
        lon_coord = ds.longitude if 'longitude' in ds.coords else ds.lon
        depth_coord = ds.depth if 'depth' in ds.coords else (ds.lev if 'lev' in ds.coords else None)
        time_coord = ds.time if 'time' in ds.coords else None

        # Downsample spatial resolution to ~0.5 degree steps for small JSON files
        lat_vals = [round(float(v), 2) for v in lat_coord.values[::6]]  # downsample ~6x
        lon_vals = [round(float(v), 2) for v in lon_coord.values[::6]]  # downsample ~6x

        # Select representative depths (surface, 10m, 50m, 100m, 500m or nearest available)
        if depth_coord is not None:
            available_depths = [float(d) for d in depth_coord.values]
            target_depth_indices = [0, 2, 5, 10, 15] # pick up to 5 levels
            target_depth_indices = [idx for idx in target_depth_indices if idx < len(available_depths)]
        else:
            available_depths = [0.0]
            target_depth_indices = [0]

        # Select timesteps
        if time_coord is not None:
            available_times = [str(t)[:10] for t in time_coord.values]
        else:
            available_times = ["2024-06-01"]

        # Handle Variable Mapping
        vars_to_process = {}
        if 'thetao' in ds.data_vars:
            vars_to_process['temperature'] = ds['thetao']
        if 'so' in ds.data_vars:
            vars_to_process['salinity'] = ds['so']
        if 'uo' in ds.data_vars and 'vo' in ds.data_vars:
            # Calculate current speed vector magnitude
            current_speed = np.sqrt(ds['uo']**2 + ds['vo']**2)
            current_speed.attrs = {'long_name': 'Sea water velocity speed', 'units': 'm s-1'}
            vars_to_process['currents'] = current_speed
        elif 'uo' in ds.data_vars:
            vars_to_process['currents'] = np.abs(ds['uo'])

        for var_name, da in vars_to_process.items():
            stats[var_name] = {"count": 0, "min": float('inf'), "max": float('-inf')}

            for d_idx in target_depth_indices:
                d_val = int(round(available_depths[d_idx]))

                for t_idx, t_val in enumerate(available_times):
                    # Index selection
                    sel_dict = {}
                    if depth_coord is not None and depth_coord.name in da.dims:
                        sel_dict[depth_coord.name] = available_depths[d_idx]
                    if time_coord is not None and time_coord.name in da.dims:
                        sel_dict[time_coord.name] = time_coord.values[t_idx]

                    # Extract slice and downsample grid
                    sub_da = da.sel(**sel_dict)
                    # Slicing downsampled lat/lon indices
                    raw_grid = sub_da.values[::6, ::6]

                    cleaned_grid = []
                    for row in raw_grid:
                        cleaned_row = []
                        for val in row:
                            if np.isnan(val) or np.isinf(val):
                                cleaned_row.append(None)
                            else:
                                fval = round(float(val), 2)
                                cleaned_row.append(fval)
                                stats[var_name]["min"] = min(stats[var_name]["min"], fval)
                                stats[var_name]["max"] = max(stats[var_name]["max"], fval)
                        cleaned_grid.append(cleaned_row)

                    target_dir = os.path.join(slices_dir, var_name, str(d_val))
                    os.makedirs(target_dir, exist_ok=True)

                    slice_json = {
                        "variable": var_name,
                        "depth": d_val,
                        "time": t_val,
                        "lat": lat_vals,
                        "lon": lon_vals,
                        "values": cleaned_grid
                    }

                    file_path = os.path.join(target_dir, f"{t_val}.json")
                    with open(file_path, "w", encoding="utf-8") as out:
                        json.dump(slice_json, out, separators=(',', ':'))

                    stats[var_name]["count"] += 1

    print("\n================ PIPELINE SUMMARY ================")
    for var, info in stats.items():
        print(f"Variable: {var:12s} | Files: {info['count']} | Range: [{info['min']} to {info['max']}]")
    print("==================================================")
    print(f"[+] Real Copernicus data successfully sliced and saved to {slices_dir}")

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.abspath(os.path.join(script_dir, "..", ".."))
    raw_path = os.path.join(root_dir, "pipeline", "raw")
    data_path = os.path.join(root_dir, "data")
    run_copernicus_pipeline(raw_path, data_path)
