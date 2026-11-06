// Interpreta los textos de los datos de juego (escritos a mano con viñetas como
// ♻, ❖, ::, —) para mostrarlos con estructura. Funciones puras, sin DOM.

const TRAIT_BULLET = /^(♻|❖|•|\*)\s*/;
const SUB_BULLET = /^(::|-{1,2}|—|–)\s*/;
const HEADING = /^[^.:]{2,40}:\s*$/; // «Rasgos de Raza:», «Atributos de clase:»

/** Separa «Nombre. Descripción» si el nombre es corto; si no, todo es descripción. */
function splitTitle(text) {
  const m = /^(.{2,60}?)[.:]\s+(.+)$/s.exec(text);
  if (m && !/[,;]/.test(m[1])) return { title: m[1].trim(), body: m[2].trim() };
  if (/[.:]$/.test(text) && text.length <= 60) return { title: text.replace(/[.:]$/, '').trim(), body: '' };
  return { title: '', body: text.trim() };
}

/**
 * Lista de rasgos (texto de raza o similar).
 * @returns {{ heading: string, items: Array<{ title: string, body: string, children: string[] }>, notes: string[] }[]}
 */
export function parseTraitSections(text) {
  const sections = [];
  let section = null;
  let item = null;
  const ensureSection = () => {
    if (!section) { section = { heading: '', items: [], notes: [] }; sections.push(section); }
    return section;
  };

  for (const rawLine of String(text ?? '').split('\n')) {
    const line = rawLine.trim();
    if (!line || /^:+$/.test(line)) continue;
    if (HEADING.test(line) && !TRAIT_BULLET.test(line) && !SUB_BULLET.test(line)) {
      section = { heading: line.replace(/:\s*$/, ''), items: [], notes: [] };
      sections.push(section);
      item = null;
      continue;
    }
    if (TRAIT_BULLET.test(line)) {
      item = { ...splitTitle(line.replace(TRAIT_BULLET, '')), children: [] };
      ensureSection().items.push(item);
      continue;
    }
    if (SUB_BULLET.test(line) && item) {
      item.children.push(line.replace(SUB_BULLET, ''));
      continue;
    }
    if (item && !SUB_BULLET.test(line)) {
      // Continuación de la descripción del rasgo anterior.
      item.body = item.body ? `${item.body}\n${line}` : line;
      continue;
    }
    ensureSection().notes.push(line.replace(SUB_BULLET, ''));
  }
  return sections.filter((s) => s.items.length || s.notes.length);
}

/**
 * Datos básicos de clase («❖ Etiqueta: valor» con sub-elementos «:: Etiqueta: valor»).
 * @returns {Array<{ label: string, value: string, items: Array<{ label: string, value: string }> }>}
 */
export function parseClassBasics(text) {
  const out = [];
  let current = null;
  const kv = (s) => {
    const i = s.indexOf(':');
    if (i > 0 && i < 40) return { label: s.slice(0, i).trim(), value: s.slice(i + 1).trim() };
    const dot = s.indexOf('. ');
    if (dot > 0 && dot < 40) return { label: s.slice(0, dot).trim(), value: s.slice(dot + 1).trim() };
    return { label: '', value: s.trim() };
  };
  for (const rawLine of String(text ?? '').split('\n')) {
    const line = rawLine.trim();
    if (!line || /^:+$/.test(line) || (HEADING.test(line) && !TRAIT_BULLET.test(line))) continue;
    if (TRAIT_BULLET.test(line)) {
      current = { ...kv(line.replace(TRAIT_BULLET, '')), items: [] };
      out.push(current);
    } else if (SUB_BULLET.test(line) && current) {
      const rest = line.replace(SUB_BULLET, '');
      if (rest) current.items.push(kv(rest));
    } else if (current) {
      current.value = current.value ? `${current.value} ${line}` : line;
    } else {
      out.push({ label: '', value: line, items: [] });
    }
  }
  return out;
}

/**
 * Convierte prosa con viñetas en HTML simple (párrafos y listas) antes de
 * sanearlo con richText(). Respeta el HTML limitado que ya traen los datos.
 */
export function proseToHtml(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<ul>${list.map((li) => `<li>${li}</li>`).join('')}</ul>`); list = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^[_:]+$/.test(line)) { flushPara(); flushList(); continue; }
    const bullet = /^(—|–|-{1,2}|♻|❖|::|•)\s+/.exec(line);
    if (bullet) {
      flushPara();
      (list ??= []).push(line.slice(bullet[0].length));
    } else if (/^<(h3|h4|table|ul|ol)/i.test(line)) {
      flushPara(); flushList(); out.push(line);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out.join('');
}

/** Texto plano (sin etiquetas) para búsquedas. */
export function plainText(text) {
  return String(text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
