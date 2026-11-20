// Pies y casillas (AgSt 1.38). Regla de la mesa: 1 casilla = 5 pies.
// Toda distancia en pies se muestra con sus casillas: «30 pies (6 casillas)».
// Es el equivalente de tools/casillas.py (que ya lo aplica a los datos); aquí
// sirve para los números de la ficha y para el texto que escriben los usuarios
// (Homebrew, notas). Es idempotente: no duplica anotaciones.

/** «30» → «30 pies (6 casillas)»; si no es múltiplo de 5, sólo «N pies». */
export function feetLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  if (v > 0 && v % 5 === 0) return `${v} pies (${v / 5} ${v === 5 ? 'casilla' : 'casillas'})`;
  return `${v} ${v === 1 ? 'pie' : 'pies'}`;
}

const SEP = String.raw`\s*[/×x]\s*`;
const RX = new RegExp(
  String.raw`(?<![\d.,/×x])(\d+(?:${SEP}\d+)*)(\s+)(pies|pie)\b(?!\s+c[úu]bic|\s+cuadrad)(\s*\(([^()]*)\))?`,
  'g',
);

function cells(expr) {
  const parts = expr.split(new RegExp(`(${SEP})`));
  const nums = parts.filter((_, i) => i % 2 === 0).map(Number);
  const seps = parts.filter((_, i) => i % 2 === 1);
  if (nums.some((v) => !v || v % 5)) return null;
  let out = String(nums[0] / 5);
  seps.forEach((s, i) => { out += (s.includes('/') ? '/' : ' × ') + nums[i + 1] / 5; });
  return `${out} ${nums.length === 1 && nums[0] === 5 ? 'casilla' : 'casillas'}`;
}

/** Añade «(N casillas)» tras cada distancia en pies que aún no lo tenga. */
export function withCells(text) {
  if (!text || !/pie/.test(text)) return text;
  return String(text).replace(RX, (all, expr, space, word, paren, inner) => {
    const label = cells(expr);
    if (!label) return all;
    const head = `${expr}${space}${word}`;
    if (paren === undefined) return `${head} (${label})`;
    if (/casil/i.test(inner)) return all;
    return `${head} (${label})${paren}`;
  });
}
