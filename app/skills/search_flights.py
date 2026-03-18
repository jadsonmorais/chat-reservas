"""
skills/search_flights.py — Flight search via SerpApi (MCP or HTTP fallback).

Mirrors searchFlights.js: retry logic, best/cheapest extraction, date normalisation.
"""

import os
import time
from datetime import date as _date

from app.services import serpapi_mcp, serpapi_http


def search_flights(
    origin: str,
    destination: str,
    departure_date: str,
    return_date: str | None = None,
    currency: str = "BRL",
) -> dict:
    """
    Search flights and return { best_flight, cheapest_flight, all_flights, search_metadata }.

    Args:
        origin:         IATA code (e.g. "GRU")
        destination:    IATA code (e.g. "FOR")
        departure_date: ISO date string YYYY-MM-DD
        return_date:    ISO date string (optional — one-way if omitted)
        currency:       Currency code (default "BRL")
    """
    departure_date = _normalise_date(departure_date)
    return_date_norm = _normalise_date(return_date) if return_date else None

    params = {
        "departure_id": origin.upper(),
        "arrival_id": destination.upper(),
        "outbound_date": departure_date,
        "currency": currency,
        "hl": "pt-br",
        "gl": "br",
        "type": "1" if return_date_norm else "2",
    }
    if return_date_norm:
        params["return_date"] = return_date_norm

    data = _fetch_with_retry(params, retries=2)

    best_flights = data.get("best_flights") or []
    other_flights = data.get("other_flights") or []
    all_flights = best_flights + other_flights

    print(f"[search_flights] {origin}→{destination}: {len(all_flights)} results")

    best_flight = best_flights[0] if best_flights else None
    cheapest_flight = _find_cheapest(all_flights)

    return {
        "best_flight": best_flight,
        "cheapest_flight": cheapest_flight,
        "all_flights": all_flights,
        "search_metadata": {
            "origin": origin,
            "destination": destination,
            "departure_date": departure_date,
            "return_date": return_date_norm,
            "currency": currency,
            "total_results": len(all_flights),
        },
    }


# ── Helpers ──────────────────────────────────────────────────

def _normalise_date(date_str: str) -> str:
    """Validate and return YYYY-MM-DD (no-op for well-formed ISO strings)."""
    # Accept ISO date strings directly; strip time component if present
    return str(date_str)[:10]


def _find_cheapest(flights: list) -> dict | None:
    if not flights:
        return None
    return min(flights, key=lambda f: f.get("price") or float("inf"))


def _fetch_with_retry(params: dict, retries: int = 2) -> dict:
    use_mcp = os.environ.get("USE_MCP", "true").lower() == "true"
    _search = serpapi_mcp.search if use_mcp else serpapi_http.search

    for attempt in range(retries + 1):
        try:
            return _search("google_flights", params)
        except Exception as err:
            msg = str(err)
            is_retryable = "HTTP 5" in msg or "Connection" in msg or "timeout" in msg.lower()
            if is_retryable and attempt < retries:
                print(f"[search_flights] Attempt {attempt + 1} failed. Retrying…")
                time.sleep(1.0 * (attempt + 1))
                continue
            raise
