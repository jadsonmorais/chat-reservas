"""
db/pool.py — PostgreSQL connection pool (psycopg2 ThreadedConnectionPool).

Exports:
  query(sql, params)       → executes and auto-commits, returns list of dicts
  get_conn()               → acquires a raw connection for ACID transactions
  release_conn(conn)       → returns connection to the pool
"""

import os
import psycopg2
import psycopg2.pool
import psycopg2.extras

_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise RuntimeError("[DB] DATABASE_URL not set")
        _pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=10,
            dsn=database_url,
            connect_timeout=5,
        )
    return _pool


def query(sql: str, params: tuple = ()) -> list[dict]:
    """Execute a query, auto-commit, return list of row dicts."""
    pool = _get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            conn.commit()
            try:
                rows = cur.fetchall()
                return [dict(r) for r in rows]
            except psycopg2.ProgrammingError:
                return []
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def get_conn():
    """Acquire a dedicated connection (caller must release_conn when done)."""
    return _get_pool().getconn()


def release_conn(conn) -> None:
    """Return a connection to the pool."""
    _get_pool().putconn(conn)
