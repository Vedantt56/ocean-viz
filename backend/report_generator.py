"""
Daily Ocean Report Statistics & Gemini Narrative Generator
Phase 2 implementation adding Google Gemini narrative generation on top of Phase 1 statistics engine.
Strictly decoupled from FastAPI web framework.
"""
import os
import json
import numpy as np
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
DATA_DIR = os.path.join(ROOT_DIR, "data")
SLICES_DIR = os.path.join(DATA_DIR, "slices")
FLOATS_DIR = os.path.join(DATA_DIR, "floats")
REPORTS_DIR = os.path.join(DATA_DIR, "reports")

# Global cached selected Gemini model name
SELECTED_MODEL_NAME = None


def load_env_vars():
    """Reads GEMINI_API_KEY from environment or repo root .env file."""
    try:
        from dotenv import load_dotenv
        possible_envs = [
            os.path.join(ROOT_DIR, ".env"),
            os.path.join(BASE_DIR, ".env"),
            os.path.join(os.getcwd(), ".env")
        ]
        for env_p in possible_envs:
            if os.path.exists(env_p):
                load_dotenv(dotenv_path=env_p, override=True)
    except Exception:
        pass

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        possible_envs = [
            os.path.join(ROOT_DIR, ".env"),
            os.path.join(BASE_DIR, ".env"),
            os.path.join(os.getcwd(), ".env")
        ]
        for env_p in possible_envs:
            if os.path.exists(env_p):
                try:
                    with open(env_p, "r", encoding="utf-8-sig", errors="ignore") as f:
                        for line in f:
                            line = line.strip()
                            if line.startswith("GEMINI_API_KEY=") and not line.startswith("#"):
                                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                                if val:
                                    os.environ["GEMINI_API_KEY"] = val
                                    api_key = val
                                    break
                except Exception:
                    pass
            if api_key:
                break

    return os.getenv("GEMINI_API_KEY")



def discover_gemini_model(client) -> str:
    """
    Queries models available to the configured API key and selects a Flash-tier model.
    Logs selected model name once during setup.
    """
    global SELECTED_MODEL_NAME
    if SELECTED_MODEL_NAME:
        return SELECTED_MODEL_NAME

    try:
        models = list(client.models.list())
        available_names = []
        for m in models:
            m_name = getattr(m, "name", str(m))
            clean_name = m_name.replace("models/", "")
            available_names.append(clean_name)

        preferred_order = [
            "gemini-3.6-flash",
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gemini-flash-latest",
            "gemini-2.0-flash-lite",
        ]

        matched_model = None
        for pref in preferred_order:
            if pref in available_names:
                matched_model = pref
                break

        if not matched_model:
            flash_models = [n for n in available_names if "flash" in n.lower() and "2.5-flash" not in n.lower()]
            if flash_models:
                matched_model = flash_models[0]
            else:
                gen_models = [n for n in available_names if "gemini" in n.lower() and "2.5" not in n.lower()]
                matched_model = gen_models[0] if gen_models else "gemini-2.0-flash"

        SELECTED_MODEL_NAME = matched_model
    except Exception as e:
        print(f"[report_generator] Model discovery warning: {e}. Falling back to 'gemini-2.0-flash'.")
        SELECTED_MODEL_NAME = "gemini-2.0-flash"

    print(f"[report_generator] Selected Gemini model: '{SELECTED_MODEL_NAME}'")
    return SELECTED_MODEL_NAME



