// Editor genérico de contenido Homebrew.
//
// El formulario se genera a partir de FORMS (una lista de campos por tipo), y el
// resultado pasa por validateContent: lo mismo que se aplica al contenido que
// llega de una campaña o de un archivo. Para un tipo nuevo basta con añadir su
// lista de campos aquí y su normalizador en content/schema.js.

import { html, raw, setHtml, getPath, setPath } from '../../ui/dom.js';
import { openDialog, trackChanges } from '../../ui/feedback.js';
import { saveDraft, loadDraft, clearDraft, debounced } from '../../ui/drafts.js';
import { ABILITY_KEYS, ABILITY_LABEL, SKILL_NAMES } from '../../domain/constants.js';
import { DAMAGE_TYPES, CONDITIONS } from '../../domain/effects.js';
import {
  CONTENT_TYPES, CASTER_KINDS, EXTENSION_ACCESS, EXTENSION_KINDS, validateContent, emptyContent,
} from '../../content/schema.js';
import { TRAIT_ORIGINS } from '../../domain/proficiencies.js';
import { listClasses } from '../../data/index.js';
import { effectsFieldset, bindEffectsEditor, readEffects } from './effects-editor.js';
import { WORLD_FORMS } from './world-forms.js';

const ABILITY_OPTIONS = Object.fromEntries(ABILITY_KEYS.map((k) => [k, ABILITY_LABEL[k]]));
const DAMAGE_OPTIONS = Object.fromEntries(DAMAGE_TYPES.map((d) => [d.key, d.official ? d.label : `${d.label} (Agarias)`]));
const CONDITION_OPTIONS = Object.fromEntries(CONDITIONS.map((c) => [c, c]));
const SKILL_OPTIONS = Object.fromEntries(SKILL_NAMES.map((s) => [s, s]));
const slug = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const COMMON_HEAD = [
  { key: 'name', label: 'Nombre *', kind: 'text', required: true },
  { key: 'description', label: 'Descripción', kind: 'textarea', rows: 4 },
];
const SOURCE = { key: 'source', label: 'Fuente o autor (opcional)', kind: 'text', placeholder: 'Ej.: Homebrew de la mesa de los jueves' };

