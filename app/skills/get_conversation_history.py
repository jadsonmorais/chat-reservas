"""
skills/get_conversation_history.py — Short-term memory: last N messages.
"""

from app.db.pool import query

MAX_MESSAGES = 5


def get_conversation_history(conversation_id: str, limit: int = MAX_MESSAGES) -> list[dict]:
    """Return last `limit` messages in chronological order (oldest first)."""
    if not conversation_id:
        return []

    try:
        rows = query(
            """
            SELECT role, content, metadata, created_at AS "created_at"
            FROM messages
            WHERE conversation_id = %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (conversation_id, limit),
        )
        # Reverse to get chronological order
        return list(reversed(rows))
    except Exception as err:
        print(f"[get_conversation_history] Failed: {err}")
        return []
