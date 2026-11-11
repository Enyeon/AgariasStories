// Selector de elecciones de rasgos («elige 3 maniobras», «elige 2 trucos»…).
// Lo usan el asistente de subida de nivel y la ficha (elecciones pendientes).
//
// `groups`: salida de pendingChoices()/classChoiceStatus().missing, cada una con
// { key?, lista, def, cantidad, reemplazar, nivelMax, features }.
// `state`:  { [key]: { add: string[], remove: string[] } } (se modifica en el sitio).

import { html, raw, richText, setHtml } from '../../ui/dom.js';
import { proseToHtml } from '../../domain/text-format.js';
import { choiceOptions, choiceLabel, listSource } from '../../domain/class-choices.js';

/** Opciones con el contexto del grupo: lo conocido, lo marcado y el nivel (requisitos). */
function groupOptions(g, s, ctx) {
  const known = (ctx.known?.[g.lista] ?? []).filter((v) => !s.remove.includes(v));
  return choiceOptions(g.def, { nivelMax: g.nivelMax, spells: ctx.spells, known, pool: [...known, ...s.add], nivel: g.level ?? null });
}
const hasPrereqs = (def) => (def.opciones ?? []).some((o) => o?.requisitos?.opcion || o?.repetible);

const keyOf = (g) => g.key ?? g.lista;
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SEARCH_FROM = 8;

function slot(g, state) {
  const s = state[keyOf(g)] ??= { add: [], remove: [] };
  return s;
}

/** Cuántos valores hay que elegir (los de la concesión + uno por cada reemplazo). */
const needed = (g, s) => g.cantidad + s.remove.length;
const countText = (g, s) => (needed(g, s) ? `${s.add.length}/${needed(g, s)}` : 'Opcional');

function groupHtml(g, state, ctx) {
  const s = slot(g, state);
  const known = ctx.known?.[g.lista] ?? [];
  const def = g.def;
  const options = groupOptions(g, s, ctx);
  const need = needed(g, s);
  const replaceable = g.reemplazar > 0 && known.length;
  const hint = [
    g.features?.length ? `Por: ${g.features.join(', ')}` : '',
    g.cantidad ? `Elige ${g.cantidad}` : 'Opcional',
    g.nivelMax != null && listSource(def) === 'conjuros' ? `Conjuros hasta nivel ${g.nivelMax}` : '',
    replaceable ? `Puedes reemplazar ${g.reemplazar === 1 ? 'una que ya conozcas' : `hasta ${g.reemplazar} que ya conozcas`}` : '',
  ].filter(Boolean).join(' · ');
  return html`<fieldset class="choice-group" data-choice-group="${keyOf(g)}">
    <legend class="choice-group__title">${def.titulo ?? g.lista} <span class="badge" data-choice-count>${countText(g, s)}</span></legend>
    <p class="field__hint">${hint}</p>
    ${def.ayuda ? html`<p class="field__hint">${def.ayuda}</p>` : ''}
    ${replaceable ? html`<label class="field choice-group__replace"><span class="field__label">Reemplazar (opcional)</span>
      <select class="select" data-choice-remove>
        <option value="">— No reemplazar —</option>
        ${known.map((v) => html`<option value="${v}" ${s.remove.includes(v) ? raw('selected') : ''}>${choiceLabel(def, v)}</option>`)}
      </select></label>` : ''}
    ${options === null && listSource(def) === 'libre'
      ? (need ? html`<div class="stack stack--sm">${Array.from({ length: need }, (_, i) => html`<input class="input" type="text" maxlength="80" data-choice-free="${i}" value="${s.add[i] ?? ''}" aria-label="${def.titulo ?? g.lista} ${i + 1}" placeholder="${def.placeholder ?? 'Escribe tu elección'}">`)}</div>` : '')
      : options === null
        ? html`<p class="muted">Cargando conjuros…</p>`
        : html`${options.length > SEARCH_FROM ? html`<input class="input choice-group__search" type="search" data-choice-search placeholder="Buscar en ${options.length} opciones…" aria-label="Buscar en ${def.titulo ?? g.lista}">` : ''}
          <ul class="choice-list">${options.map((o) => {
            const isKnown = known.includes(o.value) && !s.remove.includes(o.value);
            const checked = s.add.includes(o.value);
            return html`<li class="choice-opt ${checked ? 'is-selected' : ''}" data-blocked="${o.blocked ? 'true' : 'false'}" data-search-text="${norm(`${o.label} ${o.meta ?? ''}`)}">
              <label class="choice-opt__main">
                <input type="checkbox" data-choice-opt value="${o.value}" ${checked ? raw('checked') : ''} ${isKnown || (!checked && (s.add.length >= need || o.blocked)) ? raw('disabled') : ''}>
                <span class="choice-opt__name">${o.label}</span>
                ${o.meta ? html`<span class="badge ${o.blocked ? 'badge--warning' : ''}">${o.meta}</span>` : ''}
                ${isKnown ? html`<span class="badge badge--gold">Ya la conoces</span>` : ''}
              </label>
              ${o.description ? html`<details class="choice-opt__more"><summary>Descripción</summary><div class="rich">${richText(proseToHtml(o.description))}</div></details>` : ''}
            </li>`;
          })}</ul>`}
  </fieldset>`;
}

