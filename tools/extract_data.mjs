// One-shot migration script: converts the legacy JS data modules of the
// original project into clean JSON files for the new frontend.
// Uso: node extract_data.mjs <carpeta src/JS antigua> <index.html antiguo> <frontend/src/data>
// Requiere una copia de blood_creatures.js sin su línea de import, guardada como
// info--container/criaturas_sangre/blood_creatures.data.mjs (importa código con DOM).
// Sólo hace falta si se vuelve a migrar desde el proyecto original.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [legacyDir, legacyHtml, outDir] = process.argv.slice(2);
const imp = (p) => import(pathToFileURL(path.join(legacyDir, p)).href);

const C = await imp('Globales/constantes.js');
const classes = await imp('info--container/clases_clase/index_clase.js');
const artifice = await imp('info--container/clases_clase/clase-artifice.js');
const { RAZAS_POR_MANUAL } = await imp('info--container/razas-catalogo.js');

fs.mkdirSync(path.join(outDir, 'classes'), { recursive: true });
const write = (name, data) =>
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(data, null, 2) + '\n');

// ── Races ───────────────────────────────────────────────────────────────
const races = C.raceBonuses;
write('races.json', races);

// Catalog names that did not match any race key in the legacy data.
const CATALOG_FIXES = {
  'Goblins': 'Goblin',
  'Hobgoblins': 'Hobgoblin',
  'Tiflin (Mefeistofeles)': 'Tiflin (Mefistofeles)',
  'Cambiantes': 'Cambiante (RLW)',
  'Elfo (Aereni)': 'Alto Elfo (Aereni)',
  'Elfo (Valenar)': 'Elfo del bosque (Valenar)',
  'Grungs (GPE)': 'Grung (GPE)',
  'Verdan': 'Verdan (IA)',
  'Sram (Clase Compuesta)': 'Sram',
  'Oso Despertado (Pardo)': 'Oso (Despertado Pardo)',
  'Oso Despertado (Negro)': 'Oso (Despertado Negro)',
  'Oso (Pandaros)': 'Oso (Pandawa)',
};
const cazasalvaje = ['Cambiante (Cazasalvaje - Arcano 1)', 'Cambiante (Cazasalvaje - Arcano 2)'];
const catalog = [];
const placed = new Set();
const dropped = [];
for (const [source, names] of Object.entries(RAZAS_POR_MANUAL)) {
  const keys = [];
  for (const raw of names) {
    let key = CATALOG_FIXES[raw] ?? raw;
    if (raw === 'Cambiante (Cazasalvaje)') key = cazasalvaje.shift();
    if (!key || !races[key]) { dropped.push(raw); continue; }
    if (placed.has(key)) continue; // legacy catalog had duplicates
    placed.add(key);
    keys.push(key);
  }
  if (keys.length) catalog.push({ source, races: keys });
}
const orphans = Object.keys(races).filter((k) => !placed.has(k));
if (orphans.length) catalog.push({ source: 'Otras razas', races: orphans });
write('race-catalog.json', catalog);
write('race-tags.json', C.razaEtiquetas);
write('race-badges.json', C.badgesPorRaza);

// ── Classes ─────────────────────────────────────────────────────────────
const allClasses = { ...classes, claseArtifice: artifice.claseArtifice };
const classIndex = [];
for (const cls of Object.values(allClasses)) {
  if (!cls?.claseName) continue;
  write(`classes/${cls.claseName}.json`, cls);
  classIndex.push(cls.claseName);
}

// ── Spells, feats, epic boons, languages ────────────────────────────────
write('spells.json', C.conjurosData);
write('feats.json', C.doteEleccion);
write('epic-boons.json', C.bendicionEleccion);
write('languages.json', C.idiomasDisponibles);

// ── Blood creatures: strip the embedded HTML into structured fields ─────
const blood = await import(pathToFileURL(path.join(legacyDir, 'info--container/criaturas_sangre/blood_creatures.data.mjs')).href);
const stripTags = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const creatures = {};
for (const [id, c] of Object.entries(blood.criaturasDeSangre)) {
  if (!c.nombre) continue;
  const m = /<span[^>]*>(.*?)<\/span>\s*—\s*([\s\S]*)/.exec(c.ataque || '');
  creatures[id] = {
    name: c.nombre,
    damage: c['daño'],
    hpPercent: /vida_creature_max/.test(c.vida || '') ? 75 : 50,
    attackName: m ? stripTags(m[1]).replace(/^"|"$/g, '') : '',
    attack: m ? stripTags(m[2]) : stripTags(c.ataque),
    amplification: c.ampliacion,
    quirk: c.peculiaridad,
    requirement: c.requisito,
  };
}
write('blood-creatures.json', creatures);

// ── Rules reference (actions / conditions) from the legacy HTML ─────────
const html = fs.readFileSync(legacyHtml, 'utf8').replace(/\r/g, '');
const start = html.indexOf('id="content__two--acciones"');
const end = html.indexOf('id="content__two--creatures"');
const sec = html.slice(start, end);
const decode = (s) => s.replace(/&times;/g, '×').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
const modalText = {};
for (const m of sec.matchAll(/id="modal-([^"]+)"[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)<\/div>\s*<\/div>/g)) {
  const body = [...m[3].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((p) => decode(stripTags(p[1].replace(/<br\s*\/?>/g, '\n'))));
  modalText[m[1]] = { title: decode(stripTags(m[2])), text: body.join('\n\n') };
}
const groups = [];
const headRe = /<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g;
const heads = [...sec.matchAll(headRe)];
heads.forEach((h, i) => {
  const chunk = sec.slice(h.index, heads[i + 1]?.index ?? sec.length);
  const items = [];
  const seen = new Set();
  for (const l of chunk.matchAll(/data-modal="([^"]+)">\s*<div class="contenido__accion">\s*<label class="label">([\s\S]*?)<\/label>/g)) {
    if (!l[1] || seen.has(l[1])) continue;
    seen.add(l[1]);
    const t = modalText[l[1]];
    items.push({ id: l[1], name: decode(stripTags(l[2])), text: t?.text ?? '' });
  }
  groups.push({ title: decode(stripTags(h[1])), intro: decode(stripTags(h[2])), items });
});
write('rules-reference.json', groups);

console.log(JSON.stringify({
  races: Object.keys(races).length,
  catalogGroups: catalog.length,
  droppedFromCatalog: dropped,
  orphanRaces: orphans,
  classes: classIndex,
  spells: Object.keys(C.conjurosData).length,
  feats: Object.keys(C.doteEleccion).length,
  creatures: Object.keys(creatures).length,
  referenceGroups: groups.map((g) => `${g.title}: ${g.items.length} (${g.items.filter((i) => !i.text).length} sin texto)`),
}, null, 1));
