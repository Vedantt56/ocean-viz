"""
Ocean 3D Workspace Report Assistant
Phase 3 Groq-powered interactive Q&A module for Daily Ocean Reports.
Strictly decoupled, additive backend feature.
"""
import os
import json
from typing import Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)

try:
    from backend.report_generator import get_or_generate_report, load_env_vars as load_gen_env
except ImportError:
    from report_generator import get_or_generate_report, load_env_vars as load_gen_env

# Global cached selected Groq model name
SELECTED_GROQ_MODEL_NAME = None


def load_groq_api_key():
    """Reads GROQ_API_KEY from environment or .env files."""
    try:
        from dotenv import load_dotenv
        possible_envs = [
            os.path.join(BASE_DIR, ".env"),
            os.path.join(ROOT_DIR, ".env"),
            os.path.join(ROOT_DIR, "backend", ".env"),
            os.path.join(os.getcwd(), ".env")
        ]
        for env_p in possible_envs:
            if os.path.exists(env_p):
                load_dotenv(dotenv_path=env_p, override=True)
    except Exception:
        pass

    key = os.getenv("GROQ_API_KEY")
    if not key or key == "your_key_here":
        possible_envs = [
            os.path.join(BASE_DIR, ".env"),
            os.path.join(ROOT_DIR, ".env"),
            os.path.join(ROOT_DIR, "backend", ".env"),
            os.path.join(os.getcwd(), ".env")
        ]
        for env_p in possible_envs:
            if os.path.exists(env_p):
                try:
                    with open(env_p, "r", encoding="utf-8-sig", errors="ignore") as f:
                        for line in f:
                            line = line.strip()
                            if line.startswith("GROQ_API_KEY=") and not line.startswith("#"):
                                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                                if val and val != "your_key_here":
                                    os.environ["GROQ_API_KEY"] = val
                                    key = val
                                    break
                except Exception:
                    pass
            if key and key != "your_key_here":
                break
    return os.getenv("GROQ_API_KEY")


def discover_groq_model(client) -> str:
    """
    Queries models available via Groq API and selects a general-purpose text model.
    Logs selected model name once during setup.
    """
    global SELECTED_GROQ_MODEL_NAME
    if SELECTED_GROQ_MODEL_NAME:
        return SELECTED_GROQ_MODEL_NAME

    try:
        models = list(client.models.list())
        available_ids = [getattr(m, "id", str(m)) for m in getattr(models, "data", models)]

        preferred_order = [
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "llama3-70b-8192",
            "llama3-8b-8192",
            "mixtral-8x7b-32768",
            "gemma2-9b-it"
        ]

        matched_model = None
        for pref in preferred_order:
            if pref in available_ids:
                matched_model = pref
                break

        if not matched_model:
            matched_model = available_ids[0] if available_ids else "llama-3.3-70b-versatile"

        SELECTED_GROQ_MODEL_NAME = matched_model
    except Exception as e:
        print(f"[report_chat] Model discovery warning: {e}. Falling back to default model.")
        SELECTED_GROQ_MODEL_NAME = "llama-3.3-70b-versatile"

    print(f"[report_chat] Selected Groq model: '{SELECTED_GROQ_MODEL_NAME}'")
    return SELECTED_GROQ_MODEL_NAME


