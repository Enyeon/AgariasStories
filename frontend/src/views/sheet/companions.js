// Pestaña «Criaturas»: mascotas, compañeros, familiares, monturas, invocaciones
// y criaturas vinculadas. Cada tarjeta muestra el vínculo (PG, condiciones,
// presencia) y, plegado, el bloque de estadísticas de la criatura.

import { html, raw, setHtml, richText } from '../../ui/dom.js';
import { openDialog, toast, confirmDialog, trackChanges } from '../../ui/feedback.js';
import { ABILITY_KEYS, ABILITY_LABEL } from '../../domain/constants.js';
import { BOND_TYPES } from '../../domain/schema.js';
import { CONDITIONS, DAMAGE_LABEL } from '../../domain/effects.js';
import { TRAIT_ORIGINS } from '../../domain/proficiencies.js';
import { abilityModifier, formatModifier } from '../../domain/rules.js';
import {
  creatureOptions, creatureBlock, companionHp, addCompanion, updateCompanion, removeCompanion, damageCompanion,
} from '../../domain/companions.js';
import { listEntries } from '../../content/registry.js';
import { renderBloodCreatures } from './extras.js';
import { sectionCard } from './common.js';

function statBlock(b) {
  return html`<div class="statblock">
    ${b.size || b.creatureType ? html`<p class="statblock__meta">${[b.size, b.creatureType, b.alignment].filter(Boolean).join(' · ')}</p>` : ''}
    ${b.abilities ? html`<div class="statblock__abilities">${ABILITY_KEYS.map((k) => html`<div><span>${ABILITY_LABEL[k].slice(0, 3)}</span><strong>${b.abilities[k]}</strong><small>${formatModifier(abilityModifier(b.abilities[k]))}</small></div>`)}</div>` : ''}
    <dl class="basics basics--compact">
      ${b.speed ? html`<div class="basics__row"><dt>Velocidad</dt><dd>${b.speed}</dd></div>` : ''}
      ${b.hitDice ? html`<div class="basics__row"><dt>Dados de golpe</dt><dd>${b.hitDice}</dd></div>` : ''}
      ${b.challenge ? html`<div class="basics__row"><dt>Desafío</dt><dd>${b.challenge}</dd></div>` : ''}
      ${b.lines.map((l) => html`<div class="basics__row"><dt>${l.label}</dt><dd>${l.text}</dd></div>`)}
      ${b.resistances?.length ? html`<div class="basics__row"><dt>Resistencias</dt><dd>${b.resistances.map((d) => DAMAGE_LABEL[d]).join(', ')}</dd></div>` : ''}
      ${b.immunities?.length ? html`<div class="basics__row"><dt>Inmunidades</dt><dd>${b.immunities.map((d) => DAMAGE_LABEL[d]).join(', ')}</dd></div>` : ''}
      ${b.vulnerabilities?.length ? html`<div class="basics__row"><dt>Vulnerabilidades</dt><dd>${b.vulnerabilities.map((d) => DAMAGE_LABEL[d]).join(', ')}</dd></div>` : ''}
      ${b.conditionImmunities?.length ? html`<div class="basics__row"><dt>Inmune a</dt><dd>${b.conditionImmunities.join(', ')}</dd></div>` : ''}
    </dl>
    ${b.description ? html`<div class="rich">${richText(b.description)}</div>` : ''}
    ${[['Rasgos', b.traits], ['Acciones', b.actions], ['Reacciones', b.reactions]].filter(([, l]) => l?.length).map(([title, list]) => html`<h5 class="statblock__title">${title}</h5>
      ${list.map((t) => html`<p><strong>${t.name}.</strong> ${t.text}</p>`)}`)}
  </div>`;
}

