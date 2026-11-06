"""Configuración leída de variables de entorno (ver .env.example).

No hay secretos obligatorios: los tokens de edición son aleatorios de 256 bits
y se guardan como hash SHA-256, así que no se necesita una clave de servidor.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Carga un .env sencillo (CLAVE=valor) sin dependencias externas.

    Las variables ya definidas en el entorno tienen prioridad.
    """
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    value = os.environ.get(name, "").strip()
    return int(value) if value else default


def _list(name: str) -> list[str]:
    return [item.strip() for item in os.environ.get(name, "").split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    env: str = "development"
    database_path: Path = BACKEND_DIR / "data" / "agarias.db"
    frontend_dist: Path | None = None
    cors_origins: list[str] = field(default_factory=list)
    max_body_bytes: int = 1_500_000
    rate_limit_writes: int = 60
    rate_limit_window_seconds: int = 300
    trust_proxy_headers: bool = False
    enable_docs: bool = True

    @property
    def is_production(self) -> bool:
        return self.env == "production"


def load_settings() -> Settings:
    _load_dotenv(BACKEND_DIR / ".env")
    env = os.environ.get("APP_ENV", "development").strip().lower()

    db_path = Path(os.environ.get("DATABASE_PATH", "") or BACKEND_DIR / "data" / "agarias.db")
    if not db_path.is_absolute():
        db_path = (BACKEND_DIR / db_path).resolve()

    dist_value = os.environ.get("FRONTEND_DIST", "").strip()
    dist = Path(dist_value) if dist_value else BACKEND_DIR.parent / "frontend" / "dist"
    if not dist.is_absolute():
        dist = (BACKEND_DIR / dist).resolve()

    return Settings(
        env=env,
        database_path=db_path,
        frontend_dist=dist if dist.is_dir() else None,
        cors_origins=_list("CORS_ORIGINS"),
        max_body_bytes=_int("MAX_BODY_BYTES", 1_500_000),
        rate_limit_writes=_int("RATE_LIMIT_WRITES", 60),
        rate_limit_window_seconds=_int("RATE_LIMIT_WINDOW_SECONDS", 300),
        trust_proxy_headers=_bool("TRUST_PROXY_HEADERS", False),
        enable_docs=_bool("ENABLE_API_DOCS", env != "production"),
    )
