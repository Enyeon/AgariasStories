"""Acceso a SQLite y migraciones del esquema de base de datos.

Para añadir un cambio de esquema, agrega una entrada al final de MIGRATIONS;
nunca modifiques una migración ya publicada.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

MIGRATIONS: list[str] = [
    # 1 — personajes compartibles
    """
    CREATE TABLE characters (
        id               TEXT PRIMARY KEY,
        edit_token_hash  TEXT NOT NULL,
        document         TEXT NOT NULL,
        schema_version   INTEGER NOT NULL,
        name             TEXT NOT NULL DEFAULT '',
        revision         INTEGER NOT NULL DEFAULT 1,
        size_bytes       INTEGER NOT NULL,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
    );
    CREATE INDEX idx_characters_updated_at ON characters (updated_at);
    """,
]


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def init_db(path: Path) -> None:
    with closing(connect(path)) as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
        )
        applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
        for version, sql in enumerate(MIGRATIONS, start=1):
            if version in applied:
                continue
            conn.execute("BEGIN")
            try:
                # executescript() hace COMMIT implícito; se ejecuta sentencia a
                # sentencia para que cada migración sea atómica.
                for statement in filter(str.strip, sql.split(";")):
                    conn.execute(statement)
                conn.execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))",
                    (version,),
                )
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise


@contextmanager
def closing(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    try:
        yield conn
    finally:
        conn.close()
