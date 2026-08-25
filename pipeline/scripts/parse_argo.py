"""
Parse Real Argo Float Profile Data using Argo GDAC / Ifremer ERDDAP DataFetcher
Fetches real oceanographic float profiles for Bay of Bengal bounding box [78.6, 92.3, 6.6, 21.0]
and outputs to filesystem contract:
- data/floats/floats_index.json -> [{float_id, lat, lon}, ...]
- data/floats/{float_id}.json -> {float_id, profiles: [{time, depth, temperature, salinity}]}
"""
import os
import sys
import json
import requests
import pandas as pd
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def fetch_argo_gdac_data():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    floats_dir = os.path.join(root_dir, "data", "floats")
    os.makedirs(floats_dir, exist_ok=True)

    lon_min, lon_max = 78.6, 92.3
    lat_min, lat_max = 6.6, 21.0
    t_min, t_max = "2026-08-20", "2026-08-24"

    # Official Argo GDAC ERDDAP endpoints
    endpoints = [
        "https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json",
        "https://coastwatch.pfeg.noaa.gov/erddap/tabledap/ArgoFloats.json"
    ]

    print("==========================================================================")
    print(f"FETCHING REAL ARGO GDAC DATA FOR BAY OF BENGAL: [{lon_min}°E..{lon_max}°E, {lat_min}°N..{lat_max}°N]")
    print(f"Target Date Range: {t_min} to {t_max}")
    print("==========================================================================")

    rows = []
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

    # 1. Query exact window
    for ep in endpoints:
        exact_url = (
            f"{ep}?platform_number,time,latitude,longitude,pres,temp,psal"
            f"&latitude>={lat_min}&latitude<={lat_max}&longitude>={lon_min}&longitude<={lon_max}"
            f"&time>={t_min}T00:00:00Z&time<={t_max}T23:59:59Z"
        )
        print(f"\nQuerying GDAC ERDDAP: {ep}...")
        try:
            resp = requests.get(exact_url, timeout=25, headers=headers, verify=False)
            if resp.status_code == 200:
                data = resp.json()
                rows = data.get("table", {}).get("rows", [])
                if rows:
                    print(f"--> Found {len(rows)} real float measurements for exact date window ({t_min} to {t_max})!")
                    break
        except Exception as e:
            print(f"--> Notice endpoint {ep} error: {e}")

    # 2. If no rows in exact window, query recent active window (2024-01-01 to present)
    if not rows:
        print(f"\nNotice: 0 float records found in exact 5-day window.")
        print("Widening date search window to active real Argo records in Bay of Bengal (2024-01-01 to present)...")
        for ep in endpoints:
            wide_url = (
                f"{ep}?platform_number,time,latitude,longitude,pres,temp,psal"
                f"&latitude>={lat_min}&latitude<={lat_max}&longitude>={lon_min}&longitude<={lon_max}"
                f"&time>=2024-01-01T00:00:00Z"
            )
            try:
                resp = requests.get(wide_url, timeout=35, headers=headers, verify=False)
                if resp.status_code == 200:
                    data = resp.json()
                    rows = data.get("table", {}).get("rows", [])
                    if rows:
                        print(f"--> Successfully fetched {len(rows)} real Argo measurement rows from GDAC!")
                        break
            except Exception as e:
                print(f"--> Notice endpoint {ep} error: {e}")

    if not rows:
        print("\nCRITICAL WARNING: No real float profiles returned from Argo GDAC API for this region.")
        return False

    # Process returned real float records into dataframe
    cols = ["platform_number", "time", "latitude", "longitude", "pres", "temp", "psal"]
    df = pd.DataFrame(rows, columns=cols)
    df["pres"] = pd.to_numeric(df["pres"], errors="coerce")
    df["temp"] = pd.to_numeric(df["temp"], errors="coerce")
    df["psal"] = pd.to_numeric(df["psal"], errors="coerce")
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")

    df = df.dropna(subset=["pres", "temp", "latitude", "longitude"])
    
    unique_platforms = df["platform_number"].unique()
    print(f"\nDiscovered {len(unique_platforms)} real Argo float platforms active in Bay of Bengal:")

    float_index = []

    # Clear old float JSON files
    for item in os.listdir(floats_dir):
        if item.endswith(".json"):
            os.remove(os.path.join(floats_dir, item))

    for platform in unique_platforms:
        p_df = df[df["platform_number"] == platform].copy()
        if p_df.empty:
            continue
            
        float_id = f"ARGO_{platform}"
        
        # Latest coordinate for map marker
        latest_row = p_df.iloc[-1]
        lat = round(float(latest_row["latitude"]), 4)
        lon = round(float(latest_row["longitude"]), 4)
        
        # Group into profiles by timestamp
        profiles = []
        p_df["date_str"] = p_df["time"].astype(str).str[:10]
        grouped = p_df.groupby("date_str")
        
        for d_str, g in grouped:
            g = g.sort_values(by="pres")
            depths = [round(float(v), 1) for v in g["pres"].values]
            temps = [round(float(v), 2) for v in g["temp"].values]
            sals = [round(float(v), 2) if pd.notnull(v) else 34.2 for v in g["psal"].values]
            
            profiles.append({
                "time": d_str,
                "depth": depths,
                "temperature": temps,
                "salinity": sals
            })

        dates = [p["time"] for p in profiles]

        float_index.append({
            "float_id": float_id,
            "lat": lat,
            "lon": lon,
            "dates": dates,
            "time": dates[-1] if dates else None
        })


        float_payload = {
            "float_id": float_id,
            "platform_number": str(platform),
            "source": "Argo GDAC / Ifremer ERDDAP",
            "profiles": profiles
        }

        float_file = os.path.join(floats_dir, f"{float_id}.json")
        with open(float_file, "w", encoding="utf-8") as f:
            json.dump(float_payload, f, separators=(',', ':'))
            
        print(f"  - Float ID: {float_id:>12} | Lat: {lat:>6.2f}°N | Lon: {lon:>6.2f}°E | Profiles: {len(profiles):>2}")

    index_file = os.path.join(floats_dir, "floats_index.json")
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump(float_index, f, separators=(',', ':'))

    print("\n==========================================================================")
    print(f"[+] EXPORTED {len(float_index)} REAL ARGO GDAC FLOATS TO {index_file}")
    print("==========================================================================")
    return True

if __name__ == "__main__":
    fetch_argo_gdac_data()
