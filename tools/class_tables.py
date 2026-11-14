"""Tablas de progresión (`infoCubo`) de las clases.

Una tabla sólo se declara en el nivel donde CAMBIA: los niveles siguientes
heredan la última declarada (la app hace lo mismo al leerla).

    python3 tools/class_tables.py            # limpia todas las clases de frontend/src/data/classes
    python3 tools/class_tables.py a.json b.json

Los generadores (build_ingeniero.py, homebrewery_class.py) usan
`expand_cubes` antes de tocar las tablas y `dedupe_cubes` al final.
"""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

CLASSES = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data" / "classes"


def _levels(niveles: dict) -> list[str]:
    return sorted((k for k in niveles if k.isdigit()), key=int)


def expand_cubes(niveles: dict) -> dict:
    """Copia cada tabla heredada en los niveles que no la declaran (para editar)."""
    prev = None
    for n in _levels(niveles):
        lvl = niveles[n]
        if "infoCubo" in lvl:
            prev = lvl["infoCubo"]
        elif prev is not None:
            lvl["infoCubo"] = copy.deepcopy(prev)
    return niveles


def dedupe_cubes(niveles: dict) -> int:
    """Quita las tablas iguales a la anterior. Devuelve cuántas quitó."""
    prev, removed = None, 0
    for n in _levels(niveles):
        lvl = niveles[n]
        if "infoCubo" not in lvl:
            continue
        if lvl["infoCubo"] == prev:
            del lvl["infoCubo"]
            removed += 1
        else:
            prev = lvl["infoCubo"]
    return removed


def clean_file(path: Path) -> int:
    text = path.read_text(encoding="utf-8")
    data = json.loads(text)
    removed = dedupe_cubes(data.get("niveles", {}))
    if removed:
        out = json.dumps(data, ensure_ascii=False, indent=2)
        path.write_text(out + ("\n" if text.endswith("\n") else ""), encoding="utf-8")
    return removed


def main() -> None:
    files = [Path(a) for a in sys.argv[1:]] or sorted(CLASSES.glob("*.json"))
    for f in files:
        n = clean_file(f)
        print(f"{f.name}: {n} tabla(s) repetida(s) quitada(s)")


if __name__ == "__main__":
    main()