function companionCard(ctx, comp) {
  const b = creatureBlock(comp, ctx.character);
  const hp = companionHp(comp, b);
  const ro = ctx.readOnly;
  const down = hp !== null && hp <= 0;
  return html`<article class="card companion ${comp.present ? '' : 'is-absent'} ${down ? 'is-down' : ''}">
    <header class="companion__head">
      <div>
        <h3 class="companion__name">${comp.name || b.name}</h3>
        <div class="chips chips--static">
          <span class="badge badge--accent">${BOND_TYPES[comp.bond]}</span>
          ${comp.name && b.name && comp.name !== b.name ? html`<span class="badge">${b.name}</span>` : ''}
          ${comp.present ? '' : html`<span class="badge badge--warning">No presente</span>`}
          ${b.missing ? html`<span class="badge badge--danger">Criatura no disponible</span>` : ''}
        </div>
      </div>
      ${ro ? '' : html`<div class="row">
        <button type="button" class="icon-btn" data-action="comp-edit" data-id="${comp.id}" aria-label="Editar ${comp.name}" title="Editar">✎</button>
        <button type="button" class="icon-btn icon-btn--danger" data-action="comp-remove" data-id="${comp.id}" aria-label="Quitar ${comp.name}" title="Quitar">🗑</button>
      </div>`}
    </header>
    <div class="companion__stats">
      <div class="stat-box"><span class="stat-box__label">CA</span><span class="stat-box__value">${b.ac ?? '—'}</span></div>
      <div class="stat-box ${down ? 'stat-box--danger' : ''}"><span class="stat-box__label">PG</span><span class="stat-box__value">${hp ?? '—'}${b.hpMax ? html`<small> / ${b.hpMax}</small>` : ''}</span>${b.hpNote ? html`<small class="muted">${b.hpNote}</small>` : ''}</div>
      <div class="stat-box"><span class="stat-box__label">PG temp.</span><span class="stat-box__value">${comp.tempHp || 0}</span></div>
    </div>
    ${ro ? '' : html`<div class="row companion__hp" role="group" aria-label="Puntos de golpe de ${comp.name}">
      <input class="input input--num" type="number" min="1" max="999" value="1" data-comp-amount="${comp.id}" aria-label="Cantidad">
      <button type="button" class="btn btn--ghost btn--sm" data-action="comp-damage" data-id="${comp.id}">− Daño</button>
      <button type="button" class="btn btn--ghost btn--sm" data-action="comp-heal" data-id="${comp.id}">+ Curar</button>
      <button type="button" class="btn btn--ghost btn--sm" data-action="comp-temp" data-id="${comp.id}">PG temporales</button>
      <button type="button" class="btn btn--ghost btn--sm" data-action="comp-present" data-id="${comp.id}">${comp.present ? 'Marcar ausente' : 'Marcar presente'}</button>
    </div>`}
    <div class="chips" role="group" aria-label="Condiciones">${(ro ? comp.conditions : CONDITIONS).map((cond) => {
      const on = comp.conditions.includes(cond);
      return html`<button type="button" class="chip-toggle chip-toggle--sm ${on ? 'is-on' : ''}" aria-pressed="${on}" ${ro ? raw('disabled') : raw(`data-action="comp-condition" data-id="${comp.id}" data-key="${cond}"`)}>${cond}</button>`;
    })}</div>
    ${comp.originDetail || comp.origin ? html`<p class="trait-card__origin">${TRAIT_ORIGINS[comp.origin] ?? ''}${comp.originDetail ? ` · ${comp.originDetail}` : ''}</p>` : ''}
    ${comp.notes ? html`<div class="rich">${richText(comp.notes)}</div>` : ''}
    <details class="disclosure disclosure--ghost" data-key="comp:${comp.id}">
      <summary><span>Estadísticas <span class="muted">· ${b.source}</span></span></summary>
      <div class="disclosure__body">${statBlock(b)}</div>
    </details>
  </article>`;
}

export function renderCompanions(ctx) {
  const list = ctx.character.companions ?? [];
  return html`<div class="stack">
    ${sectionCard({
      title: 'Criaturas vinculadas',
      subtitle: 'Mascotas, compañeros, familiares, monturas, invocaciones… El tipo de vínculo es una etiqueta: las reglas concretas las da el rasgo o conjuro que la origina.',
      actions: ctx.readOnly ? '' : html`<button type="button" class="btn btn--primary" data-action="comp-add">＋ Añadir criatura</button>`,
      body: list.length ? html`<div class="companion-grid">${list.map((x) => companionCard(ctx, x))}</div>` : html`<p class="muted">${ctx.readOnly ? 'Sin criaturas.' : 'Todavía no tienes ninguna criatura vinculada.'}</p>`,
    })}
    ${ctx.sheet.bloodSummoning ? html`<details class="disclosure" data-key="blood-catalog">
      <summary>Catálogo: Criaturas de Sangre</summary>
      <div class="disclosure__body">${renderBloodCreatures(ctx)}</div>
    </details>` : ''}
  </div>`;
}

// ── Diálogo ──────────────────────────────────────────────────────────────