export function choiceGroupsHtml(groups, state, ctx = {}) {
  return html`<div class="stack" data-choice-root>${groups.map((g) => html`<div data-choice-slot="${keyOf(g)}">${groupHtml(g, state, ctx)}</div>`)}</div>`;
}

/** Comportamiento en el sitio (sin redibujar todo el diálogo: no salta el scroll). */
export function bindChoiceGroups(root, groups, state, ctx = {}, onChange = () => {}) {
  const container = root.querySelector('[data-choice-root]');
  if (!container) return;
  const byKey = new Map(groups.map((g) => [keyOf(g), g]));
  const redraw = (g) => setHtml(container.querySelector(`[data-choice-slot="${CSS.escape(keyOf(g))}"]`), groupHtml(g, state, ctx));
  const refresh = (fs, g) => {
    const s = slot(g, state);
    const need = needed(g, s);
    fs.querySelector('[data-choice-count]').textContent = countText(g, s);
    const known = ctx.known?.[g.lista] ?? [];
    fs.querySelectorAll('[data-choice-opt]').forEach((b) => {
      const isKnown = known.includes(b.value) && !s.remove.includes(b.value);
      const blocked = b.closest('.choice-opt').dataset.blocked === 'true';
      b.disabled = isKnown || (!b.checked && (s.add.length >= need || blocked));
      b.closest('.choice-opt').classList.toggle('is-selected', b.checked);
    });
  };
  container.addEventListener('change', (e) => {
    const fs = e.target.closest('[data-choice-group]');
    const g = fs && byKey.get(fs.dataset.choiceGroup);
    if (!g) return;
    const s = slot(g, state);
    if (e.target.matches('[data-choice-remove]')) {
      s.remove = e.target.value ? [e.target.value] : [];
      s.add = s.add.filter((v) => v !== e.target.value).slice(0, needed(g, s));
      redraw(g);
    } else if (e.target.matches('[data-choice-opt]')) {
      s.add = [...fs.querySelectorAll('[data-choice-opt]:checked')].map((b) => b.value).slice(0, needed(g, s));
      // Con requisitos entre opciones, lo marcado puede habilitar otras: se redibuja el grupo.
      if (hasPrereqs(g.def)) {
        const pool = groupOptions(g, s, ctx);
        s.add = s.add.filter((v) => pool.some((o) => o.value === v && !o.blocked));
        const scroll = fs.querySelector('.choice-list')?.scrollTop;
        redraw(g);
        const list = container.querySelector(`[data-choice-slot="${CSS.escape(keyOf(g))}"] .choice-list`);
        if (list && scroll) list.scrollTop = scroll;
      } else refresh(fs, g);
    }
    onChange();
  });
  container.addEventListener('input', (e) => {
    const fs = e.target.closest('[data-choice-group]');
    const g = fs && byKey.get(fs.dataset.choiceGroup);
    if (!g) return;
    if (e.target.matches('[data-choice-free]')) {
      const s = slot(g, state);
      s.add = [...fs.querySelectorAll('[data-choice-free]')].map((i) => i.value.trim()).filter(Boolean);
      fs.querySelector('[data-choice-count]').textContent = countText(g, s);
      onChange();
    } else if (e.target.matches('[data-choice-search]')) {
      const q = norm(e.target.value.trim());
      fs.querySelectorAll('.choice-opt').forEach((li) => { li.hidden = Boolean(q) && !li.dataset.searchText.includes(q); });
    }
  });
}

/** Mensaje de lo que falta, o '' si está completo. */
export function choicesError(groups, state) {
  for (const g of groups) {
    const s = slot(g, state);
    const need = needed(g, s);
    if (s.add.length !== need) return `${g.def.titulo ?? g.lista}: elige ${need} (llevas ${s.add.length}).`;
    if (new Set(s.add.map(norm)).size !== s.add.length) return `${g.def.titulo ?? g.lista}: hay opciones repetidas.`;
  }
  return '';
}

/** Texto corto de lo elegido, para resúmenes. */
export function choicesSummary(groups, state) {
  return groups.map((g) => {
    const s = state[keyOf(g)];
    if (!s?.add.length) return '';
    const names = s.add.map((v) => choiceLabel(g.def, v)).join(', ');
    return `${g.def.titulo ?? g.lista}: ${names}${s.remove.length ? ` (en lugar de ${s.remove.map((v) => choiceLabel(g.def, v)).join(', ')})` : ''}`;
  }).filter(Boolean);
}

/** Estado limpio para enviar al motor (sin listas vacías). */
export function choicesPayload(state) {
  return Object.fromEntries(Object.entries(state).filter(([, s]) => s.add.length || s.remove.length).map(([k, s]) => [k, { add: [...s.add], remove: [...s.remove] }]));
}
