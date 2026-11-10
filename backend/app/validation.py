"""Validación del lado servidor de los documentos de personaje.

El servidor actúa como almacén de documentos: el cliente normaliza el personaje
completo (frontend/src/domain/validation.js) y aquí se comprueba que el
documento sea estructuralmente sano y no pueda usarse para abusar del servicio
(tamaño, profundidad, tipos, valores fuera de rango, imágenes no válidas).
Los campos desconocidos se conservan para no perder datos de versiones futuras
del formato que este servidor aún no conozca en detalle.
"""

from __future__ import annotations

import math
import re
from typing import Any

DOCUMENT_FORMAT = "agarias-dnd-character"
# Sube este valor cuando el frontend publique un nuevo SCHEMA_VERSION.
MAX_SCHEMA_VERSION = 3

MAX_DEPTH = 8
MAX_STRING = 20_000
MAX_KEY = 64
MAX_ARRAY = 400
MAX_KEYS_PER_OBJECT = 120
MAX_PORTRAIT_CHARS = 560_000
MAX_LEVELS = 20

PORTRAIT_RE = re.compile(r"^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$")
ABILITIES = ("fuerza", "destreza", "constitucion", "inteligencia", "sabiduria", "carisma")


class DocumentError(ValueError):
    """Error con mensaje apto para mostrar al usuario."""


def _check_tree(value: Any, path: str, depth: int) -> None:
    if depth > MAX_DEPTH:
        raise DocumentError("El personaje tiene una estructura demasiado profunda.")
    if isinstance(value, dict):
        if len(value) > MAX_KEYS_PER_OBJECT:
            raise DocumentError(f"Demasiados campos en «{path}».")
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > MAX_KEY:
                raise DocumentError("El personaje contiene nombres de campo no válidos.")
            _check_tree(item, f"{path}.{key}", depth + 1)
    elif isinstance(value, list):
        if len(value) > MAX_ARRAY:
            raise DocumentError(f"La lista «{path}» es demasiado larga.")
        for item in value:
            _check_tree(item, path, depth + 1)
    elif isinstance(value, str):
        limit = MAX_PORTRAIT_CHARS if path.endswith("identity.portrait") else MAX_STRING
        if len(value) > limit:
            raise DocumentError(f"El texto de «{path}» es demasiado largo.")
    elif isinstance(value, bool) or value is None:
        return
    elif isinstance(value, (int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            raise DocumentError("El personaje contiene números no válidos.")
        if abs(value) > 1e12:
            raise DocumentError("El personaje contiene números fuera de rango.")
    else:  # pragma: no cover - json.loads no produce otros tipos
        raise DocumentError("El personaje contiene valores no válidos.")


def _int_in_range(value: Any, low: int, high: int) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high


def validate_document(document: Any) -> str:
    """Valida el documento y devuelve el nombre del personaje (para índices)."""
    if not isinstance(document, dict):
        raise DocumentError("El documento del personaje no es válido.")
    if document.get("format") != DOCUMENT_FORMAT:
        raise DocumentError("El documento no es un personaje de Stories of Agarias.")
    version = document.get("schemaVersion")
    if not _int_in_range(version, 1, MAX_SCHEMA_VERSION):
        raise DocumentError("Versión de formato de personaje no admitida por el servidor.")
    character = document.get("character")
    if not isinstance(character, dict):
        raise DocumentError("El documento no contiene un personaje.")

    _check_tree(document, "document", 0)

    identity = character.get("identity", {})
    if not isinstance(identity, dict):
        raise DocumentError("La identidad del personaje no es válida.")
    name = identity.get("name", "")
    if not isinstance(name, str) or len(name) > 120:
        raise DocumentError("El nombre del personaje no es válido.")
    portrait = identity.get("portrait")
    if portrait is not None and (not isinstance(portrait, str) or not PORTRAIT_RE.fullmatch(portrait)):
        raise DocumentError("La imagen del personaje no es válida.")

    abilities = character.get("abilities", {})
    if not isinstance(abilities, dict) or any(
        key in abilities and not _int_in_range(abilities[key], 1, 30) for key in ABILITIES
    ):
        raise DocumentError("Las puntuaciones de atributo deben estar entre 1 y 30.")

    levels = character.get("levels", [])
    if not isinstance(levels, list) or len(levels) > MAX_LEVELS:
        raise DocumentError(f"El personaje no puede tener más de {MAX_LEVELS} niveles.")
    for level in levels:
        if not isinstance(level, dict) or not isinstance(level.get("classKey"), str) or not level["classKey"]:
            raise DocumentError("Hay niveles del personaje sin clase.")
        if "hpRoll" in level and not _int_in_range(level["hpRoll"], 1, 20):
            raise DocumentError("Hay tiradas de puntos de golpe no válidas.")

    return name.strip()
