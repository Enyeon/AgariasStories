#!/usr/bin/env node
// Comprueba JSON de clases con el mismo validador que usa la app.
//
//   node tools/check_classes.mjs                      → todas las de frontend/src/data/classes
//   node tools/check_classes.mjs mis-clases/          → una carpeta
//   node tools/check_classes.mjs guerrero.json mago.json
//
// Muestra errores (la clase no funcionaría), avisos y un resumen de cuántos
// rasgos tienen efectos automáticos y cuántos son sólo texto.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateClassData } from '../frontend/src/content/class-data.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const targets = args.length ? args : [join(root, 'frontend/src/data/classes')];
const files = targets.flatMap((t) => {
  const p = resolve(t);
  return statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith('.json')).map((f) => join(p, f)) : [p];
});

let failed = 0;
const seen = new Map();
for (const file of files.sort()) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`✗ ${basename(file)}: JSON no válido (${e.message})`);
    failed++;
    continue;
  }
  const { ok, errors, warnings, stats } = validateClassData(data, { file: basename(file) });
  if (data?.claseName) {
    if (seen.has(data.claseName)) errors.push(`${basename(file)}: claseName "${data.claseName}" repetido (también en ${seen.get(data.claseName)})`);
    seen.set(data.claseName, basename(file));
  }
  const mark = ok && !errors.length ? (warnings.length ? '⚠' : '✓') : '✗';
  if (mark === '✗') failed++;
  console.log(`${mark} ${basename(file)} — ${data?.nombre ?? '?'}: ${stats.levels}/20 niveles, ${stats.features} rasgos, ${stats.subclasses} subclases (${stats.subFeatures} rasgos), ${stats.effects} efectos automáticos, ${stats.textOnlyFeatures} rasgos sólo texto${stats.choices ? `, ${stats.choices} elecciones` : ""}`);
  for (const e of errors) console.log(`    ERROR  ${e}`);
  if (process.env.VERBOSE || args.length) for (const w of warnings) console.log(`    aviso  ${w}`);
  else if (warnings.length) console.log(`    ${warnings.length} aviso(s) (VERBOSE=1 para verlos)`);
}
process.exit(failed ? 1 : 0);
