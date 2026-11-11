// Formato de las elecciones de rasgos en los JSON de clase («listasDeEleccion»
// y «elegir»). Sin dependencias de los datos de la app, para que el validador
// funcione también desde la consola (node tools/check_classes.mjs).
// Documentación: docs/plantillas/CLASES.md («Elecciones»).

import { SKILL_NAMES } from '../domain/constants.js';
import { normalizeEffects } from '../domain/effects.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** Tipo de origen de una lista (`opciones` si trae su propia lista). */
export function listSource(def) {
  if (def?.libre === true) return 'libre';
  if (def?.desde === 'habilidades' || def?.desde === 'conjuros') return def.desde;
  return 'opciones';
}

/** Comprobación del formato de datos (la usa el validador de clases). */
export function checkChoiceData(cls, err) {
  const checkLists = (path, obj) => {
    if (obj === undefined) return;
    if (!isObject(obj)) { err(path, 'objeto { "id-lista": { "titulo", … } }'); return; }
    for (const [id, def] of Object.entries(obj)) {
      const p = `${path}.${id}`;
      if (!/^[a-z0-9_-]{1,60}$/.test(id)) err(p, 'el id de la lista va en minúsculas y sin espacios (se guarda en la ficha)');
      if (!isObject(def) || typeof def.titulo !== 'string' || !def.titulo.trim()) { err(p, 'necesita "titulo"'); continue; }
      const src = listSource(def);
      if (def.desde !== undefined && !['habilidades', 'conjuros'].includes(def.desde)) err(`${p}.desde`, '"habilidades" o "conjuros" (o "opciones" propias / "libre": true)');
      if (src === 'opciones') {
        if (!Array.isArray(def.opciones) || !def.opciones.length) err(`${p}.opciones`, 'lista de { "id", "nombre", "descripcion" } (o usa "libre": true / "desde")');
        const ids = new Set();
        (def.opciones ?? []).forEach((o, i) => {
          if (!isObject(o) || !o.id || typeof o.nombre !== 'string') err(`${p}.opciones[${i}]`, 'necesita "id" y "nombre"');
          else if (ids.has(o.id)) err(`${p}.opciones[${i}]`, `id repetido: ${o.id}`);
          else ids.add(o.id);
          if (o?.efectos !== undefined && normalizeEffects(o.efectos).length !== (o.efectos?.length ?? 0)) err(`${p}.opciones[${i}].efectos`, 'efecto no válido');
          if (o?.requisitos !== undefined) {
            const r = o.requisitos;
            const okLevel = r?.nivel === undefined || (Number.isInteger(r.nivel) && r.nivel >= 1 && r.nivel <= 20);
            const ops = r?.opcion === undefined ? [] : Array.isArray(r.opcion) ? r.opcion : [r.opcion];
            if (!isObject(r) || !okLevel) err(`${p}.opciones[${i}].requisitos`, '{ "nivel": 5, "opcion": "id-de-otra-opcion" }');
            for (const id of ops) if (!(def.opciones ?? []).some((x) => x?.id === id)) err(`${p}.opciones[${i}].requisitos.opcion`, `no existe la opción «${id}» en esta lista`);
          }
          if (o?.repetible !== undefined && typeof o.repetible !== 'boolean') err(`${p}.opciones[${i}].repetible`, 'true/false');
          if (typeof o?.id === 'string' && o.id.includes('~')) err(`${p}.opciones[${i}].id`, 'el id no puede contener «~»');
          (Array.isArray(o?.efectos) ? o.efectos : []).forEach((e, j) => {
            if (e?.nivel !== undefined && !(Number.isInteger(e.nivel) && e.nivel >= 1 && e.nivel <= 20)) err(`${p}.opciones[${i}].efectos[${j}].nivel`, 'nivel de clase 1–20 desde el que se aplica');
          });
        });
      }
      if (src === 'habilidades' && def.de !== 'cualquiera' && (!Array.isArray(def.de) || def.de.some((s) => !SKILL_NAMES.includes(s)))) {
        err(`${p}.de`, 'lista de habilidades de la app o "cualquiera"');
      }
      const claseOk = typeof def.clase === 'string' || (Array.isArray(def.clase) && def.clase.length && def.clase.every((x) => typeof x === 'string'));
      if (src === 'conjuros' && (!claseOk || (def.niveles !== undefined && (!Array.isArray(def.niveles) || def.niveles.some((n) => !Number.isInteger(n) || n < 0 || n > 9))))) {
        err(p, '{ "desde": "conjuros", "clase": "mago" | ["clerigo", "druida"], "niveles": [0] } (0 = trucos)');
      }
      if (def.nivelMax !== undefined && (src !== 'conjuros' || def.nivelMax !== 'espacios')) {
        err(`${p}.nivelMax`, 'sólo en listas de conjuros: "espacios" (el máximo según los espacios de la clase)');
      }
      for (const k of ['libroConjuros']) {
        if (def[k] !== undefined && (src !== 'conjuros' || typeof def[k] !== 'boolean')) err(`${p}.${k}`, 'sólo en listas de conjuros: true/false');
      }
      if (def.escuela !== undefined && (src !== 'conjuros' || typeof def.escuela !== 'string')) err(`${p}.escuela`, 'sólo en listas de conjuros: nombre de la escuela (p. ej. "Abjuración")');
      if (def.siemprePreparados !== undefined && (src !== 'conjuros' || typeof def.siemprePreparados !== 'boolean')) {
        err(`${p}.siemprePreparados`, 'sólo en listas de conjuros: true/false');
      }
      if (def.efectoLibre !== undefined && (src !== 'libre' || !normalizeEffects([{ ...def.efectoLibre, value: 'x' }]).length)) {
        err(`${p}.efectoLibre`, 'sólo en listas "libre": { "type": "competencia", "kind": "herramienta" }');
      }
    }
  };
  checkLists('listasDeEleccion', cls.listasDeEleccion);
  for (const l of Object.values(cls.niveles ?? {})) {
    for (const [k, s] of Object.entries(l?.subClase ?? {})) checkLists(`subClase.${k}.listasDeEleccion`, s?.listasDeEleccion);
  }
  const classLists = new Set(Object.keys(cls.listasDeEleccion ?? {}));
  const checkGrant = (path, g, allowed) => {
    for (const [i, x] of asList(g).entries()) {
      const p = Array.isArray(g) ? `${path}[${i}]` : path;
      if (!isObject(x) || typeof x.lista !== 'string') { err(p, '{ "lista": "id", "cantidad": 1 }'); continue; }
      if (!allowed.has(x.lista)) err(`${p}.lista`, `no existe la lista «${x.lista}» en "listasDeEleccion"`);
      if (!Number.isInteger(x.cantidad) || x.cantidad < 0) err(`${p}.cantidad`, 'número entero (0 o más)');
      if (x.reemplazar !== undefined && (!Number.isInteger(x.reemplazar) || x.reemplazar < 0)) err(`${p}.reemplazar`, 'número entero');
      if (x.nivelMax !== undefined && x.nivelMax !== 'espacios' && (!Number.isInteger(x.nivelMax) || x.nivelMax < 0 || x.nivelMax > 9)) err(`${p}.nivelMax`, 'nivel de conjuro 0–9 o "espacios"');
      if (x.multiclase !== undefined && (!Number.isInteger(x.multiclase) || x.multiclase < 0)) err(`${p}.multiclase`, 'número entero (cuántas si la clase se toma como multiclase)');
    }
  };
  let grants = 0;
  // Elecciones que abre una opción elegida (`opciones[].elegir`).
  const optionGrants = (lists, allowed, path) => {
    for (const [id, def] of Object.entries(isObject(lists) ? lists : {})) {
      (Array.isArray(def?.opciones) ? def.opciones : []).forEach((o, i) => {
        if (o?.elegir !== undefined) { grants++; checkGrant(`${path}.${id}.opciones[${i}].elegir`, o.elegir, allowed); }
      });
    }
  };
  optionGrants(cls.listasDeEleccion, classLists, 'listasDeEleccion');
  for (const l of Object.values(cls.niveles ?? {})) {
    for (const [sk, s] of Object.entries(l?.subClase ?? {})) {
      optionGrants(s?.listasDeEleccion, new Set([...classLists, ...Object.keys(s?.listasDeEleccion ?? {})]), `subClase.${sk}.listasDeEleccion`);
    }
  }
  for (const [n, l] of Object.entries(cls.niveles ?? {})) {
    if (l?.elegir !== undefined) { grants++; checkGrant(`niveles.${n}.elegir`, l.elegir, classLists); }
    for (const [k, b] of Object.entries(l?.infoBlock ?? {})) if (b?.elegir !== undefined) { grants++; checkGrant(`niveles.${n}.infoBlock.${k}.elegir`, b.elegir, classLists); }
    for (const [sk, s] of Object.entries(l?.subClase ?? {})) {
      const allowed = new Set([...classLists, ...Object.keys(s?.listasDeEleccion ?? {})]);
      for (const [lvl, sn] of Object.entries(s?.subNivel ?? {})) {
        if (sn?.elegir !== undefined) { grants++; checkGrant(`niveles.${n}.subClase.${sk}.subNivel.${lvl}.elegir`, sn.elegir, allowed); }
        for (const [bk, b] of Object.entries(sn?.infoSubBlock ?? {})) {
          if (b?.elegir !== undefined) { grants++; checkGrant(`niveles.${n}.subClase.${sk}.subNivel.${lvl}.infoSubBlock.${bk}.elegir`, b.elegir, allowed); }
        }
      }
    }
  }
  return grants;
}
