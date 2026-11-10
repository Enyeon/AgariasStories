// Validador del formato JSON de las CLASES (frontend/src/data/classes/*.json).
//
// Es el mismo formato que usa el motor (no hay una estructura paralela). Sirve
// para comprobar una clase escrita a mano antes de añadirla:
//   - en las pruebas (todas las clases del proyecto y la plantilla);
//   - desde la consola:  node tools/check_classes.mjs [carpeta-o-archivo …]
//
// Distingue ERRORES (la clase no funcionaría o rompería la ficha) de AVISOS
// (funciona, pero falta información o hay algo que el motor no automatiza).
// Plantilla documentada: docs/plantillas/clase-plantilla.json y docs/plantillas/CLASES.md

import { ABILITY_KEYS, SKILL_NAMES } from '../domain/constants.js';
import { normalizeEffect } from '../domain/effects.js';

const SECTIONS = ['manual', 'tasha', 'agarias', 'homebrew'];
const PROGRESSIONS = ['full', 'half', 'artificer', 'pact'];
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string';

/**
 * @param {object} cls  contenido del JSON
 * @param {{ file?: string }} [opts]
 * @returns {{ ok: boolean, errors: string[], warnings: string[], stats: object }}
 */
export function validateClassData(cls, { file = '' } = {}) {
  const errors = [];
  const warnings = [];
  const where = (path) => (file ? `${file} → ${path}` : path);
  const err = (path, msg) => errors.push(`${where(path)}: ${msg}`);
  const warn = (path, msg) => warnings.push(`${where(path)}: ${msg}`);
  const stats = { levels: 0, features: 0, subclasses: 0, subFeatures: 0, effects: 0, textOnlyFeatures: 0 };

  if (!isObject(cls)) return { ok: false, errors: [where('raíz') + ': no es un objeto JSON'], warnings, stats };

  // ── Identidad ──
  if (!isText(cls.nombre) || !cls.nombre.trim()) err('nombre', 'obligatorio (nombre visible de la clase)');
  if (!isText(cls.claseName) || !/^[a-z0-9_-]{2,40}$/.test(cls.claseName)) {
    err('claseName', 'obligatorio: identificador estable en minúsculas, sin espacios (p. ej. "guerrero"). No lo cambies una vez haya personajes que usen la clase');
  }
  if (!SECTIONS.includes(cls.seccion)) err('seccion', `debe ser uno de: ${SECTIONS.join(', ')}`);
  if (![6, 8, 10, 12].includes(Number(cls.dadoDeGolpe))) err('dadoDeGolpe', 'debe ser 6, 8, 10 o 12 (número, sin «d»)');
  if (cls.icono !== undefined && (!isText(cls.icono) || cls.icono.length > 8)) warn('icono', 'debe ser un emoji corto');

  // ── Mejoras de característica ──
  if (!Array.isArray(cls.nivelesDeAumento) || cls.nivelesDeAumento.some((n) => !Number.isInteger(n) || n < 1 || n > 20)) {
    err('nivelesDeAumento', 'lista de niveles (1–20) con «Mejora de característica o dote»; oficial: [4, 8, 12, 16, 19]');
  }

  // ── Competencias ──
  const checkProfBlock = (path, block, { primary }) => {
    if (!isObject(block)) { err(path, 'falta (usa { "pendiente": true } si aún no se conoce)'); return; }
    if (block.pendiente === true) { warn(path, 'pendiente: la ficha mostrará «pendiente de definir»'); return; }
    for (const k of ['armaduras', 'armas', 'herramientas']) {
      if (!Array.isArray(block[k]) || block[k].some((x) => !isText(x))) err(`${path}.${k}`, 'lista de textos');
    }
    if (primary) {
      if (!Array.isArray(block.salvaciones) || block.salvaciones.some((a) => !ABILITY_KEYS.includes(a))) {
        err(`${path}.salvaciones`, `lista de atributos (${ABILITY_KEYS.join(', ')})`);
      }
      const total = (block.salvaciones?.length ?? 0) + (Number(block.salvacionesElegir?.elegir) || 0);
      if (total !== 2) warn(`${path}.salvaciones`, `las clases oficiales dan 2 salvaciones (aquí ${total})`);
    }
    const h = block.habilidades;
    if (h !== null && h !== undefined) {
      if (!isObject(h) || !Number.isInteger(h.elegir) || h.elegir < 0) err(`${path}.habilidades.elegir`, 'número entero');
      else if (h.de !== 'cualquiera' && (!Array.isArray(h.de) || h.de.some((s) => !SKILL_NAMES.includes(s)))) {
        const bad = Array.isArray(h.de) ? h.de.filter((s) => !SKILL_NAMES.includes(s)) : [];
        err(`${path}.habilidades.de`, `"cualquiera" o una lista de habilidades válidas${bad.length ? ` (no reconocidas: ${bad.join(', ')})` : ''}`);
      }
    }
  };
  checkProfBlock('competencias', cls.competencias, { primary: true });
  checkProfBlock('competenciasMulticlase', cls.competenciasMulticlase, { primary: false });
  if (cls.equipoInicial !== undefined && (!Array.isArray(cls.equipoInicial) || cls.equipoInicial.some((x) => !isText(x)))) err('equipoInicial', 'lista de textos');

  // ── Conjuros ──
  if (cls.conjurador === true) {
    if (!ABILITY_KEYS.includes(cls.attribute)) err('attribute', 'un lanzador necesita su atributo de lanzamiento');
    if (cls.lanzamiento !== undefined && cls.lanzamiento !== null) {
      const l = cls.lanzamiento;
      if (!isObject(l) || !PROGRESSIONS.includes(l.progression)) err('lanzamiento.progression', `uno de: ${PROGRESSIONS.join(', ')}`);
      if (l?.preparedFrom !== undefined && l.preparedFrom !== null && !['full', 'half'].includes(l.preparedFrom)) err('lanzamiento.preparedFrom', '"full", "half" o null');
      for (const k of ['cantripsKnown', 'spellsKnown']) {
        if (l?.[k] !== undefined && (!Array.isArray(l[k]) || l[k].length !== 20)) err(`lanzamiento.${k}`, 'lista de 20 números (uno por nivel)');
      }
    } else {
      warn('lanzamiento', 'sin tabla de espacios: las clases oficiales la tienen en domain/spellcasting.js; una clase nueva debe declarar "lanzamiento"');
    }
  }
  if (cls.listaConjuros !== undefined && (!Array.isArray(cls.listaConjuros) || cls.listaConjuros.some((x) => !isText(x)))) {
    err('listaConjuros', 'lista de nombres de conjuro (tal como aparecen en el catálogo)');
  }
  if (cls.cdClase !== undefined && (!isObject(cls.cdClase) || !Array.isArray(cls.cdClase.atributos) || cls.cdClase.atributos.some((a) => !ABILITY_KEYS.includes(a)))) {
    err('cdClase', '{ "nombre": "…", "atributos": ["carisma", …] }');
  }
  if (cls.pericias !== undefined && (!isObject(cls.pericias) || Object.entries(cls.pericias).some(([k, v]) => !(Number(k) >= 1 && Number(k) <= 20) || !Number.isInteger(v)))) {
    err('pericias', '{ "nivel": cantidad } (p. ej. { "1": 2, "6": 2 })');
  }

  // ── Niveles ──
  const checkEffects = (path, list) => {
    if (list === undefined) return 0;
    if (!Array.isArray(list)) { err(path, 'lista de efectos'); return 0; }
    let ok = 0;
    list.forEach((e, i) => {
      if (normalizeEffect(e)) ok++;
      else err(`${path}[${i}]`, `efecto no válido o desconocido: ${JSON.stringify(e)} (ver domain/effects.js)`);
    });
    return ok;
  };
  if (!isObject(cls.niveles)) {
    err('niveles', 'objeto { "1": {…}, …, "20": {…} }');
  } else {
    let subclassLevels = 0;
    for (let n = 1; n <= 20; n++) {
      const l = cls.niveles[n];
      if (!l) { warn(`niveles.${n}`, 'falta el nivel (la ficha avisará de que faltan datos)'); continue; }
      stats.levels++;
      if (n === 1) {
        if (!isText(l.descripcion) || !l.descripcion.trim()) warn('niveles.1.descripcion', 'resumen de una línea de la clase');
        if (!isText(l.atributoInicial) || !l.atributoInicial.trim()) warn('niveles.1.atributoInicial', 'texto de «Atributos de clase» (se copia a las notas de la ficha)');
      }
      if (l.infoCubo !== undefined) {
        const cube = l.infoCubo;
        if (!isObject(cube) || !Array.isArray(cube.columnas) || !Array.isArray(cube.filas) || !Array.isArray(cube.filas[0])
          || cube.filas[0].length !== cube.columnas.length) {
          err(`niveles.${n}.infoCubo`, '{ "columnas": [...], "filas": [[...]] } con el mismo número de valores que columnas');
        }
      }
      if (l.infoBlock !== undefined) {
        if (!isObject(l.infoBlock)) err(`niveles.${n}.infoBlock`, 'objeto de rasgos');
        let empty = 0;
        for (const [k, b] of Object.entries(isObject(l.infoBlock) ? l.infoBlock : {})) {
          // Bloques vacíos de relleno (sin nombre ni texto): el motor los ignora.
          if (isObject(b) && !String(b.name ?? '').trim() && !String(b.descripcion ?? '').trim()) { empty++; continue; }
          if (!isObject(b) || !isText(b.name) || !b.name.trim()) { err(`niveles.${n}.infoBlock.${k}`, 'cada rasgo necesita "name" y "descripcion"'); continue; }
          if (!isText(b.descripcion)) err(`niveles.${n}.infoBlock.${k}.descripcion`, 'texto');
          stats.features++;
          const fx = checkEffects(`niveles.${n}.infoBlock.${k}.efectos`, b.efectos);
          stats.effects += fx;
          if (!fx) stats.textOnlyFeatures++;
        }
        if (empty) warn(`niveles.${n}.infoBlock`, `${empty} rasgo(s) vacíos de relleno (se ignoran; bórralos o complétalos)`);
      }
      if (l.requeridoTrue !== undefined) {
        const r = l.requeridoTrue;
        const amount = r?.statAmount ?? {};
        for (const [k, v] of Object.entries(amount)) {
          if (k === 'choice') {
            if (!Number.isInteger(v?.count) || !Number.isInteger(v?.bonus) || (v.allowedChoices && v.allowedChoices.some((a) => !ABILITY_KEYS.includes(a)))) {
              err(`niveles.${n}.requeridoTrue.statAmount.choice`, '{ "count": 1, "bonus": 2, "allowedChoices": [atributos] }');
            }
          } else if (!ABILITY_KEYS.includes(k) || !Number.isInteger(v)) {
            err(`niveles.${n}.requeridoTrue.statAmount.${k}`, 'atributo con un número entero');
          }
        }
        if (r?.statMax !== undefined && (!Array.isArray(r.statMax.activos) || !Number.isInteger(r.statMax.stat))) {
          err(`niveles.${n}.requeridoTrue.statMax`, '{ "activos": [atributos], "stat": 22 }');
        }
      }
      if (l.subClase !== undefined) {
        subclassLevels++;
        if (!isObject(l.subClase) || !Object.keys(l.subClase).length) { err(`niveles.${n}.subClase`, 'objeto con al menos una subclase'); continue; }
        for (const [k, s] of Object.entries(l.subClase)) {
          const p = `niveles.${n}.subClase.${k}`;
          if (!/^[a-z0-9_-]{1,60}$/.test(k)) err(p, 'la clave de la subclase debe ir en minúsculas y sin espacios (es lo que se guarda en la ficha)');
          if (!isObject(s) || !isText(s.subNombre) || !s.subNombre.trim()) { err(p, 'necesita "subNombre"'); continue; }
          stats.subclasses++;
          if (s.rasgosPendientes) warn(p, 'rasgos de la subclase pendientes de cargar');
          stats.effects += checkEffects(`${p}.efectos`, s.efectos);
          for (const [lvl, sn] of Object.entries(s.subNivel ?? {})) {
            if (!(Number(lvl) >= 1 && Number(lvl) <= 20)) err(`${p}.subNivel.${lvl}`, 'nivel 1–20');
            for (const [bk, b] of Object.entries(sn?.infoSubBlock ?? {})) {
              if (!isObject(b) || !isText(b.subName)) { err(`${p}.subNivel.${lvl}.infoSubBlock.${bk}`, 'necesita "subName" y "subDescripcion"'); continue; }
              stats.subFeatures++;
              const fx = checkEffects(`${p}.subNivel.${lvl}.infoSubBlock.${bk}.efectos`, b.efectos);
              stats.effects += fx;
              if (!fx) stats.textOnlyFeatures++;
            }
          }
        }
      }
    }
    if (subclassLevels > 1) err('niveles', 'sólo un nivel puede tener "subClase" (el nivel en que se elige)');
    if (!subclassLevels && !cls.subclasePendiente) warn('niveles', 'la clase no tiene subclases (si las tendrá, usa "subclasePendiente": true)');
  }

  return { ok: errors.length === 0, errors, warnings, stats };
}
