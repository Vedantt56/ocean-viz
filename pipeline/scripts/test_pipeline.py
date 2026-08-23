"""
Full end-to-end pipeline test script.
Verifies all contracts: pipeline scripts, data slices, floats, and backend API.
"""
import os
import sys
import json

root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

def check(label, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    icon = "[OK]" if passed else "[!!]"
    print(f"  {icon} {label}: {status} {detail}")
    return passed

all_passed = True

print("=" * 65)
print("FULL END-TO-END PIPELINE TEST — SIH PS 26067 Ocean Viz")
print("=" * 65)

# -------------------------------------------------------
# 1. PIPELINE SCRIPTS
# -------------------------------------------------------
print("\n[1] Pipeline Scripts Present:")
scripts = [
    "pipeline/scripts/explore_netcdf.py",
    "pipeline/scripts/build_slices.py",
    "pipeline/scripts/parse_argo.py",
    "pipeline/scripts/process_copernicus.py",
    "pipeline/requirements.txt",
]
for s in scripts:
    path = os.path.join(root, s)
    exists = os.path.exists(path)
    size = f"{os.path.getsize(path)} bytes" if exists else "MISSING"
    all_passed &= check(s, exists, f"({size})")

# -------------------------------------------------------
# 2. DATA SLICES CONTRACT
# -------------------------------------------------------
print("\n[2] Data Slices — Filesystem Contract:")
slices_root = os.path.join(root, "data", "slices")
total_files = 0
expected_vars = ["temperature", "salinity", "currents"]

if os.path.exists(slices_root):
    found_vars = [v for v in os.listdir(slices_root) if os.path.isdir(os.path.join(slices_root, v))]
    for var in found_vars:
        count = 0
        var_path = os.path.join(slices_root, var)
        for depth in os.listdir(var_path):
            depth_path = os.path.join(var_path, depth)
            if os.path.isdir(depth_path):
                files = [f for f in os.listdir(depth_path) if f.endswith(".json")]
                count += len(files)
                total_files += len(files)
        all_passed &= check(f"Variable '{var}'", count > 0, f"({count} slice files)")
else:
    all_passed = False
    check("data/slices/ directory", False, "MISSING")

print(f"  => Total slice files across all variables: {total_files}")

# -------------------------------------------------------
# 3. VALIDATE REAL COPERNICUS SLICE SHAPE
# -------------------------------------------------------
print("\n[3] Validate Real Copernicus Slice JSON Shape:")
test_file = os.path.join(slices_root, "temperature", "0", "2026-08-20.json")
if os.path.exists(test_file):
    with open(test_file) as f:
        data = json.load(f)
    required_keys = ["variable", "depth", "time", "lat", "lon", "values"]
    has_keys = all(k in data for k in required_keys)
    grid = data.get("values", [])
    valid_grid = len(grid) > 0 and len(grid[0]) > 0
    all_passed &= check("Required JSON keys present", has_keys, str(list(data.keys())))
    all_passed &= check("Values grid non-empty", valid_grid,
                        f"({len(data.get('lat',[]))} lat x {len(data.get('lon',[]))} lon | {len(grid)} rows x {len(grid[0]) if grid else 0} cols)")
    all_passed &= check("Depth value correct", data.get("depth") == 0, f"depth={data.get('depth')}")
    all_passed &= check("Time value correct", data.get("time") == "2026-08-20", f"time={data.get('time')}")
    sample_val = grid[0][0] if grid and grid[0] else None
    all_passed &= check("Sample value is float (not None)", isinstance(sample_val, float),
                        f"sample_val={sample_val}")
else:
    all_passed = False
    check("Real Copernicus temperature slice", False, "FILE MISSING (2026-08-20)")

# -------------------------------------------------------
# 4. FLOATS CONTRACT
# -------------------------------------------------------
print("\n[4] Floats — Filesystem Contract:")
floats_dir = os.path.join(root, "data", "floats")
index_path = os.path.join(floats_dir, "floats_index.json")
if os.path.exists(index_path):
    with open(index_path) as f:
        floats = json.load(f)
    all_passed &= check("floats_index.json exists", True, f"({len(floats)} floats)")
    all_passed &= check("Index has float_id/lat/lon keys",
                        all("float_id" in fl and "lat" in fl and "lon" in fl for fl in floats))
    float_files = [fp for fp in os.listdir(floats_dir)
                   if fp.endswith(".json") and fp != "floats_index.json"]
    all_passed &= check("Individual float profile files", len(float_files) > 0,
                        f"({len(float_files)} files)")
    if float_files:
        with open(os.path.join(floats_dir, float_files[0])) as f:
            fp = json.load(f)
        profile_keys = list(fp.get("profiles", [{}])[0].keys()) if fp.get("profiles") else []
        all_passed &= check("Profile has depth/temperature/salinity keys",
                            all(k in profile_keys for k in ["depth", "temperature", "salinity"]),
                            f"keys={profile_keys}")
else:
    all_passed = False
    check("floats_index.json", False, "MISSING")

# -------------------------------------------------------
# 5. BACKEND HTTP CONTRACT (via TestClient)
# -------------------------------------------------------
print("\n[5] Backend FastAPI HTTP Contract:")
try:
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        sys.path.insert(0, os.path.join(root, "backend"))
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)

    endpoints = [
        ("/", None, 200),
        ("/variables", None, 200),
        ("/timesteps", None, 200),
        ("/field?variable=temperature&depth=0&time=2026-08-20", None, 200),
        ("/field?variable=salinity&depth=0&time=2026-08-20", None, 200),
        ("/field?variable=currents&depth=0&time=2026-08-20", None, 200),
        ("/field?variable=ghost&depth=0&time=2026-08-20", None, 404),
        ("/floats", None, 200),
        ("/floats/ARGO_2901234/profile", None, 200),
        ("/floats/NONEXISTENT_9999/profile", None, 404),
    ]

    for path, _, expected_code in endpoints:
        res = client.get(path)
        all_passed &= check(f"GET {path}", res.status_code == expected_code,
                            f"status={res.status_code}")

    # Extra: verify real Copernicus field shape coming through HTTP
    res = client.get("/field?variable=temperature&depth=0&time=2026-08-20")
    d = res.json()
    grid = d.get("values", [])
    all_passed &= check("HTTP /field grid shape non-empty via real data",
                        len(grid) > 0, f"({len(grid)} x {len(grid[0]) if grid else 0})")

except Exception as e:
    all_passed = False
    check("FastAPI backend import/TestClient", False, str(e))

# -------------------------------------------------------
# FINAL RESULT
# -------------------------------------------------------
print("\n" + "=" * 65)
if all_passed:
    print("RESULT: ALL CHECKS PASSED — Pipeline is fully operational!")
else:
    print("RESULT: SOME CHECKS FAILED — Review [!!] items above.")
print("=" * 65)