/** Campos de cada tipo. `section` agrupa visualmente. */
export const FORMS = {
  clase: [
    ...COMMON_HEAD,
    { section: 'Básicos' },
    { key: 'hitDie', label: 'Dado de golpe', kind: 'select', options: { 6: 'd6', 8: 'd8', 10: 'd10', 12: 'd12' }, number: true },
    { key: 'caster', label: 'Lanzamiento de conjuros', kind: 'select', options: CASTER_KINDS },
    { key: 'spellAbility', label: 'Atributo de lanzamiento', kind: 'select', options: ABILITY_OPTIONS, empty: '— Ninguno —' },
    { key: 'asiLevels', label: 'Niveles con mejora de atributo', kind: 'numbers', hint: 'Separados por comas. Oficial: 4, 8, 12, 16, 19.' },
    { section: 'Competencias' },
    { key: 'saves', label: 'Tiradas de salvación (2)', kind: 'chips', options: ABILITY_OPTIONS, max: 2 },
    { key: 'armor', label: 'Armaduras', kind: 'list', hint: 'Separadas por comas: Armadura ligera, Escudos' },
    { key: 'weapons', label: 'Armas', kind: 'list' },
    { key: 'tools', label: 'Herramientas', kind: 'list' },
    { key: 'skills.count', label: 'Habilidades a elegir', kind: 'number', min: 0, max: 18 },
    { key: 'skills.any', label: 'Puede elegir cualquier habilidad', kind: 'checkbox' },
    { key: 'skills.options', label: 'Lista de habilidades', kind: 'chips', options: SKILL_OPTIONS },
    { key: 'multiclass.armor', label: 'Multiclase: armaduras', kind: 'list' },
    { key: 'multiclass.weapons', label: 'Multiclase: armas', kind: 'list' },
    { key: 'multiclass.tools', label: 'Multiclase: herramientas', kind: 'list' },
    { section: 'Equipo inicial' },
    { key: 'equipment', label: 'Equipo (una opción por línea)', kind: 'lines', hint: '(a) una espada larga o (b) dos armas simples' },
    { key: 'gold', label: 'Oro alternativo', kind: 'text', placeholder: '5d4 × 10' },
    { section: 'Subclases' },
    { key: 'subclassLabel', label: 'Nombre de la subclase', kind: 'text', placeholder: 'Juramento, Círculo, Senda…' },
    { key: 'subclassLevel', label: 'Nivel en que se elige', kind: 'number', min: 1, max: 20 },
    { key: 'subclasses', label: 'Opciones de subclase', kind: 'rows', fields: [{ key: 'name', label: 'Nombre' }, { key: 'description', label: 'Descripción', long: true }], add: 'Añadir subclase' },
    { section: 'Rasgos por nivel' },
    { key: 'features', label: 'Rasgos', kind: 'rows', fields: [{ key: 'level', label: 'Nivel', number: true }, { key: 'name', label: 'Nombre' }, { key: 'subclass', label: 'Subclase (vacío = todas)' }, { key: 'text', label: 'Descripción', long: true }], add: 'Añadir rasgo' },
    SOURCE,
  ],
  raza: [
    ...COMMON_HEAD,
    { section: 'Atributos y movimiento' },
    { key: 'abilities', label: 'Bonificaciones fijas', kind: 'abilities', min: -4, max: 4 },
    { key: 'abilityChoice.count', label: 'Atributos a elegir', kind: 'number', min: 0, max: 6 },
    { key: 'abilityChoice.bonus', label: 'Bonificación de cada elección', kind: 'number', min: 1, max: 2 },
    { key: 'abilityChoice.allowed', label: 'Atributos elegibles (vacío = cualquiera)', kind: 'chips', options: ABILITY_OPTIONS },
    { key: 'speed.walk', label: 'Velocidad (pies)', kind: 'number', min: 0, max: 200 },
    { key: 'speed.fly', label: 'Vuelo', kind: 'number', min: 0, max: 200 },
    { key: 'speed.swim', label: 'Nado', kind: 'number', min: 0, max: 200 },
    { key: 'speed.climb', label: 'Escalada', kind: 'number', min: 0, max: 200 },
    { section: 'Idiomas y rasgos' },
    { key: 'languages', label: 'Idiomas', kind: 'list' },
    { key: 'extraLanguages', label: 'Idiomas adicionales a elegir', kind: 'number', min: 0, max: 5 },
    { key: 'allowsFeat', label: 'Elige una dote a nivel 1 (como el Humano variante)', kind: 'checkbox' },
    { key: 'traits', label: 'Rasgos raciales', kind: 'rows', fields: [{ key: 'name', label: 'Nombre' }, { key: 'text', label: 'Descripción', long: true }], add: 'Añadir rasgo' },
    { key: 'effects', kind: 'effects' },
    SOURCE,
  ],
  dote: [
    ...COMMON_HEAD,
    { key: 'prerequisites.abilities', label: 'Requisitos de atributo (mínimo)', kind: 'abilities', min: 0, max: 30 },
    { key: 'prerequisites.level', label: 'Nivel mínimo', kind: 'number', min: 0, max: 20 },
    { key: 'prerequisites.caster', label: 'Requiere poder lanzar conjuros', kind: 'checkbox' },
    { key: 'abilityOptions', label: '+1 a uno de estos atributos', kind: 'chips', options: ABILITY_OPTIONS },
    { key: 'expertise', label: 'Pericias que otorga', kind: 'number', min: 0, max: 6 },
    { key: 'repeatable', label: 'Se puede elegir varias veces', kind: 'checkbox' },
    { key: 'effects', kind: 'effects' },
    SOURCE,
  ],
  hechizo: [
    ...COMMON_HEAD,
    { key: 'level', label: 'Nivel (0 = truco)', kind: 'number', min: 0, max: 9 },
    { key: 'school', label: 'Escuela', kind: 'text', placeholder: 'Evocación' },
    { key: 'castingTime', label: 'Tiempo de lanzamiento', kind: 'text' },
    { key: 'range', label: 'Alcance', kind: 'text' },
    { key: 'components', label: 'Componentes', kind: 'text' },
    { key: 'duration', label: 'Duración', kind: 'text' },
    { key: 'concentration', label: 'Concentración', kind: 'checkbox' },
    { key: 'ritual', label: 'Ritual', kind: 'checkbox' },
    { key: 'attack', label: 'Ataque o salvación', kind: 'text', placeholder: 'Salvación de Destreza, 3d6 fuego' },
    { key: 'classes', label: 'Clases que lo pueden aprender', kind: 'chips', options: () => Object.fromEntries(listClasses().map((c) => [c.claseName, c.nombre])) },
    SOURCE,
  ],
  trasfondo: [
    ...COMMON_HEAD,
    { key: 'abilityOptions', label: 'Atributos que puede aumentar', kind: 'chips', options: ABILITY_OPTIONS },
    { key: 'skills', label: 'Habilidades', kind: 'chips', options: SKILL_OPTIONS },
    { key: 'tools', label: 'Herramientas', kind: 'list' },
    { key: 'languages', label: 'Idiomas adicionales', kind: 'number', min: 0, max: 10 },
    { key: 'feature.name', label: 'Rasgo especial: nombre', kind: 'text' },
    { key: 'feature.text', label: 'Rasgo especial: descripción', kind: 'textarea', rows: 3 },
    SOURCE,
  ],
  objeto: [
    ...COMMON_HEAD,
    { key: 'kind', label: 'Tipo', kind: 'text', placeholder: 'Arma, armadura, anillo, maravilloso…' },
    { key: 'rarity', label: 'Rareza', kind: 'select', options: { '': '—', común: 'Común', 'poco común': 'Poco común', raro: 'Raro', 'muy raro': 'Muy raro', legendario: 'Legendario', artefacto: 'Artefacto' } },
    { key: 'attunement', label: 'Requiere sintonización', kind: 'checkbox' },
    { key: 'weight', label: 'Peso', kind: 'text' },
    { key: 'cost', label: 'Precio', kind: 'text' },
    { key: 'effects', kind: 'effects', hint: 'Informativo: para que se apliquen, añade el objeto a un personaje como rasgo de origen «Objeto».' },
    SOURCE,
  ],
  criatura: [
    ...COMMON_HEAD,
    { section: 'Estadísticas' },
    { key: 'size', label: 'Tamaño', kind: 'select', options: { Diminuta: 'Diminuta', Pequeña: 'Pequeña', Mediana: 'Mediana', Grande: 'Grande', Enorme: 'Enorme', Gargantuesca: 'Gargantuesca' } },
    { key: 'creatureType', label: 'Tipo', kind: 'text', placeholder: 'Bestia, no muerto, feérico…' },
    { key: 'alignment', label: 'Alineamiento', kind: 'text' },
    { key: 'ac', label: 'Clase de armadura', kind: 'number', min: 0, max: 40 },
    { key: 'hp', label: 'Puntos de golpe', kind: 'number', min: 1, max: 2000 },
    { key: 'hitDice', label: 'Dados de golpe', kind: 'text', placeholder: '3d8 + 3' },
    { key: 'speed', label: 'Velocidad', kind: 'text', placeholder: '40 pies, nadar 20 pies' },
    { key: 'abilities', label: 'Puntuaciones', kind: 'abilities', min: 1, max: 30 },
    { key: 'challenge', label: 'Valor de desafío', kind: 'text', placeholder: '1/4' },
    { key: 'saves', label: 'Salvaciones', kind: 'text' },
    { key: 'skills', label: 'Habilidades', kind: 'text' },
    { key: 'senses', label: 'Sentidos', kind: 'text', placeholder: 'Visión en la oscuridad 60 pies, Percepción pasiva 13' },
    { key: 'languages', label: 'Idiomas', kind: 'text' },
    { section: 'Defensas' },
    { key: 'resistances', label: 'Resistencias', kind: 'chips', options: DAMAGE_OPTIONS },
    { key: 'immunities', label: 'Inmunidades al daño', kind: 'chips', options: DAMAGE_OPTIONS },
    { key: 'vulnerabilities', label: 'Vulnerabilidades', kind: 'chips', options: DAMAGE_OPTIONS },
    { key: 'conditionImmunities', label: 'Inmunidades a condiciones', kind: 'chips', options: CONDITION_OPTIONS },
    { section: 'Rasgos y acciones' },
    { key: 'traits', label: 'Rasgos', kind: 'rows', fields: [{ key: 'name', label: 'Nombre' }, { key: 'text', label: 'Descripción', long: true }], add: 'Añadir rasgo' },
    { key: 'actions', label: 'Acciones', kind: 'rows', fields: [{ key: 'name', label: 'Nombre' }, { key: 'text', label: 'Descripción', long: true }], add: 'Añadir acción' },
    { key: 'reactions', label: 'Reacciones', kind: 'rows', fields: [{ key: 'name', label: 'Nombre' }, { key: 'text', label: 'Descripción', long: true }], add: 'Añadir reacción' },
    SOURCE,
  ],
  rasgo: [...COMMON_HEAD, { key: 'effects', kind: 'effects' }, SOURCE],
  extension: [
    ...COMMON_HEAD,
    { section: 'A qué clase se añade' },
    { key: 'classKey', label: 'Clase', kind: 'select', options: () => Object.fromEntries(listClasses().map((c) => [c.claseName, c.nombre])), empty: '— Elige una clase —' },
    { key: 'kind', label: 'Tipo de extensión', kind: 'select', options: EXTENSION_KINDS },
    { key: 'subclassLevel', label: 'Nivel de la subclase (si la clase no tiene uno propio)', kind: 'number', min: 1, max: 20 },
    { section: 'Quién puede usarla' },
    { key: 'access', label: 'Acceso', kind: 'select', options: EXTENSION_ACCESS },
    { key: 'origin', label: 'Origen', kind: 'select', options: TRAIT_ORIGINS },
    { key: 'condition', label: 'Condición o requisito narrativo', kind: 'text', placeholder: 'Ej.: Haber superado la prueba del templo de Akatosh' },
    { section: 'Rasgos' },
    { key: 'features', label: 'Rasgos por nivel', kind: 'rows', add: 'Añadir rasgo', fields: [
      { key: 'level', label: 'Nivel requerido', number: true },
      { key: 'name', label: 'Nombre' },
      { key: 'replaces', label: 'Sustituye a (opcional)' },
      { key: 'text', label: 'Descripción', long: true },
      { key: 'effects', label: 'Efectos automáticos', effects: true },
    ] },
    SOURCE,
  ],
  ...WORLD_FORMS,
  otro: [...COMMON_HEAD, SOURCE],
};

