"""
Explore NetCDF ocean model dataset (Prompt P1 implementation)
Inspects variables, lat/lon bounds, depth levels, and timesteps.
"""
import sys
import os

try:
    import xarray as xr
    import matplotlib.pyplot as plt
except ImportError:
    print("[!] xarray or matplotlib not installed. Run `pip install -r pipeline/requirements.txt`.")
    sys.exit(1)

def explore_dataset(filepath: str):
    if not os.path.exists(filepath):
        print(f"[!] File not found: {filepath}")
        return

    print(f"Opening NetCDF file: {filepath}")
    ds = xr.open_dataset(filepath)
    print("\n=== DATASET SUMMARY ===")
    print(ds)
    print("\n=== DATA VARIABLES ===")
    for varname, da in ds.data_vars.items():
        print(f"  - {varname}: dims={da.dims}, shape={da.shape}, dtype={da.dtype}")

    print("\n=== COORDINATES ===")
    for coordname in ds.coords:
        c = ds.coords[coordname]
        print(f"  - {coordname}: min={c.values.min()}, max={c.values.max()}, len={len(c)}")

    # Try plotting surface of first variable
    first_var = list(ds.data_vars.keys())[0]
    da = ds[first_var]
    # Slicing surface level and first timestep if dimensions exist
    slice_kwargs = {}
    for dim in da.dims:
        if dim in ['time', 'rec', 't']:
            slice_kwargs[dim] = 0
        elif dim in ['depth', 'deptht', 'lev', 'z']:
            slice_kwargs[dim] = 0

    sliced = da.isel(**slice_kwargs)
    print(f"\nPlotting surface slice for variable: {first_var}")
    plt.figure(figsize=(10, 6))
    sliced.plot()
    plt.title(f"Surface Slice - {first_var}")
    output_png = os.path.splitext(filepath)[0] + "_preview.png"
    plt.savefig(output_png)
    print(f"[+] Saved preview plot to {output_png}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        explore_dataset(sys.argv[1])
    else:
        print("Usage: python explore_netcdf.py <path_to_netcdf_file.nc>")
