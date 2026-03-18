"""
services/serpapi_http.py — SerpApi via direct HTTP REST API (fallback).

Used when USE_MCP=false. Mirrors the original serpApi.js client.
"""

import os
import httpx

SERPAPI_BASE_URL = "https://serpapi.com/search"
TIMEOUT = 30.0


def search(engine: str, params: dict) -> dict:
    api_key = os.environ.get("SERPAPI_KEY")
    if not api_key:
        raise RuntimeError("[SerpApiHTTP] SERPAPI_KEY not set")

    payload = {"engine": engine, "api_key": api_key, **params}

    with httpx.Client(timeout=TIMEOUT) as client:
        response = client.get(SERPAPI_BASE_URL, params=payload)

    if response.status_code >= 400:
        raise RuntimeError(f"[SerpApiHTTP] HTTP {response.status_code}: {response.text[:200]}")

    return response.json()
