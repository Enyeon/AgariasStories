#!/usr/bin/env python3
"""Añade las casillas a toda distancia en pies (AgSt 1.38). Idempotente.

Regla de la mesa: 1 casilla = 5 pies. Cada «N pies» que sea múltiplo de 5
pasa a «N pies (N/5 casillas)»; también rangos («60/120 pies (12/24
casillas)») y medidas («15 × 5 pies (3 × 1 casillas)»). Si ya había una
anotación de casillas, se corrige (número, mayúsculas y plural). Si había
otra anotación (metros, notas), las casillas van delante.

No se tocan (no son distancias del tablero): volúmenes y superficies («pies
cúbicos», «pies cuadrados»), medidas que no son múltiplos de 5 (alturas,
grosores, «1 pie», proporciones como «2 pies por cada pie») ni cifras con
separador de miles.

Uso:
  python3 tools/casillas.py            # reescribe frontend/src/data/**/*.json
  from casillas import con_casillas    # en los generadores, antes de guardar
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data"

_SEP = r"\s*[/×x]\s*"
_RX = re.compile(
    r"(?<![\d.,/×x])(\d+(?:" + _SEP + r"\d+)*)(\s+)(pies|pie)\b"
    r"(?!\s+c[úu]bic|\s+cuadrad)"
    r"(\s*\(([^()]*)\))?"
)
_EXISTING = re.compile(r"^\s*(\d+)\s*[Cc]asil+as?\b")


def _cells(expr: str):
    """«60/120» → ('12/24', False); «15 × 5» → ('3 × 1', False); «5» → ('1', True). None si no aplica."""
    parts = re.split(r"(" + _SEP + r")", expr)
    nums = parts[0::2]
    seps = parts[1::2]
    vals = [int(n) for n in nums]
    if any(v % 5 or v == 0 for v in vals):
        return None
    out = str(vals[0] // 5)
    for sep, v in zip(seps, vals[1:]):
        out += ("/" if "/" in sep else " × ") + str(v // 5)
    singular = len(vals) == 1 and vals[0] == 5
    return out, singular


def _replace(m: re.Match) -> str:
    expr, space, word, paren, inner = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
    res = _cells(expr)
    if not res:
        return m.group(0)
    cells, singular = res
    label = f"{cells} {'casilla' if singular else 'casillas'}"
    head = f"{expr}{space}{word}"
    if paren is None:
        return f"{head} ({label})"
    if re.search(r"casil", inner, re.I):
        # Corrige una anotación sencilla («(3 Casilla)» → «(3 casillas)»); deja las compuestas (4x4, +1…).
        if "/" not in cells and "×" not in cells and _EXISTING.match(inner):
            fixed = _EXISTING.sub(label, inner, count=1)
            return f"{head}{paren[: paren.index('(')]}({fixed})"
        return m.group(0)
    # Otra anotación (metros, notas): las casillas van delante.
    return f"{head} ({label}){paren}"


def con_casillas(text: str) -> str:
    return _RX.sub(_replace, text)


def main(paths=None):
    files = [Path(p) for p in paths] if paths else sorted(DATA.rglob("*.json"))
    changed = 0
    for f in files:
        s = f.read_text(encoding="utf-8")
        t = con_casillas(s)
        if t != s:
            f.write_text(t, encoding="utf-8")
            changed += 1
    print(f"ok: {changed} archivos con casillas actualizadas")


if __name__ == "__main__":
    main(sys.argv[1:])
