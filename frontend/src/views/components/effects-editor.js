// Editor de efectos del catálogo cerrado (domain/effects.js), reutilizable en
// rasgos personalizados y en el editor de contenido Homebrew.
//
// Uso: `effectsFieldset(effects)` dentro de un <form>, `bindEffectsEditor(form)`
// tras pintarlo y `readEffects(form)` al enviar. Lo que el usuario deje a
// medias se descarta al normalizar: nunca llega un efecto inválido al motor.

import { html, raw, setHtml } from '../../ui/dom.js';
import { ABILITY_KEYS, ABILITY_LABEL, SKILL_NAMES } from '../../domain/constants.js';
import {
  EFFECT_TYPES, PROFICIENCY_KINDS, BONUS_TARGETS, DAMAGE_TYPES, CONDITIONS, RESOURCES, normalizeEffects,
} from '../../domain/effects.js';

const opt = (value, label, current) => html`<option value="${value}" ${String(value) === String(current ?? '') ? raw('selected') : ''}>${label}</option>`;

function valueField(e) {
  switch (e.type) {
    case 'competencia': {
      const kind = e.kind ?? 'habilidad';
      let value;
      if (kind === 'habilidad') value = html`<select class="select" data-ef="value" aria-label="Habilidad">${SKILL_NAMES.map((s) => opt(s, s, e.value))}</select>`;
      else if (kind === 'salvacion') value = html`<select class="select" data-ef="value" aria-label="Salvación">${ABILITY_KEYS.map((k) => opt(k, ABILITY_LABEL[k], e.value))}</select>`;
      else value = html`<input class="input" data-ef="value" maxlength="80" value="${e.value ?? ''}" placeholder="Nombre" aria-label="Competencia">`;
      return html`<select class="select" data-ef="kind" aria-label="Tipo de competencia">${Object.entries(PROFICIENCY_KINDS).map(([k, l]) => opt(k, l, kind))}</select>${value}`;
    }
    case 'pericia':
      return html`<input class="input input--num" type="number" min="1" max="6" data-ef="amount" value="${e.amount ?? 1}" aria-label="Cantidad">`;
    case 'bono':
      return html`<select class="select" data-ef="target" aria-label="Destino">${Object.entries(BONUS_TARGETS).map(([k, l]) => opt(k, l, e.target))}</select>
        <input class="input input--num" type="number" min="-30" max="30" data-ef="value" value="${e.value ?? 1}" aria-label="Valor">`;
    case 'resistencia':
    case 'inmunidad':
    case 'vulnerabilidad':
      return html`<select class="select" data-ef="value" aria-label="Tipo de daño">${DAMAGE_TYPES.map((d) => opt(d.key, `${d.label}${d.official ? '' : ' (Agarias)'}`, e.value))}</select>`;
    case 'inmunidad_condicion':
      return html`<select class="select" data-ef="value" aria-label="Condición">${CONDITIONS.map((c) => opt(c, c, e.value))}</select>`;
    case 'habilita':
      return html`<select class="select" data-ef="value" aria-label="Recurso">${Object.entries(RESOURCES).map(([k, l]) => opt(k, l, e.value))}</select>`;
    default:
      return '';
  }
}

function row(e) {
  return html`<div class="effect-row" data-effect-row>
    <select class="select" data-ef="type" aria-label="Tipo de efecto">${Object.entries(EFFECT_TYPES).map(([k, l]) => opt(k, l, e.type))}</select>
    <div class="effect-row__fields">${valueField(e)}</div>
    <button type="button" class="icon-btn" data-effect-remove aria-label="Quitar efecto">×</button>
  </div>`;
}

export function effectsFieldset(effects = [], { legend = 'Efectos automáticos (opcional)', hint = '' } = {}) {
  return html`<fieldset class="choice-group" data-effects>
    <legend>${legend}</legend>
    <p class="field__hint">${hint || 'Sólo lo que la ficha puede calcular sola. Todo lo demás descríbelo en el texto.'}</p>
    <div class="stack stack--sm" data-effect-list>${effects.map(row)}</div>
    <div><button type="button" class="btn btn--ghost btn--sm" data-effect-add>+ Añadir efecto</button></div>
  </fieldset>`;
}

function readRow(r) {
  const get = (k) => r.querySelector(`[data-ef="${k}"]`)?.value;
  return { type: get('type'), kind: get('kind'), value: get('value'), target: get('target'), amount: get('amount') };
}

export function readEffects(root) {
  const rows = [...root.querySelectorAll('[data-effect-row]')].map(readRow).map((e) => (
    e.type === 'bono' || e.type === 'pericia' ? { ...e, value: Number(e.value), amount: Number(e.amount) } : e));
  return normalizeEffects(rows);
}

/**
 * Activa los editores de efectos dentro de `root` (delegación: también sirve
 * para los que se añadan después, p. ej. dentro de filas nuevas).
 */
export function bindEffectsEditor(root) {
  if (!root || root.dataset.effectsBound) return;
  root.dataset.effectsBound = '1';
  root.addEventListener('click', (ev) => {
    const add = ev.target.closest('[data-effect-add]');
    if (add) {
      const list = add.closest('[data-effects]').querySelector('[data-effect-list]');
      list.insertAdjacentHTML('beforeend', String(row({ type: 'competencia', kind: 'habilidad' })));
      list.lastElementChild?.querySelector('select')?.focus();
    }
    const rm = ev.target.closest('[data-effect-remove]');
    if (rm) rm.closest('[data-effect-row]').remove();
  });
  root.addEventListener('change', (ev) => {
    const r = ev.target.closest('[data-effect-row]');
    if (!r || !['type', 'kind'].includes(ev.target.dataset.ef)) return;
    const e = readRow(r);
    if (ev.target.dataset.ef === 'type') { e.value = undefined; e.kind = undefined; }
    else e.value = undefined;
    setHtml(r.querySelector('.effect-row__fields'), valueField(e));
  });
}
