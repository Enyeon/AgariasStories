// Trasfondo: tarjeta de la pestaña «Progresión», selector y editor de homebrew.

import { listEntries } from '../../content/registry.js';
import { html, raw, setHtml, richText } from '../../ui/dom.js';
import { openDialog, toast, confirmDialog, trackChanges } from '../../ui/feedback.js';
import { ABILITY_KEYS, ABILITY_LABEL, SKILL_NAMES } from '../../domain/constants.js';
import { featAbilityOptions } from '../../domain/rules.js';
import { proseToHtml } from '../../domain/text-format.js';
import { normalizeBackgroundDefinition } from '../../domain/validation.js';
import {
  setBackground, updateCustomBackground, customizeOfficial, setBackgroundAbilities,
  setBackgroundFeatAbility, setBackgroundEquipmentChoice, applyBackgroundEquipment, parseEquipmentText,
} from '../../domain/background.js';
import { data, getFeat } from '../../data/index.js';
import { sectionCard } from './common.js';

const prose = (t) => richText(proseToHtml(t));
const SOURCE_LABEL = (def) => (def.official ? def.source ?? 'Oficial' : 'Homebrew');

export function sourceBadges(def) {
  return html`<span class="badge ${def.official ? 'badge--accent' : 'badge--gold'}">${SOURCE_LABEL(def)}</span>
    ${def.verify ? html`<span class="badge badge--warning" title="Datos pendientes de verificar (ver docs/DATOS.md)">Verificar</span>` : ''}
    ${def.pending ? html`<span class="badge badge--warning">Sin reglas aún</span>` : ''}`;
}

function equipmentSummary(text) {
  const { items, coins } = parseEquipmentText(text);
  const money = Object.entries(coins).filter(([, v]) => v).map(([k, v]) => `${v} ${{ cp: 'pc', sp: 'pp', gp: 'po', pp: 'ppt' }[k]}`);
  return [...items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name)), ...money].join(' · ');
}