let seq = 0;
const fid = () => `ce${++seq}`;

function optionsOf(f) {
  return typeof f.options === 'function' ? f.options() : f.options;
}

/** Valor de un desplegable de fila (los booleanos se guardan como sí/no). */
function rowOption(v) {
  if (v === true) return 'si';
  if (v === false) return 'no';
  return v ?? '';
}

function rowHtml(f, row = {}) {
  // Filas antiguas guardadas como texto (p. ej. rumores): se editan como su primer campo.
  if (typeof row === 'string') row = { [f.fields[0].key]: row };
  return html`<div class="content-row" data-row>
    <div class="content-row__fields">${f.fields.map((sf) => (sf.effects ? html`<div class="field--wide">${effectsFieldset(row[sf.key] ?? [], { legend: sf.label })}</div>` : html`<label class="field ${sf.long ? 'field--wide' : ''}"><span class="field__label">${sf.label}</span>
      ${sf.long
        ? html`<textarea class="textarea" rows="3" data-rf="${sf.key}" maxlength="20000">${row[sf.key] ?? ''}</textarea>`
        : sf.options
          ? html`<select class="select" data-rf="${sf.key}">${Object.entries(optionsOf(sf)).map(([k, l]) => html`<option value="${k}" ${String(rowOption(row[sf.key])) === k ? raw('selected') : ''}>${l}</option>`)}</select>`
          : html`<input class="input ${sf.number ? 'input--num' : ''}" ${sf.number ? raw(`type="number" min="${Number(sf.min ?? 1)}" max="${Number(sf.max ?? 20)}" step="${Number(sf.step ?? 1)}"`) : raw(`maxlength="${Number(sf.maxlength ?? 120)}"`)} data-rf="${sf.key}" value="${row[sf.key] ?? ''}">`}
    </label>`))}</div>
    <button type="button" class="icon-btn" data-row-remove aria-label="Quitar">×</button>
  </div>`;
}