function openCompanionEditor(initial, { blood, catalog }) {
  const comp = initial ?? { bond: 'companero', name: '', creatureRef: null, custom: null, origin: 'dm', originDetail: '', notes: '' };
  const options = creatureOptions({ blood, catalog });
  const groups = [...new Set(options.map((o) => o.group))];
  let mode = comp.creatureRef ? 'catalogo' : comp.custom ? 'propio' : options.length ? 'catalogo' : 'propio';
  const x = comp.custom ?? {};
  const tracker = trackChanges();
  let edited = false;
  return openDialog({
    guard: { isDirty: () => edited || tracker.guard.isDirty() },
    title: initial ? 'Editar criatura' : 'Añadir criatura',
    size: 'lg',
    render(body, close) {
      const draw = () => setHtml(body, html`<form class="stack" data-form>
        <div class="form-grid form-grid--wide">
          <div class="field"><label class="field__label" for="cp-bond">Vínculo</label>
            <select id="cp-bond" class="select" name="bond">${Object.entries(BOND_TYPES).map(([k, l]) => html`<option value="${k}" ${comp.bond === k ? raw('selected') : ''}>${l}</option>`)}</select></div>
          <div class="field"><label class="field__label" for="cp-name">Nombre propio</label>
            <input id="cp-name" class="input" name="name" maxlength="120" value="${comp.name}" placeholder="Ej.: Sombra" autofocus></div>
        </div>
        <fieldset class="choice-group"><legend>Estadísticas</legend>
          <div class="segmented" role="radiogroup">
            <label class="segmented__opt"><input type="radio" name="mode" value="catalogo" ${mode === 'catalogo' ? raw('checked') : ''} ${options.length ? '' : raw('disabled')}>De un catálogo</label>
            <label class="segmented__opt"><input type="radio" name="mode" value="propio" ${mode === 'propio' ? raw('checked') : ''}>Bloque propio</label>
          </div>
          ${mode === 'catalogo' ? html`<div class="field"><label class="field__label" for="cp-ref">Criatura</label>
              <select id="cp-ref" class="select" name="creatureRef">${groups.map((g) => html`<optgroup label="${g}">${options.filter((o) => o.group === g).map((o) => html`<option value="${o.ref}" ${comp.creatureRef === o.ref ? raw('selected') : ''}>${o.name}</option>`)}</optgroup>`)}</select>
              <span class="field__hint">El DM puede crear criaturas en Homebrew; aparecerán aquí.</span></div>`
            : html`<div class="form-grid">
              <div class="field"><label class="field__label" for="cp-size">Tamaño</label><input id="cp-size" class="input" name="size" maxlength="40" value="${x.size ?? ''}"></div>
              <div class="field"><label class="field__label" for="cp-type">Tipo</label><input id="cp-type" class="input" name="type" maxlength="60" value="${x.type ?? ''}" placeholder="Bestia"></div>
              <div class="field"><label class="field__label" for="cp-ac">CA</label><input id="cp-ac" class="input input--num" type="number" min="0" max="99" name="ac" value="${x.ac ?? ''}"></div>
              <div class="field"><label class="field__label" for="cp-hp">PG máximos</label><input id="cp-hp" class="input input--num" type="number" min="1" max="9999" name="hpMax" value="${x.hpMax ?? ''}"></div>
              <div class="field"><label class="field__label" for="cp-speed">Velocidad</label><input id="cp-speed" class="input" name="speed" maxlength="120" value="${x.speed ?? ''}"></div>
              <div class="field field--wide"><label class="field__label" for="cp-text">Rasgos y acciones</label><textarea id="cp-text" class="textarea" rows="4" name="text">${x.text ?? ''}</textarea></div>
            </div>`}
        </fieldset>
        <div class="form-grid form-grid--wide">
          <div class="field"><label class="field__label" for="cp-origin">Origen</label>
            <select id="cp-origin" class="select" name="origin">${Object.entries(TRAIT_ORIGINS).map(([k, l]) => html`<option value="${k}" ${comp.origin === k ? raw('selected') : ''}>${l}</option>`)}</select></div>
          <div class="field"><label class="field__label" for="cp-detail">¿De dónde viene?</label>
            <input id="cp-detail" class="input" name="originDetail" maxlength="2000" value="${comp.originDetail}" placeholder="Ej.: Conjuro Encontrar familiar"></div>
        </div>
        <div class="field"><label class="field__label" for="cp-notes">Notas</label><textarea id="cp-notes" class="textarea" rows="3" name="notes">${comp.notes}</textarea></div>
        <p class="field__error" data-error role="alert"></p>
        <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button type="submit" class="btn btn--primary">Guardar</button></div>
      </form>`);
      const snapshotForm = () => {
        const fd = new FormData(body.querySelector('[data-form]'));
        for (const k of ['bond', 'name', 'origin', 'originDetail', 'notes']) comp[k] = fd.get(k) ?? comp[k];
        if (fd.has('creatureRef')) comp.creatureRef = fd.get('creatureRef');
        if (fd.has('size')) Object.assign(x, { size: fd.get('size'), type: fd.get('type'), ac: fd.get('ac'), hpMax: fd.get('hpMax'), speed: fd.get('speed'), text: fd.get('text') });
      };
      draw();
      tracker.watch(body.querySelector('[data-form]'));
      body.addEventListener('change', (e) => {
        if (e.target.name === 'mode') {
          edited ||= tracker.guard.isDirty();
          snapshotForm(); mode = e.target.value; draw();
          tracker.watch(body.querySelector('[data-form]'));
          edited = true;
        }
      });
      body.addEventListener('submit', (e) => {
        e.preventDefault();
        snapshotForm();
        const out = {
          ...(initial ?? {}),
          bond: comp.bond, name: String(comp.name ?? '').trim(), origin: comp.origin, originDetail: comp.originDetail, notes: comp.notes,
          creatureRef: mode === 'catalogo' ? comp.creatureRef : null,
          custom: mode === 'propio' ? { ...x } : null,
        };
        if (!out.name && mode === 'propio') {
          body.querySelector('[data-error]').textContent = 'Ponle un nombre a la criatura.';
          return;
        }
        close(out);
      });
    },
  });
}

