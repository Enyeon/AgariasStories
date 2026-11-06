// Utilidades de DOM. Todo el HTML de la app se construye con `html```, que
// escapa automáticamente los valores interpolados (protección contra XSS).

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/** Marca un fragmento como HTML ya seguro (no se vuelve a escapar). */
export class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

export const raw = (value) => new SafeHtml(String(value ?? ''));

function renderValue(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return escapeHtml(v);
}

/** Plantilla HTML con escape automático: html`<p>${texto}</p>` */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

// ── Texto enriquecido de los datos de juego ──────────────────────────────
// Los textos de clases/razas incluyen algo de HTML (<b>, <h3>, tablas...).
// Se permite sólo una lista blanca de etiquetas, sin atributos peligrosos.

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'H3', 'H4', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'SPAN']);
const ALLOWED_CLASSES = new Set(['content_subrayado', 'content_conjures-c', 'content_shadow', 'content_h3']);

function sanitizeNode(node, doc) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) continue; // texto
    if (child.nodeType !== 1 || !ALLOWED_TAGS.has(child.tagName)) {
      // Etiqueta no permitida: se conserva su texto, no la etiqueta.
      const text = doc.createTextNode(child.textContent ?? '');
      child.replaceWith(text);
      continue;
    }
    for (const attr of [...child.attributes]) {
      if (attr.name === 'class') {
        const kept = attr.value.split(/\s+/).filter((c) => ALLOWED_CLASSES.has(c)).map((c) => `rt-${c}`);
        if (kept.length) child.setAttribute('class', kept.join(' '));
        else child.removeAttribute('class');
      } else {
        child.removeAttribute(attr.name);
      }
    }
    sanitizeNode(child, doc);
  }
}

/** Convierte texto de datos (saltos de línea + HTML limitado) en HTML seguro. */
export function richText(text) {
  const source = String(text ?? '').trim();
  if (!source) return raw('');
  const doc = new DOMParser().parseFromString(`<div>${source}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  sanitizeNode(root, doc);
  // Saltos de línea → <br> sólo en nodos de texto fuera de tablas.
  const walker = doc.createTreeWalker(root, 4);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const t of texts) {
    if (!t.nodeValue.includes('\n') || t.parentElement.closest('table')) continue;
    const frag = doc.createDocumentFragment();
    t.nodeValue.split('\n').forEach((part, i) => {
      if (i) frag.append(doc.createElement('br'));
      frag.append(doc.createTextNode(part));
    });
    t.replaceWith(frag);
  }
  return raw(root.innerHTML);
}

// ── Helpers ──────────────────────────────────────────────────────────────

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function setHtml(el, content) {
  el.innerHTML = renderValue(content);
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => { clearTimeout(t); return fn(...args); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Lee/escribe valores anidados: getPath(obj, 'identity.name') */
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => {
    if (o[k] === undefined || o[k] === null) o[k] = /^\d+$/.test(k) ? [] : {};
    return o[k];
  }, obj);
  target[last] = value;
}

export function uid(prefix = 'id') {
  uid.n = (uid.n ?? 0) + 1;
  return `${prefix}-${uid.n}`;
}
