import sys
import os
import json
from fastapi.testclient import TestClient

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from main import app

client = TestClient(app)

def test_endpoints():
    print("--- TESTING BACKEND ENDPOINTS ---")
    
    # 1. Test Root
    res = client.get("/")
    assert res.status_code == 200
    print("[OK] GET / -> 200 OK")
    
    # 2. Test /variables
    res = client.get("/variables")
    assert res.status_code == 200
    vars_list = res.json()
    print(f"[OK] GET /variables -> {vars_list}")
    assert "temperature" in vars_list
    assert "salinity" in vars_list
    
    # 3. Test /timesteps
    res = client.get("/timesteps")
    assert res.status_code == 200
    t_list = res.json()
    print(f"[OK] GET /timesteps -> {t_list}")
    assert "2024-06-01" in t_list
    
    # 4. Test /field
    res = client.get("/field?variable=temperature&depth=0&time=2024-06-01")
    assert res.status_code == 200
    field_data = res.json()
    print(f"[OK] GET /field?variable=temperature&depth=0&time=2024-06-01 -> variable={field_data.get('variable')}, grid shape={len(field_data.get('values'))}x{len(field_data.get('values')[0])}")
    assert field_data.get("variable") == "temperature"
    assert field_data.get("depth") == 0
    
    # Test /field 404
    res_404 = client.get("/field?variable=nonexistent&depth=9999&time=2024-06-01")
    assert res_404.status_code == 404
    print(f"[OK] GET /field (invalid) -> 404 correctly handled")
    
    # 5. Test /floats
    res = client.get("/floats")
    assert res.status_code == 200
    floats_list = res.json()
    print(f"[OK] GET /floats -> found {len(floats_list)} floats")
    assert len(floats_list) > 0
    first_float_id = floats_list[0]["float_id"]
    
    # 6. Test /floats/{id}/profile
    res = client.get(f"/floats/{first_float_id}/profile")
    assert res.status_code == 200
    profile_data = res.json()
    print(f"[OK] GET /floats/{first_float_id}/profile -> float_id={profile_data.get('float_id')}, profiles={len(profile_data.get('profiles'))}")
    assert profile_data.get("float_id") == first_float_id
    
    print("\nALL BACKEND API CONTRACT TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    test_endpoints()