function catalogFor(ed) {
  return ed.permissions.homebrew.criatura ? listEntries('criatura') : [];
}

const amountOf = (ed, id) => Math.max(1, Math.trunc(Number(ed.root.querySelector(`[data-comp-amount="${id}"]`)?.value) || 1));

export const companionActions = {
  async 'comp-add'(ed) {
    const raw = await openCompanionEditor(null, { blood: ed.sheet.bloodSummoning, catalog: catalogFor(ed) });
    if (!raw) return;
    const res = addCompanion(ed.character, raw);
    if (res.errors.length) return toast(res.errors.join(' '), { type: 'error' });
    ed.replace(res.character, { keepScroll: true, message: 'Criatura añadida.' });
  },
  async 'comp-edit'(ed, el) {
    const current = ed.character.companions.find((x) => x.id === el.dataset.id);
    if (!current) return;
    const raw = await openCompanionEditor(structuredClone(current), { blood: ed.sheet.bloodSummoning, catalog: catalogFor(ed) });
    if (!raw) return;
    const res = updateCompanion(ed.character, current.id, raw);
    if (res.errors.length) return toast(res.errors.join(' '), { type: 'error' });
    ed.replace(res.character, { keepScroll: true });
  },
  async 'comp-remove'(ed, el) {
    const current = ed.character.companions.find((x) => x.id === el.dataset.id);
    if (!current) return;
    const ok = await confirmDialog({ title: `Quitar a ${current.name || 'la criatura'}`, message: 'Se quitará el vínculo y su estado (PG, condiciones, notas).', confirmLabel: 'Quitar', danger: true });
    if (ok) ed.replace(removeCompanion(ed.character, current.id), { keepScroll: true });
  },
  'comp-damage': (ed, el) => {
    const comp = ed.character.companions.find((x) => x.id === el.dataset.id);
    ed.replace(damageCompanion(ed.character, el.dataset.id, amountOf(ed, el.dataset.id), creatureBlock(comp, ed.character)), { keepScroll: true });
  },
  'comp-heal': (ed, el) => {
    const comp = ed.character.companions.find((x) => x.id === el.dataset.id);
    ed.replace(damageCompanion(ed.character, el.dataset.id, -amountOf(ed, el.dataset.id), creatureBlock(comp, ed.character)), { keepScroll: true });
  },
  'comp-temp': (ed, el) => ed.replace(updateCompanion(ed.character, el.dataset.id, { tempHp: amountOf(ed, el.dataset.id) }).character, { keepScroll: true }),
  'comp-present': (ed, el) => {
    const comp = ed.character.companions.find((x) => x.id === el.dataset.id);
    ed.replace(updateCompanion(ed.character, el.dataset.id, { present: !comp.present }).character, { keepScroll: true });
  },
  'comp-condition': (ed, el) => {
    const comp = ed.character.companions.find((x) => x.id === el.dataset.id);
    const has = comp.conditions.includes(el.dataset.key);
    const conditions = has ? comp.conditions.filter((c) => c !== el.dataset.key) : [...comp.conditions, el.dataset.key];
    ed.replace(updateCompanion(ed.character, el.dataset.id, { conditions }).character, { keepScroll: true });
  },
};
