import os
import glob
import json
import numpy as np
import netCDF4 as nc

RAW_DIR = os.path.join(os.path.dirname(__file__), "raw")
GPU_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "gpu")
os.makedirs(GPU_DIR, exist_ok=True)

def process_multivar_dataset():
    thetao_files = glob.glob(os.path.join(RAW_DIR, "*thetao*.nc"))
    so_files = glob.glob(os.path.join(RAW_DIR, "*so*.nc"))

    if not thetao_files or not so_files:
        print("[ERROR] Missing thetao or so NetCDF files in pipeline/raw/")
        return

    thetao_path = thetao_files[0]
    so_path = so_files[0]

    print(f"[Processing] Loading Temperature from {os.path.basename(thetao_path)}...")
    ds_temp = nc.Dataset(thetao_path)
    thetao_var = ds_temp.variables['thetao'][:]
    thetao_arr = np.array(thetao_var, dtype=np.float32)
    # Fill masked NaN values with -999.0 or 0.0
    thetao_clean = np.where(np.ma.getmaskarray(thetao_var) | np.isnan(thetao_arr), -999.0, thetao_arr).astype(np.float32)
    
    thetao_bin_path = os.path.join(GPU_DIR, "thetao.bin")
    thetao_clean.tofile(thetao_bin_path)
    print(f"[Exported] {thetao_bin_path} ({os.path.getsize(thetao_bin_path) / (1024*1024):.2f} MB)")

    print(f"[Processing] Loading Salinity from {os.path.basename(so_path)}...")
    ds_sal = nc.Dataset(so_path)
    so_var = ds_sal.variables['so'][:]
    so_arr = np.array(so_var, dtype=np.float32)
    so_clean = np.where(np.ma.getmaskarray(so_var) | np.isnan(so_arr), -999.0, so_arr).astype(np.float32)

    so_bin_path = os.path.join(GPU_DIR, "so.bin")
    so_clean.tofile(so_bin_path)
    print(f"[Exported] {so_bin_path} ({os.path.getsize(so_bin_path) / (1024*1024):.2f} MB)")

    # Update manifest.json
    manifest_path = os.path.join(GPU_DIR, "manifest.json")
    if os.path.exists(manifest_path):
        with open(manifest_path, "r") as f:
            manifest = json.load(f)
    else:
        manifest = {}

    if "additional_variables" not in manifest:
        manifest["additional_variables"] = {}

    temp_valid = thetao_clean[thetao_clean > -900]
    sal_valid = so_clean[so_clean > -900]

    manifest["additional_variables"]["temperature"] = {
        "nc_name": "thetao",
        "file": "thetao.bin",
        "units": "°C",
        "min": float(np.min(temp_valid)),
        "max": float(np.max(temp_valid)),
        "mean": float(np.mean(temp_valid))
    }
    manifest["additional_variables"]["salinity"] = {
        "nc_name": "so",
        "file": "so.bin",
        "units": "PSU",
        "min": float(np.min(sal_valid)),
        "max": float(np.max(sal_valid)),
        "mean": float(np.mean(sal_valid))
    }

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    
    print(f"[Manifest Updated Successfully] {manifest_path}")

if __name__ == "__main__":
    process_multivar_dataset()
