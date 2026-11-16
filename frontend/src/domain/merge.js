// Fusión a tres bandas de dos versiones de un personaje.
//
// Caso real: la ficha está abierta en una pestaña y la Tienda en otra. El
// jugador suma 50 po que le regaló el DM mientras la Tienda le cobra una compra.
// Sin fusión, la última en guardar pisaría a la otra (se perdería la compra o el
// regalo). Con `base` (la versión que ambas conocían) se combinan:
//   - lo que sólo cambió en un lado se toma de ese lado;
//   - las monedas que cambiaron en los dos lados suman ambas diferencias
//     (regalo + compra);
//   - lo mismo con los materiales del Taller (cantidades);
//   - las listas (inventario, rasgos…) se combinan como altas y bajas: se parte
//     de la otra versión, se quita lo que aquí se quitó y se añade lo que aquí se
//     añadió (con `id`, elemento a elemento);
//   - si el mismo dato cambió en los dos lados, gana el de esta pestaña («mine»).
// Es pura: no modifica sus argumentos.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const clone = (v) => (v === undefined ? v : structuredClone(v));
const hasIds = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((x) => isObj(x) && typeof x.id === 'string' && x.id);

function mergeById(base = [], mine = [], theirs = [], path) {
  const byId = (arr) => new Map(arr.map((x) => [x.id, x]));
  const b = byId(base);
  const m = byId(mine);
  const t = byId(theirs);
  const out = [];
  const seen = new Set();
  // Orden: el de esta pestaña, y después lo que se añadió en la otra.
  for (const x of [...mine, ...theirs]) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    const inB = b.has(x.id);
    const inM = m.has(x.id);
    const inT = t.has(x.id);
    if (inM && inT) out.push(mergeValue(b.get(x.id), m.get(x.id), t.get(x.id), path));
    else if (inM && !inT) { if (!inB || !same(b.get(x.id), m.get(x.id))) out.push(clone(m.get(x.id))); } // la otra lo quitó: se respeta salvo que aquí se editara
    else if (!inM && inT) { if (!inB || !same(b.get(x.id), t.get(x.id))) out.push(clone(t.get(x.id))); } // aquí se quitó: ídem
  }
  return out;
}

/** Listas sin id: la otra versión, menos lo que aquí se quitó, más lo que aquí se añadió. */
function mergeList(base, mine, theirs) {
  const key = (x) => JSON.stringify(x);
  const count = (arr) => arr.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1), new Map());
  const cb = count(base);
  const cm = count(mine);
  const removed = new Map([...cb].map(([k, n]) => [k, Math.max(0, n - (cm.get(k) ?? 0))]));
  const out = [];
  for (const x of theirs) {
    const k = key(x);
    if (removed.get(k) > 0) { removed.set(k, removed.get(k) - 1); continue; }
    out.push(clone(x));
  }
  const added = new Map([...cm].map(([k, n]) => [k, Math.max(0, n - (cb.get(k) ?? 0))]));
  for (const x of mine) {
    const k = key(x);
    if (added.get(k) > 0) { added.set(k, added.get(k) - 1); out.push(clone(x)); }
  }
  return out;
}

function mergeValue(base, mine, theirs, path = '') {
  if (same(mine, theirs)) return clone(mine);
  if (same(base, mine)) return clone(theirs);
  if (same(base, theirs)) return clone(mine);
  // Los dos lados cambiaron este dato.
  if (typeof mine === 'number' && typeof theirs === 'number' && typeof base === 'number' && /(^|\.)(coins|materials)\.[^.]+$/.test(path)) {
    return Math.max(0, theirs + (mine - base));
  }
  if (isObj(mine) && isObj(theirs)) {
    const b = isObj(base) ? base : {};
    const out = {};
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      const v = mergeValue(b[k], mine[k], theirs[k], path ? `${path}.${k}` : k);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    const b = Array.isArray(base) ? base : [];
    if (hasIds(mine) || hasIds(theirs) || hasIds(b)) return mergeById(b, mine, theirs, path);
    return mergeList(b, mine, theirs);
  }
  return clone(mine);
}

/** @returns {object} el personaje combinado */
export function mergeCharacters(base, mine, theirs) {
  if (!base) return clone(mine);
  return mergeValue(base, mine, theirs, '');
}
