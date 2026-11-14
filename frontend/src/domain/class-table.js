/**
 * Tablas de progresión de las clases (`infoCubo`).
 *
 * Una tabla sólo se declara en el nivel donde cambia: los niveles siguientes
 * heredan la última declarada. Todo el que lea la tabla de un nivel debe usar
 * `cubeAt` en vez de `niveles[n].infoCubo`.
 */

/** Tabla vigente en un nivel: la última declarada en ese nivel o antes. */
export function cubeAt(cls, level) {
  for (let n = Number(level); n >= 1; n--) {
    const cube = cls?.niveles?.[n]?.infoCubo;
    if (cube?.columnas?.some(Boolean)) return cube;
  }
  return null;
}

/** Valor de una columna en un nivel (texto), o '' si la columna no existe. */
export function cubeValue(cls, level, column) {
  const cube = cubeAt(cls, level);
  const i = cube?.columnas?.indexOf(column) ?? -1;
  return i >= 0 ? String(cube.filas?.[0]?.[i] ?? '') : '';
}

/** Fila «plana» de una tabla: { columna: valor }. */
export function cubeRow(cube) {
  const row = {};
  (cube?.columnas ?? []).forEach((col, i) => { if (col) row[col] = cube.filas?.[0]?.[i] ?? ''; });
  return row;
}

/** ¿Dos tablas dicen lo mismo? (para no repetir filas iguales) */
export function sameCube(a, b) {
  return JSON.stringify(cubeRow(a)) === JSON.stringify(cubeRow(b));
}