def answer_report_question(
    time: str,
    question: str,
    selected_depth: Optional[int] = None,
    selected_variable: Optional[str] = None
) -> dict:
    """
    Answers user questions using ONLY the supplied report context from report_generator.py.
    Supports Gemini (GEMINI_API_KEY) and Groq (GROQ_API_KEY) AI providers.
    Returns controlled response structure and gracefully handles failures.
    """
    gemini_key = load_gen_env()
    groq_key = load_groq_api_key()

    if (not gemini_key or gemini_key == "your_key_here") and (not groq_key or groq_key == "your_key_here"):
        print("[report_chat] Notice: Neither GEMINI_API_KEY nor GROQ_API_KEY configured.")
        return {
            "time": time,
            "answer_available": False,
            "answer": None,
            "error": "The report assistant is temporarily unavailable (API key not configured).",
            "model": None
        }

    try:
        report_data = get_or_generate_report(time, force=False)
    except Exception as e:
        print(f"[report_chat] Error retrieving report for {time}: {e}")
        return {
            "time": time,
            "answer_available": False,
            "answer": None,
            "error": f"Could not load report for {time}.",
            "model": None
        }

    system_instruction = (
        "You are the Ocean 3D Workspace Report Assistant.\n"
        "You answer questions about the selected Daily Ocean Report.\n"
        "Use ONLY the supplied report data and narrative as factual sources.\n\n"
        "Never invent:\n"
        "- measurements\n"
        "- depths\n"
        "- dates\n"
        "- locations\n"
        "- float observations\n"
        "- oceanographic measurements\n"
        "- trends\n"
        "- comparisons\n"
        "- causes or mechanisms that are not supported by the supplied data.\n\n"
        "If the report does not contain enough information to answer a question, say clearly that the available report data does not establish the answer.\n"
        "You may explain the supplied measurements in simple language.\n"
        "When useful, mention the relevant variable and depth.\n"
        "Do not pretend to have access to live ocean observations.\n"
        "Do not browse the web.\n\n"
        "Formatting rules:\n"
        "- Return plain text only.\n"
        "- Do not use Markdown.\n"
        "- Do not use **bold**, *italics*, headings, bullet Markdown, or code blocks.\n"
        "- Keep answers concise and conversational."
    )

    user_context_payload = {
        "report_date": time,
        "active_user_view_depth": selected_depth,
        "active_user_view_variable": selected_variable,
        "structured_statistics": report_data.get("stats", {}),
        "report_narrative": report_data.get("narrative_text", None)
    }

    # 1. Try Gemini Provider if GEMINI_API_KEY is available
    if gemini_key and gemini_key != "your_key_here":
        try:
            from google import genai
            from google.genai import types
            try:
                from backend.report_generator import discover_gemini_model
            except ImportError:
                from report_generator import discover_gemini_model

            client = genai.Client(api_key=gemini_key)
            model_name = discover_gemini_model(client)

            prompt = (
                f"Report Context:\n"
                f"{json.dumps(user_context_payload, indent=2)}\n\n"
                f"User Question: {question}"
            )

            config = types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.2,
                max_output_tokens=512
            )

            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config
            )

            if response and response.text:
                return {
                    "time": time,
                    "answer_available": True,
                    "answer": response.text.strip(),
                    "model": model_name
                }
        except Exception as e:
            print(f"[report_chat] Gemini API call failed: {type(e).__name__}: {e}")

    # 2. Try Groq Provider if GROQ_API_KEY is available
    if groq_key and groq_key != "your_key_here":
        try:
            from groq import Groq

            client = Groq(api_key=groq_key)
            model_name = discover_groq_model(client)

            messages = [
                {"role": "system", "content": system_instruction},
                {
                    "role": "user",
                    "content": (
                        f"Report Context:\n"
                        f"{json.dumps(user_context_payload, indent=2)}\n\n"
                        f"User Question: {question}"
                    )
                }
            ]

            chat_completion = client.chat.completions.create(
                messages=messages,
                model=model_name,
                temperature=0.2,
                max_tokens=512
            )

            answer_text = chat_completion.choices[0].message.content.strip()

            return {
                "time": time,
                "answer_available": True,
                "answer": answer_text,
                "model": model_name
            }
        except Exception as e:
            print(f"[report_chat] Groq API call failed: {type(e).__name__}: {e}")

    return {
        "time": time,
        "answer_available": False,
        "answer": None,
        "error": "The report assistant is temporarily unavailable.",
        "model": None
    }


if __name__ == "__main__":
    import sys
    t = sys.argv[1] if len(sys.argv) > 1 else "2026-08-20"
    q = sys.argv[2] if len(sys.argv) > 2 else "Why are currents weaker at depth?"
    print(f"Testing report_chat for date '{t}' with question: '{q}'")
    res = answer_report_question(time=t, question=q)
    print(json.dumps(res, indent=2))
