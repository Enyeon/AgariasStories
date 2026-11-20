// Validador de los datos de RAZAS (races.json, race-catalog.json, race-lore.json).
//
// Sirve para añadir razas a mano (p. ej. las de Agarias Pt. V: Aliens) sin
// romper la ficha. Distingue ERRORES (algo que la app no podría usar) de AVISOS
// (funciona, pero falta algo). Lo usan las pruebas.
//
// Campos opcionales de una raza (AgSt 1.30), además de los de siempre:
//   linaje            id de su historia en race-lore.json (la comparten todas sus variantes)
//   tipo              tipo de criatura («Humanoide», «Monstruosidad»…)
//   tamano            «Pequeño», «Mediano» o «Pequeño o Mediano»
//   origen            de dónde viene (planeta, plano, Agarias…)
//   descripcion       una o dos frases para el selector y «Leer más»
//   anatomiaDraconica true → el jugador elige alas y cola (dracónidos)
//   pisoMinimo        Lord 100: piso desde el que aparece en la Tienda

const ABILITIES = ['fuerza', 'destreza', 'constitucion', 'inteligencia', 'sabiduria', 'carisma'];
const SIZES = ['Diminuto', 'Pequeño', 'Mediano', 'Pequeño o Mediano', 'Grande'];
const isText = (v) => typeof v === 'string' && v.trim().length > 0;

export function validateRaceData({ races, catalog, lore, classKeys = null }) {
  const errors = [];
  const warnings = [];
  const loreIds = new Set(Object.keys(lore).filter((k) => !k.startsWith('$')));

  const listed = new Set();
  for (const g of catalog) {
    if (!isText(g.source) || !Array.isArray(g.races)) { errors.push(`Grupo del catálogo mal formado: ${JSON.stringify(g).slice(0, 80)}`); continue; }
    for (const r of g.races) {
      if (!Object.hasOwn(races, r)) errors.push(`El catálogo «${g.source}» lista «${r}», que no existe en races.json.`);
      if (listed.has(r)) warnings.push(`«${r}» aparece en más de un grupo del catálogo.`);
      listed.add(r);
    }
  }

  for (const [name, r] of Object.entries(races)) {
    const where = `Raza «${name}»`;
    if (!r || typeof r !== 'object') { errors.push(`${where}: no es un objeto.`); continue; }
    if (r.velocidad != null && !Number.isFinite(r.velocidad)) errors.push(`${where}: velocidad no numérica.`);
    for (const k of ABILITIES) if (r[k] != null && !Number.isFinite(r[k])) errors.push(`${where}: «${k}» no es un número.`);
    if (r.linaje != null) {
      if (!/^[a-z0-9-]{2,60}$/.test(r.linaje)) errors.push(`${where}: linaje «${r.linaje}» no válido (minúsculas, números y guiones).`);
      else if (!loreIds.has(r.linaje)) warnings.push(`${where}: su linaje «${r.linaje}» aún no tiene historia en race-lore.json.`);
    }
    if (r.tamano != null && !SIZES.includes(r.tamano)) errors.push(`${where}: tamaño «${r.tamano}» desconocido.`);
    for (const k of ['tipo', 'origen', 'descripcion']) if (r[k] != null && !isText(r[k])) errors.push(`${where}: «${k}» debe ser texto.`);
    if (r.anatomiaDraconica != null && typeof r.anatomiaDraconica !== 'boolean') errors.push(`${where}: anatomiaDraconica debe ser true/false.`);
    if (r.pisoMinimo != null && !(Number.isInteger(r.pisoMinimo) && r.pisoMinimo >= 1 && r.pisoMinimo <= 100)) errors.push(`${where}: pisoMinimo debe ser un piso de 1 a 100.`);
    if (!isText(r.info)) warnings.push(`${where}: sin texto de rasgos (info).`);
    if (r.claseRecomendada != null && (!isText(r.claseRecomendada) || (classKeys && !classKeys.includes(r.claseRecomendada)))) errors.push(`${where}: claseRecomendada «${r.claseRecomendada}» no es una clase.`);
  }

  for (const id of loreIds) {
    const l = lore[id];
    const where = `Historia «${id}»`;
    if (!isText(l?.nombre)) errors.push(`${where}: falta «nombre».`);
    if (!Array.isArray(l?.secciones) || !l.secciones.length) errors.push(`${where}: necesita al menos una sección.`);
    else for (const s of l.secciones) if (!isText(s?.texto)) errors.push(`${where}: hay una sección sin texto.`);
    for (const rel of l?.relacionadas ?? []) if (!loreIds.has(rel)) warnings.push(`${where}: relacionada «${rel}» no existe.`);
    if (!Object.values(races).some((r) => r.linaje === id)) warnings.push(`${where}: ninguna raza la usa.`);
  }
  return { errors, warnings };
}
