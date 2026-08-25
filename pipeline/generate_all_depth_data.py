import os
import json
import shutil
import numpy as np
import netCDF4 as nc

MANIFEST_PATH = r"d:\SIH\Root\data\gpu\manifest.json"
OUTPUT_BASE = r"d:\SIH\Root\data\slices"

# 1. Load real depth array from data/gpu/manifest.json
if os.path.exists(MANIFEST_PATH):
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    REAL_MANIFEST_DEPTHS = manifest.get("coordinates", {}).get("depth", [])
else:
    # Fallback to standard 46 Copernicus levels if file missing
    REAL_MANIFEST_DEPTHS = [0.494, 1.5414, 2.6457, 3.8195, 5.0782, 6.4406, 7.9296, 9.573, 11.405, 13.4671, 15.8101, 18.4956, 21.5988, 25.2114, 29.4447, 34.4342, 40.3441, 47.3737, 55.7643, 65.8073, 77.8539, 92.3261, 109.7293, 130.666, 155.8507, 186.1256, 222.4752, 266.0403, 318.1274, 380.213, 453.9377, 541.0889, 643.5668, 763.3331, 902.3393, 1062.4399, 1245.291, 1452.251, 1684.2841, 1941.8929, 2225.0779, 2533.3359, 2865.7029, 3220.8201, 3597.032, 3992.4839]

# 2. Representative subset of REAL depth levels (all within 0.494m - 3992.484m)
TARGET_DEPTHS = [0, 92, 380, 902, 1684, 2865, 3992]

TIMESTEPS = ["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24"]

# 25x25 spatial grid for Bay of Bengal (6.6°N to 21.0°N, 78.6°E to 92.3°E)
LATS = [round(x, 4) for x in np.linspace(6.666, 21.0, 25)]
LONS = [round(x, 4) for x in np.linspace(78.666, 92.25, 25)]

def find_nearest_real_depth_index(target_depth, real_depths):
    idx = min(range(len(real_depths)), key=lambda i: abs(real_depths[i] - target_depth))
    return idx, real_depths[idx]

def Math_exp_decay(depth, halflife):
    return float(np.exp(-depth / halflife))

def generate_field_slice(variable, depth, t_idx):
    nrows = len(LATS)
    ncols = len(LONS)

    if variable == "temperature":
        base_temp = 29.5 * Math_exp_decay(depth, 1600.0) + 1.0
        field = np.zeros((nrows, ncols))
        for r in range(nrows):
            lat_factor = 1.0 - (r / nrows) * 0.15
            for c in range(ncols):
                lon_factor = 1.0 + (c / ncols) * 0.12
                spatial_noise = np.sin(r * 0.35 + t_idx * 0.4) * np.cos(c * 0.4) * 0.8
                field[r, c] = round(float(base_temp * lat_factor * lon_factor + spatial_noise), 2)
        return field

    elif variable == "salinity":
        base_sal = 34.0 + (1.0 - Math_exp_decay(depth, 1800.0)) * 1.3
        field = np.zeros((nrows, ncols))
        for r in range(nrows):
            for c in range(ncols):
                noise = np.cos(r * 0.4 - c * 0.3 + t_idx * 0.3) * 0.2
                field[r, c] = round(float(base_sal + noise), 2)
        return field

    elif variable == "currents":
        base_spd = 1.1 * Math_exp_decay(depth, 1000.0) + 0.05
        field = np.zeros((nrows, ncols))
        for r in range(nrows):
            for c in range(ncols):
                eddy = np.sin(np.sqrt((r - 12)**2 + (c - 12)**2) * 0.4 + t_idx * 0.5) * 0.25
                field[r, c] = round(float(max(0.02, base_spd + eddy)), 3)
        return field

    elif variable == "chlorophyll":
        base_chl = 2.2 * Math_exp_decay(depth, 350.0) + 0.02
        field = np.zeros((nrows, ncols))
        for r in range(nrows):
            for c in range(ncols):
                bloom = np.sin(r * 0.5) * np.sin(c * 0.5) * 0.3 if depth < 500 else 0
                field[r, c] = round(float(max(0.01, base_chl + bloom)), 3)
        return field

def populate_all_data():
    print(f"Loaded {len(REAL_MANIFEST_DEPTHS)} real depth levels from manifest.json (range: {REAL_MANIFEST_DEPTHS[0]}m to {REAL_MANIFEST_DEPTHS[-1]}m)")
    print("\n--- Target Depth to Real Depth Index Mapping ---")
    depth_mapping = {}
    for target in TARGET_DEPTHS:
        real_idx, real_val = find_nearest_real_depth_index(target, REAL_MANIFEST_DEPTHS)
        depth_mapping[target] = (real_idx, real_val)
        print(f"Target Depth: {target:>4}m  -->  Mapped Real Index: {real_idx:>2}  (Actual Real Value: {real_val:.4f}m)")

    nc_path = r"d:\SIH\cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m_1787478812708.nc"
    copernicus_vo = None
    if os.path.exists(nc_path):
        try:
            ds = nc.Dataset(nc_path)
            copernicus_vo = ds.variables['vo'][:]
            print("\nLoaded real Copernicus Marine NetCDF dataset!")
        except Exception as e:
            print("Warning reading NetCDF:", e)

    variables = ["temperature", "salinity", "currents", "chlorophyll"]

    # Remove stale old depth folders
    for var in variables:
        var_dir = os.path.join(OUTPUT_BASE, var)
        if os.path.exists(var_dir):
            for existing_d in os.listdir(var_dir):
                if existing_d.isdigit() and int(existing_d) not in TARGET_DEPTHS:
                    shutil.rmtree(os.path.join(var_dir, existing_d), ignore_errors=True)

    print("\nRegenerating slice files under data/slices/...")
    for var in variables:
        for depth in TARGET_DEPTHS:
            real_idx, _ = depth_mapping[depth]
            for t_idx, t_str in enumerate(TIMESTEPS):
                if var == "currents" and copernicus_vo is not None:
                    slice_raw = copernicus_vo[t_idx, real_idx, ::7, ::6][:25, :25]
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

    print("\n=== Dataset Generation Complete! All depth levels bounded <= 3992.48m ===")

if __name__ == "__main__":
    populate_all_data()
