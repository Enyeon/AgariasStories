"""Persistencia de personajes. Único módulo que conoce el SQL."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .db import closing, connect


@dataclass(frozen=True)
class StoredCharacter:
    id: str
    document: dict
    revision: int
    created_at: str
    updated_at: str
    edit_token_hash: str


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _row(row: sqlite3.Row) -> StoredCharacter:
    return StoredCharacter(
        id=row["id"],
        document=json.loads(row["document"]),
        revision=row["revision"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        edit_token_hash=row["edit_token_hash"],
    )


class CharacterRepository:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path

    def _conn(self) -> sqlite3.Connection:
        return connect(self._db_path)

    def create(self, character_id: str, token_hash: str, document: dict, name: str) -> StoredCharacter:
        payload = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
        now = _now()
        with closing(self._conn()) as conn:
            conn.execute(
                """INSERT INTO characters
                   (id, edit_token_hash, document, schema_version, name, revision, size_bytes, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)""",
                (character_id, token_hash, payload, document["schemaVersion"], name, len(payload.encode()), now, now),
            )
        return StoredCharacter(character_id, document, 1, now, now, token_hash)

    def get(self, character_id: str) -> StoredCharacter | None:
        with closing(self._conn()) as conn:
            row = conn.execute("SELECT * FROM characters WHERE id = ?", (character_id,)).fetchone()
        return _row(row) if row else None

    def update(self, character_id: str, document: dict, name: str, expected_revision: int | None) -> StoredCharacter | None:
        """Actualiza con control de concurrencia optimista.

        Devuelve None si la revisión esperada no coincide (otro dispositivo guardó antes).
        """
        payload = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
        now = _now()
        with closing(self._conn()) as conn:
            if expected_revision is None:
                cur = conn.execute(
                    """UPDATE characters SET document = ?, schema_version = ?, name = ?, size_bytes = ?,
                       updated_at = ?, revision = revision + 1 WHERE id = ?""",
                    (payload, document["schemaVersion"], name, len(payload.encode()), now, character_id),
                )
            else:
                cur = conn.execute(
                    """UPDATE characters SET document = ?, schema_version = ?, name = ?, size_bytes = ?,
                       updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?""",
                    (payload, document["schemaVersion"], name, len(payload.encode()), now, character_id, expected_revision),
                )
            if cur.rowcount == 0:
                return None
            row = conn.execute("SELECT * FROM characters WHERE id = ?", (character_id,)).fetchone()
        return _row(row)

    def delete(self, character_id: str) -> bool:
        with closing(self._conn()) as conn:
            cur = conn.execute("DELETE FROM characters WHERE id = ?", (character_id,))
        return cur.rowcount > 0
