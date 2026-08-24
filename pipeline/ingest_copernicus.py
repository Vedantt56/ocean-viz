import os
import json
import numpy as np
import netCDF4 as nc
from datetime import datetime, timedelta

def process_copernicus_netcdf():
    nc_path = r"d:\SIH\cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m_1787478812708.nc"
    if not os.path.exists(nc_path):
        print(f"File not found: {nc_path}")
        return

    print(f"Ingesting real Copernicus Marine Data from: {nc_path}")
    ds = nc.Dataset(nc_path)

    lats = [round(float(x), 4) for x in ds.variables['latitude'][:]]
    lons = [round(float(x), 4) for x in ds.variables['longitude'][:]]
    raw_depths = [round(float(x), 1) for x in ds.variables['depth'][:]]
    
    # Clean oceanographic depth levels with distinct vertical separation (Surface, 200m, 500m, 1000m, 2000m, 4000m)
    # Indices in raw Copernicus NetCDF (46 total):
    # 0 -> 0.5m, 26 -> 222.5m (200m), 31 -> 541.1m (500m), 35 -> 1062.4m (1000m), 40 -> 2225.1m (2000m), 45 -> 3992.5m (4000m)
    selected_depth_indices = [0, 26, 31, 35, 40, 45]
    selected_depths = [int(round(raw_depths[idx])) for idx in selected_depth_indices]
    
    # Normalize depth labels to clean round numbers: [0, 200, 500, 1000, 2000, 4000]
    clean_depth_labels = [0, 200, 500, 1000, 2000, 4000]
    
    # 5 Timesteps starting from 2026-08-20
    base_date = datetime(2026, 8, 20)
    time_labels = [(base_date + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(5)]

    output_base = r"d:\SIH\Root\data\slices"

    vo_data = ds.variables['vo'][:] # shape: (5, 46, 173, 164)

    # Subsample spatial grid to ~25x25 for smooth 3D scene rendering performance
    lat_step = max(1, len(lats) // 25)
    lon_step = max(1, len(lons) // 25)
    sub_lats = lats[::lat_step]
    sub_lons = lons[::lon_step]

    print(f"Subsampled Grid: {len(sub_lats)} lats x {len(sub_lons)} lons")
    print(f"Target Depths ({len(selected_depths)}): {selected_depths}")
    print(f"Timesteps ({len(time_labels)}): {time_labels}")

    # Write real Copernicus data for currents
    for t_idx, t_str in enumerate(time_labels):
        for idx_in_sel, d_idx in enumerate(selected_depth_indices):
            depth_val = clean_depth_labels[idx_in_sel]
            
            # Extract 2D slice
            slice_raw = vo_data[t_idx, d_idx, ::lat_step, ::lon_step]
            slice_clean = []

            for r in range(slice_raw.shape[0]):
                row_vals = []
                for c in range(slice_raw.shape[1]):
                    val = slice_raw[r, c]
                    if np.ma.is_masked(val) or np.isnan(val):
                        row_vals.append(None)
                    else:
                        row_vals.append(round(float(val), 4))
                slice_clean.append(row_vals)

            slice_json = {
                "variable": "currents",
                "depth": depth_val,
                "time": t_str,
                "lat": sub_lats,
                "lon": sub_lons,
                "values": slice_clean
            }

            out_dir = os.path.join(output_base, "currents", str(depth_val))
            os.makedirs(out_dir, exist_ok=True)
            out_file = os.path.join(out_dir, f"{t_str}.json")
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(slice_json, f)

    print("Real Copernicus Marine current velocity data successfully ingested!")

if __name__ == "__main__":
    process_copernicus_netcdf()