/** Lista de lo que otorga un trasfondo (se usa en la tarjeta y en el selector). */
export function grantsList(def) {
  const rows = [
    ['Puntuaciones', def.abilityOptions.map((k) => ABILITY_LABEL[k]).join(', ')],
    ['Dote', def.feat ? def.feat + (def.featNote ? ` (${def.featNote})` : '') + (getFeat(def.feat) ? '' : ' (no está en los datos)') : ''],
    ['Habilidades', def.skills.join(', ')],
    ['Herramientas', def.tools.join(', ')],
    ['Idiomas', def.languages ? `${def.languages} a elegir` : ''],
    ['Equipo', def.equipment.map((e) => `(${e.label}) ${e.text}`).join(' · ')],
    ['Rasgo', def.feature?.name ?? ''],
  ].filter(([, v]) => v);
  if (!rows.length) return html`<p class="muted">Este trasfondo no otorga beneficios mecánicos.</p>`;
  return html`<dl class="grants">${rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;
}

// ── Tarjeta en «Progresión» ──────────────────────────────────────────────

function abilityBlock(ctx, def) {
  const bg = ctx.character.background;
  if (!def.abilityOptions.length) return '';
  const mode = bg.abilityMode;
  const slots = mode === '2-1' ? ['+2', '+1'] : mode === '1-1-1' ? ['+1', '+1', '+1'] : [];
  const dis = ctx.readOnly ? raw('disabled') : '';
  return html`<fieldset class="choice-group">
    <legend>Aumento de puntuaciones ${mode !== 'none' && bg.abilityChoices.length === slots.length ? html`<span class="badge badge--success">Listo</span>` : ''}</legend>
    <div class="segmented" role="radiogroup" aria-label="Aumento de puntuaciones del trasfondo">
      ${[['none', 'Sin aumento'], ['2-1', '+2 y +1'], ['1-1-1', '+1 a tres']].map(([v, l]) => html`<label class="segmented__opt"><input type="radio" name="bg-mode" value="${v}" data-bg="mode" ${mode === v ? raw('checked') : ''} ${dis}>${l}</label>`)}
    </div>
    ${slots.length ? html`<div class="row">${slots.map((label, i) => html`<label class="row field__inline">${label}
      <select class="select" data-bg="ability" data-index="${i}" aria-label="Atributo ${label}" ${dis}>
        <option value="">— Atributo —</option>
        ${def.abilityOptions.map((k) => html`<option value="${k}" ${bg.abilityChoices[i] === k ? raw('selected') : ''}>${ABILITY_LABEL[k]}</option>`)}
      </select></label>`)}</div>` : ''}
    <p class="field__hint">En las reglas 2024 este aumento sustituye al de la raza. Si tu mesa usa bonificaciones raciales, déjalo en «Sin aumento» salvo que tu DM diga otra cosa.</p>
  </fieldset>`;
}

function featBlock(ctx, def) {
  if (!def.feat) return '';
  const feat = getFeat(def.feat);
  const options = featAbilityOptions(feat);
  const chosen = ctx.character.background.featAbility;
  return html`<fieldset class="choice-group">
    <legend>Dote: ${def.feat}${def.featNote ? ` (${def.featNote})` : ''} ${options.length ? (chosen ? html`<span class="badge badge--success">Listo</span>` : html`<span class="badge badge--warning">Elige atributo</span>`) : ''}</legend>
    ${options.length ? html`<div class="chips">${options.map((k) => html`<label class="chip"><input type="radio" name="bg-feat-ability" value="${k}" data-bg="feat-ability" ${chosen === k ? raw('checked') : ''} ${ctx.readOnly ? raw('disabled') : ''}>${ABILITY_LABEL[k]} +1</label>`)}</div>` : ''}
    ${feat ? html`<details class="disclosure disclosure--ghost" data-key="bg-feat"><summary>Ver descripción de la dote</summary><div class="disclosure__body rich">${prose(feat.habilidad)}</div></details>` : html`<p class="muted">Esta dote no está en los datos de la aplicación: anótala en «Rasgos».</p>`}
  </fieldset>`;
}

function equipmentBlock(ctx, def) {
  if (!def.equipment.length) return '';
  const bg = ctx.character.background;
  const applied = bg.equipmentApplied;
  return html`<fieldset class="choice-group">
    <legend>Equipo inicial ${applied ? html`<span class="badge badge--success">Opción ${applied} añadida</span>` : ''}</legend>
    <div class="stack stack--sm">${def.equipment.map((e) => html`<label class="option-card ${bg.equipmentChoice === e.label ? 'is-selected' : ''}">
      <input type="radio" name="bg-equipment" value="${e.label}" data-bg="equipment" ${bg.equipmentChoice === e.label ? raw('checked') : ''} ${ctx.readOnly || applied ? raw('disabled') : ''}>
      <span><strong>Opción ${e.label}</strong><span class="option-card__text">${e.text}</span></span>
    </label>`)}</div>
    ${ctx.readOnly ? '' : applied
      ? html`<p class="field__hint">Ya está en tu inventario (pestaña «Equipo»). Si cambias de idea, edita el inventario a mano.</p>`
      : html`<div><button type="button" class="btn btn--gold btn--sm" data-action="bg-apply-equipment" ${bg.equipmentChoice ? '' : raw('disabled')}>＋ Añadir al inventario</button></div>`}
  </fieldset>`;
}

export function renderBackgroundCard(ctx) {
  const def = ctx.sheet.background;
  if (!def) {
    return sectionCard({
      title: 'Trasfondo',
      subtitle: 'Lo que hacías antes de la aventura: puede darte habilidades, una dote, equipo y aumentos de atributo.',
      actions: ctx.readOnly ? '' : html`<button type="button" class="btn btn--ghost" data-action="bg-create">✎ Crear el mío</button><button type="button" class="btn btn--primary" data-action="bg-pick">Elegir trasfondo</button>`,
      body: html`<p class="muted">${ctx.readOnly ? 'Sin trasfondo.' : 'Elige uno oficial o de Agarias, o crea el tuyo propio con las reglas que quieras.'}</p>`,
    });
  }
  return sectionCard({
    title: `Trasfondo: ${def.name || 'sin nombre'}`,
    subtitle: html`${sourceBadges(def)}`,
    actions: ctx.readOnly ? '' : html`
      ${def.official ? html`<button type="button" class="btn btn--ghost btn--sm" data-action="bg-customize" title="Crear una copia editable">✎ Personalizar</button>` : html`<button type="button" class="btn btn--ghost btn--sm" data-action="bg-edit">✎ Editar</button>`}
      <button type="button" class="btn btn--ghost btn--sm" data-action="bg-pick">Cambiar</button>`,
    body: html`<div class="stack">
      ${def.description ? html`<div class="rich">${prose(def.description)}</div>` : ''}
      ${grantsList(def)}
      ${def.feature?.text ? html`<div class="subclass-card"><p class="eyebrow">Rasgo del trasfondo</p><h4 class="subclass-card__title">${def.feature.name || 'Rasgo'}</h4><div class="rich">${prose(def.feature.text)}</div></div>` : ''}
      ${abilityBlock(ctx, def)}
      ${featBlock(ctx, def)}
      ${equipmentBlock(ctx, def)}
    </div>`,
  });
}

// ── Selector ─────────────────────────────────────────────────────────────

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * @param {Array<object>} homebrew  Trasfondos homebrew de otros personajes locales.
 * @returns {Promise<{ source: string, key?: string, custom?: object } | { create: true } | undefined>}
 */
export function openBackgroundPicker(currentKey, homebrew = [], allow = {}) {
  const official = (allow.official === false ? [] : Object.entries(data.backgrounds)).map(([key, d]) => ({ id: `o:${key}`, choice: { source: 'official', key }, def: { ...normalizeBackgroundDefinition(d), ...d, official: true } }));
  const campaign = (allow.homebrew === false ? [] : listEntries('trasfondo')).map((e) => ({
    id: `c:${e.ref}`, choice: { source: 'custom', custom: { ...e.engine, name: e.item.name, description: e.item.description }, ref: e.ref },
    def: { ...normalizeBackgroundDefinition({ ...e.engine, name: e.item.name, description: e.item.description }), official: false }, pack: e.packName,
  }));
  const own = homebrew.map((d, i) => ({ id: `h:${i}`, choice: { source: 'custom', custom: d }, def: { ...normalizeBackgroundDefinition(d), official: false } }));
  const groups = [
    ...[...new Set(official.map((o) => o.def.source))].map((src) => ({ title: src, items: official.filter((o) => o.def.source === src) })),
    ...[...new Set(campaign.map((o) => o.pack))].map((p) => ({ title: `Homebrew: ${p}`, items: campaign.filter((o) => o.pack === p) })),
    ...(own.length ? [{ title: 'Tus trasfondos (de otros personajes)', items: own }] : []),
  ];
  return openDialog({
    title: 'Elige un trasfondo',
    size: 'lg',
    render(body, close) {
      let selected = official.find((o) => o.choice.key === currentKey) ?? null;
      let query = '';
      const all = [...official, ...campaign, ...own];
      const list = () => {
        const q = norm(query);
        const gs = groups.map((g) => ({ ...g, items: g.items.filter((i) => !q || norm(`${i.def.name} ${i.def.skills.join(' ')} ${i.def.feat ?? ''} ${i.def.featNote ?? ''}`).includes(q)) })).filter((g) => g.items.length);
        return gs.length ? gs.map((g) => html`<h4 class="picker__group">${g.title}</h4>${g.items.map((i) => html`<button type="button" class="race-option ${selected?.id === i.id ? 'is-selected' : ''}" data-bg-id="${i.id}" aria-pressed="${selected?.id === i.id}">
          <span class="race-option__name">${i.def.name}</span>
          <span class="race-option__bonus">${[i.def.skills.join(', '), i.def.feat && (i.def.featNote ? `${i.def.feat} (${i.def.featNote})` : i.def.feat)].filter(Boolean).join(' · ') || 'Sin reglas definidas'}</span>
        </button>`)}`) : html`<p class="muted">Sin resultados.</p>`;
      };
      const detail = () => (selected ? html`<h3>${selected.def.name}</h3><p class="row">${sourceBadges(selected.def)}</p>
        ${selected.def.description ? html`<div class="rich">${prose(selected.def.description)}</div>` : ''}
        <hr>${grantsList(selected.def)}` : html`<p class="muted">Selecciona un trasfondo para ver lo que otorga.</p>`);
      setHtml(body, html`<div class="picker">
          <div class="picker__list">
            <button type="button" class="btn btn--gold btn--block" data-create>＋ Crear un trasfondo propio</button>
            <input class="input" type="search" placeholder="Buscar trasfondo, habilidad o dote…" data-search aria-label="Buscar trasfondo" autofocus>
            <div class="picker__scroll" data-list>${list()}</div>
          </div>
          <div class="picker__detail" data-detail aria-live="polite">${detail()}</div>
        </div>
        <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button type="button" class="btn btn--primary" data-confirm ${selected ? '' : raw('disabled')}>Elegir</button></div>`);
      body.addEventListener('input', (e) => {
        if (!e.target.matches('[data-search]')) return;
        query = e.target.value;
        setHtml(body.querySelector('[data-list]'), list());
      });
      body.addEventListener('click', (e) => {
        if (e.target.closest('[data-create]')) return close({ create: true });
        const item = e.target.closest('[data-bg-id]');
        if (item) {
          selected = all.find((i) => i.id === item.dataset.bgId);
          setHtml(body.querySelector('[data-list]'), list());
          setHtml(body.querySelector('[data-detail]'), detail());
          body.querySelector('[data-confirm]').disabled = false;
          if (window.matchMedia('(max-width: 760px)').matches) body.querySelector('[data-detail]').scrollIntoView({ behavior: 'smooth' });
          return;
        }
        if (e.target.closest('[data-confirm]') && selected) close(selected.choice);
      });
    },
  });
}

// ── Editor de homebrew ───────────────────────────────────────────────────

export function openBackgroundEditor(initial, { title = 'Trasfondo propio' } = {}) {
  const def = normalizeBackgroundDefinition(initial ?? {});
  const equipment = ['A', 'B', 'C'].map((label) => def.equipment.find((e) => e.label === label)?.text ?? '');
  const feats = Object.keys(data.feats).sort((a, b) => a.localeCompare(b, 'es'));
  const tracker = trackChanges();
  return openDialog({
    title,
    size: 'lg',
    guard: tracker.guard,
    render(body, close) {
      setHtml(body, html`<form class="stack" data-form novalidate>
        <div class="callout"><p>Crea el trasfondo que quieras: todo es opcional salvo el nombre. Se guarda dentro del personaje, así que viaja al exportarlo o compartirlo.</p></div>
        <div class="form-grid form-grid--wide">
          <div class="field"><label class="field__label" for="bg-name">Nombre *</label><input id="bg-name" class="input" name="name" maxlength="120" required value="${def.name}" autofocus></div>
          <div class="field"><label class="field__label" for="bg-lang">Idiomas adicionales</label><input id="bg-lang" class="input input--num" name="languages" type="number" min="0" max="10" value="${def.languages}"></div>
        </div>
        <div class="field"><label class="field__label" for="bg-desc">Descripción</label><textarea id="bg-desc" class="textarea" name="description" rows="4" maxlength="20000" placeholder="¿Qué hacía tu personaje antes de la aventura?">${def.description}</textarea></div>
        <fieldset class="choice-group"><legend>Puntuaciones de característica que puede aumentar</legend>
          <div class="chips">${ABILITY_KEYS.map((k) => html`<label class="chip"><input type="checkbox" name="abilityOptions" value="${k}" ${def.abilityOptions.includes(k) ? raw('checked') : ''}>${ABILITY_LABEL[k]}</label>`)}</div>
          <p class="field__hint">En las reglas 2024 suelen ser tres. Déjalo vacío si no da aumentos.</p>
        </fieldset>
        <div class="field"><label class="field__label" for="bg-feat">Dote gratuita</label>
          <select id="bg-feat" class="select" name="feat"><option value="">— Ninguna —</option>
            ${feats.map((f) => html`<option ${def.feat === f ? raw('selected') : ''}>${f}</option>`)}
            ${def.feat && !feats.includes(def.feat) ? html`<option selected>${def.feat}</option>` : ''}
          </select></div>
        <fieldset class="choice-group"><legend>Competencias con habilidades</legend>
          <div class="chips">${SKILL_NAMES.map((s) => html`<label class="chip"><input type="checkbox" name="skills" value="${s}" ${def.skills.includes(s) ? raw('checked') : ''}>${s}</label>`)}</div>
        </fieldset>
        <div class="field"><label class="field__label" for="bg-tools">Competencias con herramientas</label><input id="bg-tools" class="input" name="tools" maxlength="500" value="${def.tools.join(', ')}" placeholder="Separadas por comas: Herramientas de ladrón, Laúd"></div>
        <fieldset class="choice-group"><legend>Equipo (opciones a elegir)</legend>
          <p class="field__hint">Escríbelo como en el manual, p. ej. «2 dagas, ropas de viaje y 16 po»: se convertirá en objetos y monedas.</p>
          ${['A', 'B', 'C'].map((label, i) => html`<div class="field"><label class="field__label" for="bg-eq-${label}">Opción ${label}</label>
            <input id="bg-eq-${label}" class="input" name="eq-${label}" maxlength="2000" value="${equipment[i]}" data-eq-preview="${label}" placeholder="${i === 1 ? '50 po' : ''}">
            <span class="field__hint" data-eq-out="${label}">${equipment[i] ? `→ ${equipmentSummary(equipment[i])}` : ''}</span></div>`)}
        </fieldset>
        <fieldset class="choice-group"><legend>Rasgo especial (opcional, estilo 2014)</legend>
          <div class="stack stack--sm"><input class="input" name="featureName" maxlength="120" value="${def.feature?.name ?? ''}" placeholder="Nombre del rasgo" aria-label="Nombre del rasgo">
          <textarea class="textarea" name="featureText" rows="3" maxlength="20000" placeholder="Descripción del rasgo" aria-label="Descripción del rasgo">${def.feature?.text ?? ''}</textarea></div>
        </fieldset>
        <p class="field__error" data-error role="alert"></p>
        <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button type="submit" class="btn btn--primary">Guardar trasfondo</button></div>
      </form>`);
      const form = body.querySelector('[data-form]');
      tracker.watch(form);
      form.addEventListener('input', (e) => {
        const label = e.target.dataset.eqPreview;
        if (label) body.querySelector(`[data-eq-out="${label}"]`).textContent = e.target.value.trim() ? `→ ${equipmentSummary(e.target.value)}` : '';
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const name = String(fd.get('name') ?? '').trim();
        if (!name) {
          body.querySelector('[data-error]').textContent = 'Ponle un nombre al trasfondo.';
          form.querySelector('#bg-name').focus();
          return;
        }
        close(normalizeBackgroundDefinition({
          name,
          description: fd.get('description'),
          abilityOptions: fd.getAll('abilityOptions'),
          feat: fd.get('feat') || null,
          skills: fd.getAll('skills'),
          tools: String(fd.get('tools') ?? '').split(',').map((t) => t.trim()).filter(Boolean),
          languages: fd.get('languages'),
          equipment: ['A', 'B', 'C'].map((label) => ({ label, text: fd.get(`eq-${label}`) })),
          feature: { name: fd.get('featureName'), text: fd.get('featureText') },
        }));
      });
    },
  });
}

// ── Acciones y cambios ───────────────────────────────────────────────────

async function chooseBackground(ed) {
  const c = ed.character;
  if (c.background.source) {
    const ok = await confirmDialog({ title: 'Cambiar trasfondo', message: 'Se reiniciarán las elecciones del trasfondo (aumentos, dote y equipo). Los objetos ya añadidos al inventario se conservan.', confirmLabel: 'Continuar' });
    if (!ok) return;
  }
  const homebrew = await ed.listHomebrewBackgrounds();
  const perms = ed.permissions;
  const choice = await openBackgroundPicker(c.background.key, homebrew, { official: perms.official.trasfondo, homebrew: perms.homebrew.trasfondo });
  if (!choice) return;
  if (choice.create) return createBackground(ed);
  ed.replace(setBackground(ed.character, choice), { message: 'Trasfondo elegido.' });
}

async function createBackground(ed, initial, title) {
  const def = await openBackgroundEditor(initial, { title });
  if (def) ed.replace(setBackground(ed.character, { source: 'custom', custom: def }), { message: `Trasfondo «${def.name}» creado.` });
}

export const backgroundActions = {
  'bg-pick': chooseBackground,
  'bg-create': (ed) => createBackground(ed),
  async 'bg-edit'(ed) {
    const def = await openBackgroundEditor(ed.character.background.custom, { title: 'Editar trasfondo' });
    if (def) ed.replace(updateCustomBackground(ed.character, def), { message: 'Trasfondo actualizado.' });
  },
  // Personalizar conserva las elecciones ya hechas (aumentos, dote, equipo añadido).
  async 'bg-customize'(ed) {
    const def = await openBackgroundEditor(customizeOfficial(ed.sheet.background), { title: 'Personalizar trasfondo' });
    if (def) ed.replace(updateCustomBackground(ed.character, def), { message: `Trasfondo «${def.name}» creado a partir del oficial.` });
  },
  'bg-apply-equipment'(ed) {
    const res = applyBackgroundEquipment(ed.character, ed.character.background.equipmentChoice);
    if (res.errors.length) return toast(res.errors.join(' '), { type: 'error' });
    ed.replace(res.character, { message: `Añadidos ${res.added.items.length} objeto(s)${res.added.coins.gp ? ` y ${res.added.coins.gp} po` : ''} al inventario.` });
  },
};

export function onBackgroundChange(ed, el) {
  const kind = el.dataset.bg;
  const c = ed.character;
  if (kind === 'mode' || kind === 'ability') {
    const mode = kind === 'mode' ? el.value : c.background.abilityMode;
    const choices = kind === 'mode'
      ? c.background.abilityChoices
      : [...ed.root.querySelectorAll('[data-bg="ability"]')].map((s) => s.value);
    const res = setBackgroundAbilities(c, mode, choices);
    if (res.errors.length) { toast(res.errors.join(' '), { type: 'warning' }); return ed.rerender(); }
    return ed.replace(res.character);
  }
  if (kind === 'feat-ability') return ed.replace(setBackgroundFeatAbility(c, el.value));
  if (kind === 'equipment') return ed.replace(setBackgroundEquipmentChoice(c, el.value));
  return undefined;
}
