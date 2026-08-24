import os
import json
import numpy as np
import netCDF4 as nc
from datetime import datetime, timedelta

TARGET_DEPTHS = [0, 1000, 2000, 3000, 4000, 5000, 5500]
TIMESTEPS = ["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24"]
OUTPUT_BASE = r"d:\SIH\Root\data\slices"

# 25x25 spatial grid for Bay of Bengal (6.6°N to 21.0°N, 78.6°E to 92.3°E)
LATS = [round(x, 4) for x in np.linspace(6.666, 21.0, 25)]
LONS = [round(x, 4) for x in np.linspace(78.666, 92.25, 25)]

def generate_field_slice(variable, depth, t_idx):
    nrows = len(LATS)
    ncols = len(LONS)

    # Physical oceanographic vertical decay parameters
    if variable == "temperature":
        # Surface ~29.5°C, decaying down to ~1.0°C at 5500m (Matching Reference Image)
        base_temp = 29.5 * Math_exp_decay(depth, 1800.0) + 1.0
        # Spatial pattern: warmer in South-East Bay of Bengal, cooler near North coast
        field = np.zeros((nrows, ncols))
        for r in range(nrows):
            lat_factor = 1.0 - (r / nrows) * 0.15
            for c in range(ncols):
                lon_factor = 1.0 + (c / ncols) * 0.12
                spatial_noise = np.sin(r * 0.35 + t_idx * 0.4) * np.cos(c * 0.4) * 0.8
                field[r, c] = round(float(base_temp * lat_factor * lon_factor + spatial_noise), 2)
        return field

    elif variable == "salinity":
        base_sal = 34.0 + (1.0 - Math_exp_decay(depth, 2000.0)) * 1.3
        field = np.zeros((nrows, ncols))
        for r in range(nrows):
            for c in range(ncols):
                noise = np.cos(r * 0.4 - c * 0.3 + t_idx * 0.3) * 0.2
                field[r, c] = round(float(base_sal + noise), 2)
        return field

    elif variable == "currents":
        base_spd = 1.1 * Math_exp_decay(depth, 1200.0) + 0.05
        field = np.zeros((nrows, ncols))
        for r in range(nrows):
            for c in range(ncols):
                eddy = np.sin(np.sqrt((r - 12)**2 + (c - 12)**2) * 0.4 + t_idx * 0.5) * 0.25
                field[r, c] = round(float(max(0.02, base_spd + eddy)), 3)
        return field

    elif variable == "chlorophyll":
        base_chl = 2.2 * Math_exp_decay(depth, 400.0) + 0.02
        field = np.zeros((nrows, ncols))
        for r in range(nrows):
            for c in range(ncols):
                bloom = np.sin(r * 0.5) * np.sin(c * 0.5) * 0.3 if depth < 500 else 0
                field[r, c] = round(float(max(0.01, base_chl + bloom)), 3)
        return field

def Math_exp_decay(depth, halflife):
    return float(np.exp(-depth / halflife))

def populate_all_data():
    print(f"Generating uniform ocean dataset for all 4 variables at depths: {TARGET_DEPTHS}")

    # Read real Copernicus vo data if available
    nc_path = r"d:\SIH\cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m_1787478812708.nc"
    copernicus_vo = None
    if os.path.exists(nc_path):
        try:
            ds = nc.Dataset(nc_path)
            copernicus_vo = ds.variables['vo'][:]
            print("Loaded real Copernicus Marine NetCDF dataset!")
        except Exception as e:
            print("Warning reading NetCDF:", e)

    variables = ["temperature", "salinity", "currents", "chlorophyll"]

    for var in variables:
        for depth in TARGET_DEPTHS:
            for t_idx, t_str in enumerate(TIMESTEPS):
                if var == "currents" and copernicus_vo is not None:
                    # Map 0, 1000, 2000, 3000, 4000, 5000, 5500 to Copernicus depth indices
                    raw_depth_idx = min(45, int((depth / 5500.0) * 45))
                    slice_raw = copernicus_vo[t_idx, raw_depth_idx, ::7, ::6][:25, :25]
                    values = []
                    for r in range(slice_raw.shape[0]):
                        row_vals = []
                        for c in range(slice_raw.shape[1]):
                            v = slice_raw[r, c]
                            if np.ma.is_masked(v) or np.isnan(v):
                                row_vals.append(None)
                            else:
                                row_vals.append(round(float(abs(v)), 4))
                        values.append(row_vals)
                else:
                    field_mat = generate_field_slice(var, depth, t_idx)
                    values = field_mat.tolist()

                slice_json = {
                    "variable": var,
                    "depth": depth,
                    "time": t_str,
                    "lat": LATS,
                    "lon": LONS,
                    "values": values
                }

                out_dir = os.path.join(OUTPUT_BASE, var, str(depth))
                os.makedirs(out_dir, exist_ok=True)
                out_file = os.path.join(out_dir, f"{t_str}.json")
                with open(out_file, "w", encoding="utf-8") as f:
                    json.dump(slice_json, f)

    print("=== Uniform Ocean Dataset Generation Complete! ===")

if __name__ == "__main__":
    populate_all_data()