def compute_daily_stats(time: str) -> dict:
    """
    Computes scientifically accurate daily statistics for the ocean visualization domain
    given a target timestep string (e.g. '2026-08-20').
    Inspects actual slice files under data/slices and float profile JSONs under data/floats.
    """
    stats = {
        "time": time,
        "domain": "Bay of Bengal (6.66°N - 21.00°N, 78.66°E - 92.25°E)",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "variables": {},
        "floats": {
            "total_active": 0,
            "float_ids": [],
            "temp_range": {"min": None, "max": None},
            "salinity_range": {"min": None, "max": None}
        },
        "highlights": []
    }

    # 1. Inspect Field Variables Data Slices
    vars_list = ["temperature", "salinity", "currents", "chlorophyll"]
    
    for var in vars_list:
        var_dir = os.path.join(SLICES_DIR, var)
        if not os.path.exists(var_dir):
            continue

        depth_dirs = [d for d in os.listdir(var_dir) if d.isdigit() and os.path.isdir(os.path.join(var_dir, d))]
        depth_dirs.sort(key=int)

        all_vals = []
        depth_stats = {}

        for d_str in depth_dirs:
            depth_val = int(d_str)
            file_path = os.path.join(var_dir, d_str, f"{time}.json")
            if not os.path.exists(file_path):
                continue

            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    slice_json = json.load(f)

                values = slice_json.get("values", [])
                valid_flat = []
                for row in values:
                    for val in row:
                        if val is not None and np.isreal(val) and np.isfinite(val):
                            valid_flat.append(float(val))

                if valid_flat:
                    all_vals.extend(valid_flat)
                    depth_stats[depth_val] = {
                        "min": round(float(np.min(valid_flat)), 4),
                        "max": round(float(np.max(valid_flat)), 4),
                        "mean": round(float(np.mean(valid_flat)), 4),
                        "std": round(float(np.std(valid_flat)), 4)
                    }
            except Exception as e:
                print(f"[report_generator] Warning reading {file_path}: {e}")

        if all_vals:
            stats["variables"][var] = {
                "min": round(float(np.min(all_vals)), 4),
                "max": round(float(np.max(all_vals)), 4),
                "mean": round(float(np.mean(all_vals)), 4),
                "std": round(float(np.std(all_vals)), 4),
                "sample_count": len(all_vals),
                "depth_levels": depth_stats
            }

    # 2. Inspect Argo Floats Data
    index_file = os.path.join(FLOATS_DIR, "floats_index.json")
    if os.path.exists(index_file):
        try:
            with open(index_file, "r", encoding="utf-8") as f:
                floats_index = json.load(f)

            active_float_ids = []
            float_temps = []
            float_sals = []

            for item in floats_index:
                f_id = item.get("float_id")
                f_dates = item.get("dates", [])
                f_time = item.get("time")

                if (f_dates and time in f_dates) or (f_time == time):
                    active_float_ids.append(f_id)

                # Inspect detailed float JSON if active
                float_file = os.path.join(FLOATS_DIR, f"{f_id}.json")
                if os.path.exists(float_file):
                    try:
                        with open(float_file, "r", encoding="utf-8") as ff:
                            f_payload = json.load(ff)

                        for profile in f_payload.get("profiles", []):
                            if profile.get("time") == time:
                                for t_val in profile.get("temperature", []):
                                    if t_val is not None: float_temps.append(float(t_val))
                                for s_val in profile.get("salinity", []):
                                    if s_val is not None: float_sals.append(float(s_val))
                    except Exception:
                        pass

            stats["floats"]["total_active"] = len(active_float_ids)
            stats["floats"]["float_ids"] = active_float_ids
            if float_temps:
                stats["floats"]["temp_range"] = {
                    "min": round(float(min(float_temps)), 2),
                    "max": round(float(max(float_temps)), 2)
                }
            if float_sals:
                stats["floats"]["salinity_range"] = {
                    "min": round(float(min(float_sals)), 2),
                    "max": round(float(max(float_sals)), 2)
                }

        except Exception as e:
            print(f"[report_generator] Warning inspecting floats: {e}")

    # 3. Generate Oceanographic Highlights Summary
    highlights = []
    if "temperature" in stats["variables"]:
        t_stats = stats["variables"]["temperature"]
        highlights.append(f"Sea Surface & Water Column Temp Range: {t_stats['min']}°C to {t_stats['max']}°C (Mean: {t_stats['mean']}°C).")
    if "currents" in stats["variables"]:
        c_stats = stats["variables"]["currents"]
        highlights.append(f"Hydrodynamic Velocity Peak: {c_stats['max']} m/s with average flow of {c_stats['mean']} m/s.")
    if stats["floats"]["total_active"] > 0:
        highlights.append(f"Real Argo GDAC Floats Reporting: {stats['floats']['total_active']} active profilers in domain on {time}.")

    stats["highlights"] = highlights
    return stats


def generate_gemini_narrative(stats: dict) -> tuple[bool, str]:
    """
    Generates a concise, scientifically honest ocean narrative from the structured statistics dictionary.
    Returns tuple (narrative_available: bool, narrative_text: str | None).
    """
    api_key = load_env_vars()
    if not api_key or api_key == "your_key_here":
        print("[report_generator] Notice: GEMINI_API_KEY environment variable missing or set to placeholder.")
        return False, None

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        model_name = discover_gemini_model(client)

        system_instruction = (
            "You are writing a concise ocean-data report. The structured data supplied to you is the only "
            "authoritative source for numerical claims. Only state facts directly supported by the supplied data. "
            "Never invent measurements, locations, trends, comparisons, observations, or values. "
            "If a variable is unavailable, explicitly say that it is unavailable rather than estimating or filling it in."
        )

        prompt = (
            f"Generate a concise ocean narrative for the Bay of Bengal domain based on the following structured daily statistics:\n\n"
            f"{json.dumps(stats, indent=2)}\n\n"
            "Please structure your report into the following clear sections suitable for a UI panel:\n"
            "1. Overall Day Summary\n"
            "2. Depth-by-Depth Findings\n"
            "3. Findings for Each Available Variable\n"
            "4. Float Observations\n"
            "5. Data Availability & Observations\n"
        )

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.2,
        )

        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=config
        )

        if response and response.text:
            return True, response.text.strip()
        else:
            print("[report_generator] Empty response from Gemini API.")
            return False, None

    except Exception as e:
        # Never log API key!
        print(f"[report_generator] Server-side Gemini API call failed: {type(e).__name__}: {e}")
        return False, None


def get_or_generate_report(time: str, force: bool = False) -> dict:
    """
    Returns full structured report response dictionary:
    {
      "time": "2026-08-20",
      "narrative_available": bool,
      "narrative_text": str | None,
      "stats": dict
    }
    Checks data/reports/{time}.json cache first unless force=True.
    """
    os.makedirs(REPORTS_DIR, exist_ok=True)
    cache_path = os.path.join(REPORTS_DIR, f"{time}.json")

    if not force and os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cached_report = json.load(f)
                print(f"[report_generator] Returning cached report for {time} from {cache_path}")
                return cached_report
        except Exception as e:
            print(f"[report_generator] Cache read warning for {time}: {e}")

    # Compute authoritative daily statistics from disk
    stats = compute_daily_stats(time)

    # Attempt Gemini narrative generation
    narrative_available, narrative_text = generate_gemini_narrative(stats)

    report_response = {
        "time": time,
        "narrative_available": narrative_available,
        "narrative_text": narrative_text,
        "stats": stats
    }

    # Write to cache if narrative was successfully generated
    if narrative_available:
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(report_response, f, indent=2)
            print(f"[report_generator] Saved cached report for {time} to {cache_path}")
        except Exception as e:
            print(f"[report_generator] Cache write warning for {time}: {e}")

    return report_response


if __name__ == "__main__":
    import sys
    t = sys.argv[1] if len(sys.argv) > 1 else "2026-08-20"
    print(f"Testing get_or_generate_report for time '{t}':")
    res = get_or_generate_report(t, force=True)
    print(json.dumps(res, indent=2))
