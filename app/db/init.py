"""
db/init.py — Executes schema.sql against the pool on application startup.
Gracefully no-ops if the database is unavailable.
"""

import os
from pathlib import Path
from .pool import get_conn, release_conn


def init_database() -> None:
    schema_path = Path(__file__).parent / "schema.sql"
    sql = schema_path.read_text(encoding="utf-8")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
        print("[DB] Schema initialised successfully")
    finally:
        release_conn(conn)
