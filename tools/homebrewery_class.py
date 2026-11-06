"""Convierte el texto de una clase escrito en formato Homebrewery (markdown) en los
rasgos por nivel de un JSON de clase de frontend/src/data/classes/.

Uso (desde la raíz del proyecto):
    python tools/homebrewery_class.py shadow docs/fuentes/shadow-knight.md

Reglas de lectura del markdown:
  - Cada «## Nombre» es un rasgo; su nivel sale de la línea «*Nivel N*» siguiente.
  - Cada «### Subapartado» dentro de un rasgo se convierte en otra tarjeta del
    mismo nivel (salvo que la configuración de la clase diga otra cosa).
  - El texto antes del primer «##» (p. ej. un {{note}}) va al nivel 1.
  - Se conservan: negritas, cursivas, listas, tablas y citas. Se descartan las
    marcas de maquetación (\\page, \\column, {{pageNumber}}, imágenes, «:», «___»).

La configuración específica de cada clase (subclases, rasgos que se mueven a
otro nivel, columnas de la tabla) está en CLASS_CONFIG, más abajo.
Las partes del JSON que no son rasgos (dado de golpe, atributos iniciales,
requeridoTrue, etc.) NO se tocan.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLASSES_DIR = ROOT / "frontend" / "src" / "data" / "classes"

# ── Markdown de Homebrewery → HTML limitado (el que admite la app) ─────────

LAYOUT_LINE = re.compile(r"^(\\page|\\column|\{\{pageNumber.*|\{\{footnote.*|\{\{image.*|!\[.*|:+|_{3,}|\}\}|\{\{(note|wide)?)$")


def inline(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<i>\1</i>", text)
    return text.strip()


def table_html(rows: list[str]) -> str:
    cells = [[c.strip() for c in row.strip().strip("|").split("|")] for row in rows]
    cells = [r for r in cells if not all(re.fullmatch(r":?-+:?", c) for c in r)]
    if not cells:
        return ""
    head, *body = cells
    th = "".join(f"<th>{inline(c)}</th>" for c in head)
    trs = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body)
    return f"<table><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>"


def list_html(items: list[tuple[int, str]]) -> str:
    """[(sangría, texto)] → <ul> anidada en una sola línea."""
    html, stack = "", []
    for indent, text in items:
        if not stack or indent > stack[-1]:
            html += "<ul>"
            stack.append(indent)
        else:
            while len(stack) > 1 and indent < stack[-1]:
                html += "</li></ul>"
                stack.pop()
            html += "</li>"
        html += f"<li>{inline(text)}"
    html += "</li></ul>" * len(stack)
    return html


def md_to_text(lines: list[str]) -> str:
    """Convierte líneas de markdown al formato de texto de los datos (ver proseToHtml)."""
    out: list[str] = []
    table: list[str] = []
    bullets: list[tuple[int, str]] = []

    def flush_table() -> None:
        if table:
            out.append(table_html(table))
            table.clear()

    def flush_list() -> None:
        if bullets:
            out.append(list_html(bullets))
            bullets.clear()

    for raw in lines:
        line = raw.rstrip()
        stripped = line.strip()
        if stripped.startswith("|"):
            flush_list()
            table.append(stripped)
            continue
        flush_table()
        bullet = re.match(r"^(\s*)(?:[-*]|::)\s+(.+)$", line)
        if bullet:
            bullets.append((len(bullet.group(1).expandtabs(2)), bullet.group(2)))
            continue
        flush_list()
        if not stripped or LAYOUT_LINE.match(stripped):
            out.append("")
            continue
        if stripped.startswith("{{"):
            stripped = stripped[2:].strip()
            if not stripped:
                out.append("")
                continue
        if stripped.startswith("######"):
            out.append(f"<i>{inline(stripped.lstrip('#').strip().strip('*'))}</i>")
            continue
        heading = re.match(r"^(#{3,5})\s+(.+)$", stripped)
        if heading:
            tag = "h3" if len(heading.group(1)) == 3 else "h4"
            out.extend(["", f"<{tag}>{inline(heading.group(2)).rstrip(':')}</{tag}>"])
            continue
        if stripped.startswith(">"):
            out.append(f"<i>{inline(stripped.lstrip('>').strip().strip('\"'))}</i>")
            continue
        # «**Etiqueta:**   :: valor» (fichas de datos de Homebrewery)
        stripped = re.sub(r"\s+::\s+", " ", stripped)
        if stripped.startswith('"') and stripped.endswith('"'):
            stripped = f"<i>{stripped.strip(chr(34))}</i>"
        out.append(inline(stripped))
    flush_table()
    flush_list()

    text = "\n".join(out)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ── Lectura de secciones ───────────────────────────────────────────────────

LEVEL_RE = re.compile(r"^(?:::\s*)?\*?\s*nivel\s+(\d+)\s*\*?$", re.IGNORECASE)


def split_sections(markdown: str) -> list[dict]:
    """Devuelve [{title, level, subsections: [{title, lines}]}] en orden."""
    sections: list[dict] = []
    current = {"title": None, "level": 1, "subsections": [{"title": None, "lines": []}]}
    for raw in markdown.replace("\r", "").split("\n"):
        stripped = raw.strip()
        h2 = re.match(r"^##\s+(.+)$", stripped)
        h3 = re.match(r"^###\s+(.+)$", stripped)
        if h2:
            sections.append(current)
            current = {"title": h2.group(1).strip(), "level": None, "subsections": [{"title": None, "lines": []}]}
            continue
        if current["level"] is None and LEVEL_RE.match(stripped):
            current["level"] = int(LEVEL_RE.match(stripped).group(1))
            continue
        if h3:
            current["subsections"].append({"title": h3.group(1).strip(), "lines": []})
            continue
        current["subsections"][-1]["lines"].append(raw)
    sections.append(current)
    return sections


# ── Configuración por clase ────────────────────────────────────────────────

CLASS_CONFIG = {
    "shadow": {
        # Rasgo cuyas «###» son opciones de subclase (no tarjetas).
        "subclass_section": "Manifestación de la Sombra",
        "subclass_label": "Manifestación de la Sombra",
        # «###» que pertenecen a otro nivel.
        "move_subsections": {"Intercambio a Larga Distancia": 7},
        # Rasgos extra derivados del propio texto.
        "extra_blocks": {
            12: [("Cualidad adicional", "Puedes elegir una <b>Cualidad</b> adicional de la lista del nivel 5. No puedes elegir la misma Cualidad más de una vez.")],
        },
        # Título para el texto previo al primer «##».
        "intro_title": "Iluminación y Sombras",
        # CD propia de la clase (se calcula en la ficha).
        "class_dc": {"nombre": "CD de Manifestación", "atributos": ["carisma", "sabiduria"]},
        # Tabla de progresión: renombra columnas existentes y añade nuevas.
        "rename_columns": {"Invocar Sombras": "Sombras activas", "Salvar Sombras": "Sombras reservadas"},
        "extra_column": ("Radio de presencia", {range(1, 5): "500 m", range(5, 9): "5 km", range(9, 13): "25 km",
                                                 range(13, 17): "500 km", range(17, 20): "10.000 km", range(20, 21): "Todo el plano"}),
    },
}


def block(title: str, text: str) -> dict:
    return {"name": title, "titleName": f"✦ {title.upper()} ✦", "descripcion": text}


def build(class_key: str, markdown: str) -> dict:
    cfg = CLASS_CONFIG[class_key]
    path = CLASSES_DIR / f"{class_key}.json"
    cls = json.loads(path.read_text(encoding="utf-8"))
    blocks_by_level: dict[int, list[dict]] = {n: [] for n in range(1, 21)}
    subclasses: dict[str, dict] = {}
    subclass_level = None

    for section in split_sections(markdown):
        title = section["title"] or cfg["intro_title"]
        level = section["level"] or 1
        subs = section["subsections"]
        # El texto del {{note}} inicial lleva su propio «#####» como título.
        if section["title"] is None:
            lines = [l for l in subs[0]["lines"] if not l.strip().startswith("#####")]
            text = md_to_text(lines)
            if text:
                blocks_by_level[1].append(block(title, text))
            continue

        if title == cfg.get("subclass_section"):
            subclass_level = level
            intro = md_to_text(subs[0]["lines"])
            if intro:
                blocks_by_level[level].append(block(title, intro))
            for i, sub in enumerate(subs[1:], start=1):
                text = md_to_text(sub["lines"])
                paragraphs = [p for p in text.split("\n\n") if p.strip()]
                summary = paragraphs[0] if paragraphs else ""
                details = "\n\n".join(paragraphs[1:]) or summary
                subclasses[f"senda{i}"] = {
                    "subNombre": sub["title"],
                    "subDescripcion": summary,
                    "subNivel": {str(level): {"infoSubBlock": {"subBlockUno": {
                        "subName": sub["title"], "subTitleName": f"✦ {sub['title'].upper()} ✦", "subDescripcion": details,
                    }}}},
                }
            continue

        main = md_to_text(subs[0]["lines"])
        if main:
            blocks_by_level[level].append(block(title, main))
        for sub in subs[1:]:
            target = cfg.get("move_subsections", {}).get(sub["title"], level)
            text = md_to_text(sub["lines"])
            if text:
                blocks_by_level[target].append(block(sub["title"], text))

    for level, extras in cfg.get("extra_blocks", {}).items():
        blocks_by_level[level].extend(block(t, x) for t, x in extras)

    # Volcar al JSON conservando todo lo que no son rasgos.
    names = ["Uno", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "Ocho", "Nueve", "Diez", "Once", "Doce"]
    col_name, col_values = cfg.get("extra_column", (None, {}))
    for n in range(1, 21):
        lvl = cls["niveles"].setdefault(str(n), {})
        lvl.pop("infoBlock", None)
        lvl.pop("subClase", None)
        if blocks_by_level[n]:
            lvl["infoBlock"] = {f"block{names[i] if i < len(names) else i + 1}": b for i, b in enumerate(blocks_by_level[n])}
        if n == subclass_level and subclasses:
            lvl["subClase"] = subclasses
        cube = lvl.get("infoCubo")
        if cube and cfg.get("rename_columns"):
            cube["columnas"] = [cfg["rename_columns"].get(c, c) for c in cube["columnas"]]
        if col_name:
            value = next((v for r, v in col_values.items() if n in r), "")
            cube = lvl.setdefault("infoCubo", {"columnas": [], "filas": [[]]})
            if col_name not in cube["columnas"]:
                cube["columnas"].append(col_name)
                cube["filas"][0].append(value)

    if cfg.get("subclass_label"):
        cls["subclaseNombre"] = cfg["subclass_label"]
    if cfg.get("class_dc"):
        cls["cdClase"] = cfg["class_dc"]
    return cls


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    class_key, source = sys.argv[1], Path(sys.argv[2])
    result = build(class_key, source.read_text(encoding="utf-8"))
    out = CLASSES_DIR / f"{class_key}.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum(len(l.get("infoBlock", {})) for l in result["niveles"].values())
    subs = next((l["subClase"] for l in result["niveles"].values() if "subClase" in l), {})
    print(f"{out.relative_to(ROOT)}: {total} rasgos, {len(subs)} opciones de {result.get('subclaseNombre', 'subclase')}")
    for n, l in result["niveles"].items():
        names = [b["name"] for b in l.get("infoBlock", {}).values()]
        if names:
            print(f"  Nivel {n}: {', '.join(names)}")
    for key, s in subs.items():
        print(f"  {key}: {s['subNombre']}")


if __name__ == "__main__":
    main()