function fieldHtml(f, item) {
  if (f.kind === 'note') return html`<p class="field__hint field--wide">${f.text}</p>`;
  const v = getPath(item, f.key);
  const id = fid();
  switch (f.kind) {
    case 'text':
      return html`<div class="field"><label class="field__label" for="${id}">${f.label}</label><input id="${id}" class="input" data-f="${f.key}" data-kind="text" maxlength="120" value="${v ?? ''}" placeholder="${f.placeholder ?? ''}" ${f.required ? raw('required') : ''}></div>`;
    case 'textarea':
      return html`<div class="field field--wide"><label class="field__label" for="${id}">${f.label}</label><textarea id="${id}" class="textarea" rows="${f.rows ?? 4}" data-f="${f.key}" data-kind="text" maxlength="20000">${v ?? ''}</textarea></div>`;
    case 'number':
      return html`<div class="field"><label class="field__label" for="${id}">${f.label}</label><input id="${id}" class="input input--num" type="number" min="${f.min ?? 0}" max="${f.max ?? 999}" step="${f.step ?? 1}" data-f="${f.key}" data-kind="number" value="${v ?? ''}"></div>`;
    case 'numbers':
      return html`<div class="field"><label class="field__label" for="${id}">${f.label}</label><input id="${id}" class="input" data-f="${f.key}" data-kind="numbers" value="${(v ?? []).join(', ')}">${f.hint ? html`<span class="field__hint">${f.hint}</span>` : ''}</div>`;
    case 'list':
      return html`<div class="field"><label class="field__label" for="${id}">${f.label}</label><input id="${id}" class="input" data-f="${f.key}" data-kind="list" maxlength="1000" value="${(v ?? []).join(', ')}">${f.hint ? html`<span class="field__hint">${f.hint}</span>` : ''}</div>`;
    case 'lines':
      return html`<div class="field field--wide"><label class="field__label" for="${id}">${f.label}</label><textarea id="${id}" class="textarea" rows="4" data-f="${f.key}" data-kind="lines">${(v ?? []).join('\n')}</textarea>${f.hint ? html`<span class="field__hint">${f.hint}</span>` : ''}</div>`;
    case 'select':
      return html`<div class="field"><label class="field__label" for="${id}">${f.label}</label><select id="${id}" class="select" data-f="${f.key}" data-kind="${f.number ? 'number' : 'select'}">
        ${f.empty ? html`<option value="">${f.empty}</option>` : ''}
        ${Object.entries(optionsOf(f)).map(([k, l]) => html`<option value="${k}" ${String(v ?? '') === String(k) ? raw('selected') : ''}>${l}</option>`)}</select></div>`;
    case 'checkbox':
      return html`<label class="check field--wide"><input type="checkbox" data-f="${f.key}" data-kind="bool" ${v ? raw('checked') : ''}> ${f.label}</label>`;
    case 'chips':
      return html`<fieldset class="choice-group field--wide" data-f="${f.key}" data-kind="chips" ${f.max ? raw(`data-max="${f.max}"`) : ''}><legend>${f.label}</legend>
        <div class="chips">${Object.entries(optionsOf(f)).map(([k, l]) => html`<label class="chip"><input type="checkbox" value="${k}" ${(v ?? []).map(String).includes(k) ? raw('checked') : ''}>${l}</label>`)}</div></fieldset>`;
    case 'abilities':
      return html`<fieldset class="choice-group field--wide" data-f="${f.key}" data-kind="abilities"><legend>${f.label}</legend>
        <div class="ability-inputs">${ABILITY_KEYS.map((k) => html`<label class="field"><span class="field__label">${ABILITY_LABEL[k].slice(0, 3)}</span><input class="input input--num" type="number" min="${f.min}" max="${f.max}" data-ab="${k}" value="${v?.[k] ?? ''}"></label>`)}</div></fieldset>`;
    case 'rows':
      return html`<fieldset class="choice-group field--wide" data-f="${f.key}" data-kind="rows"><legend>${f.label}</legend>
        <div class="stack stack--sm" data-rows>${(v ?? []).map((r) => rowHtml(f, r))}</div>
        <div><button type="button" class="btn btn--ghost btn--sm" data-row-add="${f.key}">+ ${f.add}</button></div></fieldset>`;
    case 'effects':
      return html`<div class="field--wide">${effectsFieldset(v ?? [], { hint: f.hint })}</div>`;
    default:
      return '';
  }
}

