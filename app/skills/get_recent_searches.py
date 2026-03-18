"""
skills/get_recent_searches.py — Historical price data for trend analysis.
"""

from app.db.pool import query

MAX_HISTORY = 5


def get_recent_searches(origin: str, destination: str, limit: int = MAX_HISTORY) -> list[dict]:
    """Return last `limit` flight search prices for the given route."""
    if not origin or not destination:
        return []

    try:
        rows = query(
            """
            SELECT
                cheapest_flight->>'price' AS price,
                departure_date            AS departure_date,
                created_at                AS searched_at
            FROM flight_searches
            WHERE origin = %s AND destination = %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (origin.upper(), destination.upper(), limit),
        )
        return [
            {
                "price": float(r["price"]) if r.get("price") is not None else None,
                "departure_date": r.get("departure_date"),
                "searched_at": r.get("searched_at"),
            }
            for r in rows
        ]
    except Exception as err:
        print(f"[get_recent_searches] Failed: {err}")
        return []
