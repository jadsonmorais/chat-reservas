"""
skills/persist_transaction.py — ACID transaction: conversation + flight_search + message.
"""

import json
from app.db.pool import get_conn, release_conn


def persist_transaction(
    conversation_id: str,
    customer_phone: str,
    search_params: dict,
    best_flight: dict | None,
    cheapest_flight: dict | None,
    raw_response: dict,
    sales_opportunity: dict,
    assistant_message: str,
) -> None:
    conn = get_conn()
    try:
        conn.autocommit = False

        with conn.cursor() as cur:
            # Upsert conversation
            cur.execute(
                """
                INSERT INTO conversations (id, customer_phone, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
                """,
                (conversation_id, customer_phone),
            )

            # Insert flight search
            cur.execute(
                """
                INSERT INTO flight_searches
                    (conversation_id, origin, destination, departure_date, return_date,
                     best_flight, cheapest_flight, raw_response, sales_opportunity)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    conversation_id,
                    search_params.get("origin"),
                    search_params.get("destination"),
                    search_params.get("departure_date"),
                    search_params.get("return_date"),
                    json.dumps(best_flight),
                    json.dumps(cheapest_flight),
                    json.dumps(raw_response),
                    json.dumps(sales_opportunity),
                ),
            )

            # Log assistant message
            cur.execute(
                """
                INSERT INTO messages (conversation_id, role, content, metadata)
                VALUES (%s, 'assistant', %s, %s)
                """,
                (
                    conversation_id,
                    assistant_message,
                    json.dumps({
                        "type": "flight_search",
                        "origin": search_params.get("origin"),
                        "destination": search_params.get("destination"),
                    }),
                ),
            )

        conn.commit()
        print(f"[persist_transaction] Saved flight search for conversation {conversation_id}")

    except Exception as err:
        conn.rollback()
        print(f"[persist_transaction] Transaction rolled back: {err}")
        raise
    finally:
        conn.autocommit = True
        release_conn(conn)