/** Lee el formulario y devuelve el objeto (sin validar). */
function readForm(form, type, base) {
  const out = structuredClone(base);
  for (const el of form.querySelectorAll('[data-f]')) {
    const key = el.dataset.f;
    let value;
    switch (el.dataset.kind) {
      case 'text': value = el.value; break;
      case 'select': value = el.value || null; break;
      case 'number': value = el.value === '' ? null : Number(el.value); break;
      case 'numbers': value = el.value.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0); break;
      case 'list': value = el.value.split(',').map((s) => s.trim()).filter(Boolean); break;
      case 'lines': value = el.value.split('\n').map((s) => s.trim()).filter(Boolean); break;
      case 'bool': value = el.checked; break;
      case 'chips': value = [...el.querySelectorAll('input:checked')].map((i) => i.value); break;
      case 'abilities': value = Object.fromEntries([...el.querySelectorAll('[data-ab]')].filter((i) => i.value !== '').map((i) => [i.dataset.ab, Number(i.value)])); break;
      case 'rows': value = [...el.querySelectorAll('[data-row]')].map((r) => {
        const rowValue = Object.fromEntries([...r.querySelectorAll('[data-rf]')].map((i) => [i.dataset.rf, i.value]));
        const box = r.querySelector('[data-effects]');
        if (box) rowValue.effects = readEffects(box);
        return rowValue;
      }); break;
      default: continue;
    }
    setPath(out, key, value);
  }
  const topEffects = [...form.querySelectorAll('[data-effects]')].find((b) => !b.closest('[data-row]'));
  if (topEffects) out.effects = readEffects(topEffects);
  if (type === 'clase') {
    // Las subclases se identifican por su nombre convertido en clave.
    out.subclasses = (out.subclasses ?? []).map((s) => ({ ...s, key: slug(s.name) }));
    out.features = (out.features ?? []).map((f) => ({ ...f, subclass: f.subclass ? slug(f.subclass) : null }));
  }
  if (type === 'raza' && !(out.abilityChoice?.count > 0)) out.abilityChoice = null;
  if (type === 'raza' && out.abilityChoice && !out.abilityChoice.allowed?.length) out.abilityChoice.allowed = [...ABILITY_KEYS];
  return out;
}

