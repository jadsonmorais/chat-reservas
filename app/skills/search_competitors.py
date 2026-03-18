"""
skills/search_competitors.py — Concurrent search: FOR + 5 competitor destinations.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from .search_flights import search_flights

COMPETITORS = [
    {"code": "BPS", "name": "Trancoso/Porto Seguro (BA)", "hotels": "Uxua, Etnia, Txai"},
    {"code": "FEN", "name": "Fernando de Noronha (PE)",   "hotels": "Pousadas premium"},
    {"code": "MCZ", "name": "Maragogi/P. de Galinhas (AL)", "hotels": "Kenoa, Summerville"},
    {"code": "CAW", "name": "Búzios/Cabo Frio (RJ)",       "hotels": "Insolito, Casas Brancas"},
    {"code": "NAT", "name": "Natal/Pipa (RN)",             "hotels": "Tivoli Ecoresort"},
]

OUR_DESTINATION = {"code": "FOR", "name": "Fortaleza/Ceará"}


def search_competitors(origin: str, departure_date: str, return_date: str | None = None) -> dict:
    """
    Search the same hub against Fortaleza + all competitor destinations concurrently.

    Returns: { "our": {...}, "competitors": [...] }
    """
    all_destinations = [OUR_DESTINATION] + COMPETITORS

    def _search_one(dest: dict) -> dict:
        try:
            res = search_flights(
                origin=origin,
                destination=dest["code"],
                departure_date=departure_date,
                return_date=return_date,
            )
            price = (
                (res.get("cheapest_flight") or {}).get("price")
                or (res.get("best_flight") or {}).get("price")
            )
            return {
                **dest,
                "price": price,
                "cheapest_flight": res.get("cheapest_flight"),
                "best_flight": res.get("best_flight"),
                "error": None,
            }
        except Exception as err:
            print(f"[search_competitors] {origin}→{dest['code']} failed: {err}")
            return {**dest, "price": None, "error": str(err)}

    results = [None] * len(all_destinations)

    with ThreadPoolExecutor(max_workers=len(all_destinations)) as executor:
        future_to_idx = {
            executor.submit(_search_one, dest): i
            for i, dest in enumerate(all_destinations)
        }
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            results[idx] = future.result()

    our = results[0]
    competitors = results[1:]
    return {"our": our, "competitors": competitors}