/**
 * Abre el editor. Devuelve el elemento validado o undefined si se cancela.
 *
 * Protección del progreso:
 * - El diálogo no se cierra con un clic fuera y pide confirmación si hay cambios.
 * - Con `draftKey`, el formulario se guarda como borrador mientras se edita; si
 *   se cerró por accidente (recarga, cierre de pestaña…), al volver a abrirlo se
 *   ofrece recuperarlo. Se borra al guardar o al descartar a propósito.
 * @param {string} type
 * @param {object|null} initial
 * @param {{ title?: string, note?: string, draftKey?: string }} [opts]
 */
export function openContentEditor(type, initial, { title, note = '', draftKey = null } = {}) {
  const meta = CONTENT_TYPES[type];
  const original = initial ? structuredClone(initial) : emptyContent(type);
  const key = draftKey ? `contenido:${draftKey}` : null;
  const draft = key ? loadDraft(key) : null;
  const tracker = trackChanges({ onDiscard: () => key && clearDraft(key) });
  const sections = FORMS[type].filter((f) => f.section);
  return openDialog({
    title: title ?? `${initial ? 'Editar' : 'Nuevo'}: ${meta.label.toLowerCase()}`,
    size: 'xl',
    guard: tracker.guard,
    render(body, close) {
      const persist = debounced((form) => key && saveDraft(key, readForm(form, type, original)), 500);

      function draw(base, { restored = false, offerDraft = false } = {}) {
        let n = 0;
        setHtml(body, html`<form class="content-form" data-form novalidate>
          ${offerDraft ? html`<div class="callout callout--warning row row--between" data-draft-offer>
            <p>Tienes un borrador sin guardar de este formulario (${new Date(draft.savedAt).toLocaleString('es')}).</p>
            <div class="row"><button type="button" class="btn btn--primary btn--sm" data-draft="restore">Recuperar borrador</button><button type="button" class="btn btn--ghost btn--sm" data-draft="discard">Descartarlo</button></div>
          </div>` : ''}
          ${restored ? html`<p class="callout">Borrador recuperado. Revisa los datos y pulsa «Guardar».</p>` : ''}
          ${note ? html`<p class="callout">${note}</p>` : ''}
          ${sections.length > 2 ? html`<nav class="content-form__nav" aria-label="Secciones del formulario">
            <a href="#cf-top" data-jump="cf-top">General</a>
            ${sections.map((sec, i) => html`<a href="#cf-s${i}" data-jump="cf-s${i}">${sec.section}</a>`)}
          </nav>` : ''}
          <div class="content-form__grid" id="cf-top">${FORMS[type].map((f) => (f.section
            ? html`<h3 class="content-form__section" id="cf-s${n++}">${f.section}</h3>`
            : fieldHtml(f, base)))}</div>
          <div class="field__error" data-error role="alert"></div>
          <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button type="submit" class="btn btn--primary">Guardar</button></div>
        </form>`);
        const form = body.querySelector('[data-form]');
        bindEffectsEditor(form);
        tracker.watch(form);
        if (restored) tracker.markDirty(); // lo recuperado cuenta como cambio sin guardar
        return form;
      }

      draw(original, { offerDraft: Boolean(draft) });

      body.addEventListener('click', (e) => {
        const form = body.querySelector('[data-form]');
        const jump = e.target.closest('[data-jump]');
        if (jump) {
          e.preventDefault();
          body.querySelector(`#${jump.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        const dr = e.target.closest('[data-draft]');
        if (dr) {
          if (dr.dataset.draft === 'restore') {
            draw({ ...original, ...draft.value }, { restored: true });
            persist.flush(body.querySelector('[data-form]'));
          } else {
            clearDraft(key);
            body.querySelector('[data-draft-offer]')?.remove();
          }
          return;
        }
        const add = e.target.closest('[data-row-add]');
        if (add) {
          const f = FORMS[type].find((x) => x.key === add.dataset.rowAdd);
          add.closest('fieldset').querySelector('[data-rows]').insertAdjacentHTML('beforeend', String(rowHtml(f)));
          persist(form);
        }
        const rm = e.target.closest('[data-row-remove]');
        if (rm) { rm.closest('[data-row]').remove(); persist(form); }
      });
      body.addEventListener('input', () => persist(body.querySelector('[data-form]')));
      body.addEventListener('change', (e) => {
        const group = e.target.closest('[data-kind="chips"][data-max]');
        if (group && group.querySelectorAll('input:checked').length > Number(group.dataset.max)) e.target.checked = false;
        persist(body.querySelector('[data-form]'));
      });
      body.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = body.querySelector('[data-form]');
        const raw = readForm(form, type, original);
        const { item, errors } = validateContent(type, raw);
        if (!item) {
          setHtml(body.querySelector('[data-error]'), html`<ul>${errors.map((x) => html`<li>${x}</li>`)}</ul>`);
          body.querySelector('[data-error]').scrollIntoView({ block: 'nearest' });
          return;
        }
        persist.cancel();
        if (key) clearDraft(key);
        close(item);
      });
    },
  });
}
