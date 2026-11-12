// Pestaña «Rasgos»: índice + buscador, rasgos raciales, dotes y, por clase,
// fundamentos, subclase, tabla de progresión y línea temporal de rasgos.

import { html, raw, richText, setHtml } from '../../ui/dom.js';
import { classFeatures, subclassInfo } from '../../domain/rules.js';
import { parseTraitSections, parseClassBasics, proseToHtml, plainText } from '../../domain/text-format.js';
import { getFeat, getRace, getEpicBoon, getClass, data, raceName, featName, loadSpells } from '../../data/index.js';
import { ABILITY_LABEL, CLASS_ICONS, CLASS_SECTIONS } from '../../domain/constants.js';
import { setClassSkills, setClassSaves, TRAIT_ORIGINS } from '../../domain/proficiencies.js';
import { describeEffect } from '../../domain/effects.js';
import { confirmDialog, openDialog, toast } from '../../ui/feedback.js';
import { setSubclass } from '../../domain/progression.js';
import { openTraitEditor } from '../components/trait-editor.js';
import { listEntries } from '../../content/registry.js';
import {
  assignedExtensions, addableExtensions, addUnlock, removeUnlock, findByCode, normalizeUnlockCode,
} from '../../domain/extensions.js';
import { textArea } from './common.js';
import { classChoiceStatus, fillMissingChoices, replaceChoice, choiceListDef, knownChoices, listSource, deferredTab } from '../../domain/class-choices.js';
import { choiceGroupsHtml, bindChoiceGroups, choicesError } from '../components/choice-picker.js';

const CLAMP_CHARS = 420;
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Texto de datos → HTML seguro con párrafos y listas. */
const prose = (text) => richText(proseToHtml(text));

function searchAttr(...parts) {
  return raw(`data-search-text="${norm(parts.map(plainText).join(' ')).replace(/"/g, '')}"`);
}

/** Bloque de texto largo que se recorta con «Leer más». */
function clampable(text, { className = '' } = {}) {
  const long = plainText(text).length > CLAMP_CHARS;
  return html`<div class="clampable ${long ? 'is-clamped' : ''}">
    <div class="rich ${className}">${prose(text)}</div>
    ${long ? html`<button type="button" class="link-btn clampable__toggle" data-expand aria-expanded="false">Leer más</button>` : ''}
  </div>`;
}

function editToggle(ctx, key, editing, label = 'Editar') {
  if (ctx.readOnly) return '';
  return html`<button type="button" class="btn btn--ghost btn--sm" data-action="toggle-trait-edit" data-target="${key}" aria-pressed="${editing}">${editing ? '✓ Listo' : `✎ ${label}`}</button>`;
}

function sectionHead({ id, icon, eyebrow, title, actions = '' }) {
  return html`<header class="traits-section__head">
    <span class="traits-section__icon" aria-hidden="true">${icon}</span>
    <div class="traits-section__titles">
      ${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ''}
      <h3 class="traits-section__title" id="${id}-title">${title}</h3>
    </div>
    ${actions ? html`<div class="row">${actions}</div>` : ''}
  </header>`;
}

// ── Raza ─────────────────────────────────────────────────────────────────

function traitCard(t) {
  return html`<article class="trait-card" ${searchAttr(t.title, t.body, ...t.children)}>
    ${t.title ? html`<h4 class="trait-card__title">${t.title}</h4>` : ''}
    ${t.body ? clampable(t.body) : ''}
    ${t.children.length ? html`<ul class="trait-card__list">${t.children.map((c) => html`<li>${richText(c)}</li>`)}</ul>` : ''}
  </article>`;
}

function raceSection(ctx) {
  const c = ctx.character;
  const race = getRace(c.race.key);
  const editing = ctx.ui.traitsEdit.has('race');
  const sections = parseTraitSections(c.notes.raceTraits);
  const speed = ctx.sheet.speeds.filter((s) => s.value !== null);
  const restore = race && c.notes.raceTraits.trim() !== (race.info ?? '').trim();

  let body;
  if (editing) {
    body = html`<div class="stack stack--sm">
      ${textArea(ctx, { label: 'Rasgos raciales (texto)', path: 'notes.raceTraits', rows: 12 })}
      <p class="field__hint">Consejo: empieza cada rasgo con «♻ Nombre. Descripción» para que se muestre como tarjeta.</p>
      ${restore ? html`<div><button type="button" class="btn btn--ghost btn--sm" data-action="restore-race-traits">↺ Restaurar el texto original de la raza</button></div>` : ''}
    </div>`;
  } else if (!sections.length) {
    body = html`<p class="muted">${c.race.key ? 'No hay rasgos raciales anotados.' : 'Elige una raza en la pestaña «Progresión».'}</p>`;
  } else {
    body = sections.map((s) => html`<div class="traits-group">
      ${s.heading && sections.length > 1 ? html`<h4 class="traits-group__heading">${s.heading}</h4>` : ''}
      ${s.items.length ? html`<div class="trait-grid">${s.items.map(traitCard)}</div>` : ''}
      ${s.notes.length ? html`<div class="trait-notes rich" ${searchAttr(...s.notes)}>${prose(s.notes.join('\n'))}</div>` : ''}
    </div>`);
  }

  return html`<section class="traits-section" id="tr-race" aria-labelledby="tr-race-title">
    ${sectionHead({
      id: 'tr-race', icon: '🧬', eyebrow: 'Raza',
      title: c.race.key ? raceName(c.race.key) : 'Sin raza',
      actions: c.race.key ? editToggle(ctx, 'race', editing) : '',
    })}
    ${race ? html`<div class="chips chips--static">
      ${speed.map((s) => html`<span class="badge">${s.label} ${s.value} pies</span>`)}
      ${ctx.sheet.languages.fixed.length ? html`<span class="badge">Idiomas: ${[...ctx.sheet.languages.fixed, ...ctx.sheet.languages.chosen].join(', ')}</span>` : ''}
      ${ctx.sheet.hp.tough ? html`<span class="badge badge--gold">${data.raceBadges[c.race.key]?.texto ?? 'Dureza'}</span>` : ''}
    </div>` : ''}
    ${body}
  </section>`;
}

// ── Trasfondo ────────────────────────────────────────────────────────────

function backgroundSection(ctx) {
  const def = ctx.sheet.background;
  if (!def) return '';
  const items = [
    def.feature?.text ? { title: def.feature.name || 'Rasgo del trasfondo', body: def.feature.text, children: [] } : null,
    def.skills.length ? { title: 'Habilidades', body: def.skills.join(', '), children: [] } : null,
    def.tools.length ? { title: 'Herramientas', body: def.tools.join(', '), children: [] } : null,
  ].filter(Boolean);
  return html`<section class="traits-section" id="tr-background" aria-labelledby="tr-background-title">
    ${sectionHead({ id: 'tr-background', icon: '📜', eyebrow: 'Trasfondo', title: def.name || 'Trasfondo' })}
    ${def.description ? html`<div ${searchAttr(def.name, def.description)}>${clampable(def.description)}</div>` : ''}
    ${items.length ? html`<div class="trait-grid">${items.map(traitCard)}</div>` : ''}
  </section>`;
}

// ── Dotes ────────────────────────────────────────────────────────────────

function featsSection(ctx) {
  const feats = ctx.sheet.feats.map((f) => ({
    name: featName(f.name), text: getFeat(f.name)?.habilidad ?? 'Dote no encontrada en los datos actuales.',
    tags: [{ raza: 'Dote racial', trasfondo: 'Del trasfondo' }[f.source] ?? `Nivel ${f.level}`, f.ability ? `${ABILITY_LABEL[f.ability]} +1` : null], epic: false,
  }));
  const boons = ctx.character.epicBoons.map((b) => ({
    name: b.name, text: getEpicBoon(b.name)?.habilidad ?? '', tags: ['Épica', b.ability ? `${ABILITY_LABEL[b.ability]} +1` : null], epic: true,
  }));
  const all = [...feats, ...boons];
  if (!all.length) return '';
  return html`<section class="traits-section" id="tr-feats" aria-labelledby="tr-feats-title">
    ${sectionHead({ id: 'tr-feats', icon: '✦', eyebrow: 'Dotes y bendiciones', title: `${all.length} ${all.length === 1 ? 'dote' : 'dotes'}` })}
    <div class="trait-grid">
      ${all.map((f) => html`<article class="trait-card ${f.epic ? 'trait-card--epic' : ''}" ${searchAttr(f.name, f.text)}>
        <h4 class="trait-card__title">${f.name}</h4>
        <div class="chips chips--static">${f.tags.filter(Boolean).map((t) => html`<span class="badge ${f.epic ? 'badge--gold' : 'badge--accent'}">${t}</span>`)}</div>
        ${clampable(f.text)}
      </article>`)}
    </div>
  </section>`;
}

// ── Otros rasgos (origen genérico) ───────────────────────────────────────

function customTraitCard(ctx, t) {
  return html`<article class="trait-card trait-card--custom ${t.active ? '' : 'is-inactive'}" ${searchAttr(t.name, t.description, t.originDetail)}>
    <header class="trait-card__head">
      <h4 class="trait-card__title">${t.name}</h4>
      ${ctx.readOnly ? '' : html`<div class="row">
        <button type="button" class="icon-btn" data-action="trait-edit" data-id="${t.id}" aria-label="Editar ${t.name}" title="Editar">✎</button>
        <button type="button" class="icon-btn" data-action="trait-delete" data-id="${t.id}" aria-label="Eliminar ${t.name}" title="Eliminar">🗑</button>
      </div>`}
    </header>
    <div class="chips chips--static">
      <span class="badge badge--accent">${TRAIT_ORIGINS[t.origin] ?? 'Otro'}</span>
      ${t.active ? '' : html`<span class="badge badge--warning">Inactivo</span>`}
      ${t.effects.map((e) => html`<span class="badge badge--gold">${describeEffect(e)}</span>`)}
    </div>
    ${t.originDetail ? html`<p class="trait-card__origin">${t.originDetail}</p>` : ''}
    ${t.description ? clampable(t.description) : ''}
    ${ctx.readOnly || !t.effects.length ? '' : html`<button type="button" class="link-btn" data-action="trait-toggle" data-id="${t.id}">${t.active ? 'Desactivar' : 'Activar'}</button>`}
  </article>`;
}

function customTraitsSection(ctx) {
  const traits = ctx.character.traits;
  if (!traits.length && ctx.readOnly) return '';
  return html`<section class="traits-section" id="tr-other" aria-labelledby="tr-other-title">
    ${sectionHead({
      id: 'tr-other', icon: '✧', eyebrow: 'Otros rasgos',
      title: traits.length ? `${traits.length} ${traits.length === 1 ? 'rasgo' : 'rasgos'}` : 'Ninguno todavía',
      actions: ctx.readOnly ? '' : html`<button type="button" class="btn btn--ghost btn--sm" data-action="trait-add">+ Añadir rasgo</button>`,
    })}
    ${traits.length
      ? html`<div class="trait-grid">${traits.map((t) => customTraitCard(ctx, t))}</div>`
      : html`<p class="muted">Rasgos que no vienen de tu raza, clase o trasfondo: un don del DM, una maldición, la marca de un evento, el poder de un objeto…</p>`}
  </section>`;
}

// ── Clase ────────────────────────────────────────────────────────────────

function chipList(items) {
  return items.length
    ? html`<div class="chips chips--static">${items.map((i) => html`<span class="badge" title="${i.title ?? ''}">${i.label}</span>`)}</div>`
    : html`<span class="muted">Ninguna</span>`;
}

/** Competencias estructuradas de una clase, con las elecciones del jugador. */
function proficiencyPanel(ctx, f) {
  const st = ctx.sheet.classChoices.find((x) => x.classKey === f.classKey);
  if (!st) return '';
  if (st.pending) {
    return html`<div class="callout callout--warning">
      <p><strong>Competencias pendientes de definir.</strong> El autor de ${f.className} todavía no ha indicado sus salvaciones, competencias ni equipo${st.primary ? '' : ' de multiclase'}. Mientras tanto puedes marcarlas a mano en «Resumen».</p>
    </div>`;
  }
  const manual = ctx.character.proficiencies.skills;
  const ro = ctx.readOnly;
  const skillButtons = st.skills ? st.skills.options.map((name) => {
    const on = st.chosenSkills.includes(name);
    const fromBg = st.blockedByBackground.includes(name);
    const full = !on && st.skillsRemaining === 0;
    const disabled = ro || (!on && (fromBg || full));
    const title = fromBg ? 'Ya te la da el trasfondo: elige otra' : full ? 'Ya elegiste todas' : '';
    return html`<button type="button" class="chip-toggle ${on ? 'is-on' : ''} ${on && fromBg ? 'is-warning' : ''}" aria-pressed="${on}"
      ${disabled ? raw(`disabled title="${title}"`) : raw(`data-action="class-skill" data-class="${f.classKey}" data-key="${name}"`)}>${name}</button>`;
  }) : [];
  const fromManual = st.skills ? manual.filter((m) => st.skills.options.includes(m) && !st.chosenSkills.includes(m) && !st.blockedByBackground.includes(m)) : [];
  const saves = [
    ...st.salvaciones.map((k) => ({ label: ABILITY_LABEL[k] })),
  ];
  return html`<div class="prof-panel">
    <p class="eyebrow">${st.primary ? 'Competencias de clase' : 'Competencias por multiclase'}${st.source ? html` · <span class="muted">${st.source}</span>` : ''}</p>
    <dl class="basics">
      ${st.primary ? html`<div class="basics__row"><dt>Salvaciones</dt><dd>
        ${chipList(saves)}
        ${st.saveChoice ? html`<div class="chips" role="group" aria-label="Salvación a elegir">
          <span class="muted">Elige ${st.saveChoice.count}:</span>
          ${st.saveChoice.options.map((k) => {
            const on = st.chosenSaves.includes(k);
            return html`<button type="button" class="chip-toggle ${on ? 'is-on' : ''}" aria-pressed="${on}" ${ro ? raw('disabled') : raw(`data-action="class-save" data-class="${f.classKey}" data-key="${k}"`)}>${ABILITY_LABEL[k]}</button>`;
          })}
        </div>` : ''}
      </dd></div>` : ''}
      <div class="basics__row"><dt>Armaduras</dt><dd>${chipList(st.armaduras.map((x) => ({ label: x })))}${st.armorNote ? html`<p class="field__hint">${st.armorNote}</p>` : ''}</dd></div>
      <div class="basics__row"><dt>Armas</dt><dd>${chipList(st.armas.map((x) => ({ label: x })))}</dd></div>
      <div class="basics__row"><dt>Herramientas</dt><dd>${chipList(st.herramientas.map((x) => ({ label: x })))}</dd></div>
      ${st.skills ? html`<div class="basics__row"><dt>Habilidades</dt><dd>
        <p class="prof-panel__count ${st.skillsRemaining ? 'is-pending' : ''}">${st.skillsRemaining
          ? `Elige ${st.skillsRemaining} más (${st.chosenSkills.length}/${st.skills.count})`
          : `${st.chosenSkills.length}/${st.skills.count} elegidas`}</p>
        <div class="chips" role="group" aria-label="Habilidades de ${f.className}">${skillButtons}</div>
        ${st.duplicates.length ? html`<p class="callout callout--warning">${st.duplicates.join(', ')} también ${st.duplicates.length === 1 ? 'la da' : 'las da'} tu trasfondo. La regla oficial te permite elegir otra en su lugar.</p>` : ''}
        ${!ro && st.skillsRemaining && fromManual.length ? html`<button type="button" class="btn btn--ghost btn--sm" data-action="class-skills-from-manual" data-class="${f.classKey}">Usar las que ya tenías marcadas: ${fromManual.slice(0, st.skillsRemaining).join(', ')}</button>` : ''}
      </dd></div>` : ''}
    </dl>
  </div>`;
}

function basicsPanel(ctx, f) {
  const key = `class:${f.classKey}`;
  const editing = ctx.ui.traitsEdit.has(key);
  const text = ctx.character.notes.classNotes[f.classKey] ?? '';
  const basics = parseClassBasics(text);
  return html`<div class="class-block">
    <div class="class-block__head">
      <h4 class="class-block__title">Fundamentos de la clase</h4>
    </div>
    ${proficiencyPanel(ctx, f)}
    <details class="disclosure disclosure--ghost" data-key="basics:${f.classKey}" ${editing ? raw('open') : ''}>
      <summary>Texto de la clase, puntos de golpe y equipo inicial</summary>
      <div class="disclosure__body">
        <div class="row row--end">${editToggle(ctx, key, editing, 'Editar notas')}</div>
        ${editing
          ? textArea(ctx, { label: `Atributos y notas de ${f.className}`, path: `notes.classNotes.${f.classKey}`, rows: 12 })
          : basics.length
            ? html`<dl class="basics" ${searchAttr(text)}>${basics.map((b) => html`<div class="basics__row">
                <dt>${b.label || '—'}</dt>
                <dd>${b.value ? html`<span>${b.value}</span>` : ''}
                  ${b.items.length ? html`<ul class="basics__list">${b.items.map((i) => html`<li>${i.label ? html`<strong>${i.label}:</strong> ` : ''}${i.value}</li>`)}</ul>` : ''}
                </dd>
              </div>`)}</dl>`
            : html`<p class="muted">Sin notas para esta clase.</p>`}
      </div>
    </details>
  </div>`;
}

function progressionTable(f) {
  if (!f.table) return '';
  return html`<div class="class-block">
    <div class="class-block__head"><h4 class="class-block__title">Progresión</h4></div>
    <div class="table-wrap"><table class="table progression-table">
      <thead><tr><th class="num" scope="col">Nivel</th>${f.table.columns.map((c) => html`<th class="num" scope="col">${c}</th>`)}</tr></thead>
      <tbody>${f.table.rows.map((r) => html`<tr class="${r.level === f.level ? 'is-current' : ''}" ${r.level === f.level ? raw('aria-current="true"') : ''}>
        <td class="num">${r.level}</td>${f.table.columns.map((c) => html`<td class="num">${r[c] || '—'}</td>`)}
      </tr>`)}</tbody>
    </table></div>
  </div>`;
}

function featureCard(item, subName) {
  return html`<article class="feature-card ${item.sub ? 'feature-card--sub' : ''} ${item.homebrew ? 'feature-card--homebrew' : ''} ${item.replacedBy ? 'is-replaced' : ''}" ${searchAttr(item.title, item.text)}>
    <header class="feature-card__head">
      <h5 class="feature-card__title">${item.title || 'Rasgo'}</h5>
      ${item.sub ? html`<span class="badge badge--accent">${subName ?? 'Subclase'}</span>` : ''}
      ${item.homebrew && !item.sub ? html`<span class="badge badge--gold" title="${item.condition ?? ''}">⚜️ ${item.extension}${item.origin ? ` · ${TRAIT_ORIGINS[item.origin] ?? ''}` : ''}</span>` : ''}
      ${item.replacedBy ? html`<span class="badge badge--warning">Sustituido por ${item.replacedBy}</span>` : ''}
    </header>
    ${item.replaces ? html`<p class="trait-card__origin">Sustituye a «${item.replaces}».</p>` : ''}
    ${item.replacedBy ? '' : clampable(item.text)}
  </article>`;
}

/** Elecciones de rasgos (maniobras, estilos, trucos…): lo elegido y lo que falta. */
function choicesPanel(ctx, f) {
  const st = classChoiceStatus(ctx.character, f.classKey, { spells: ctx.spells });
  if (!st.lists.length && !st.missing.length) return '';
  // Las de conjuros y las del Taller se avisan y se eligen en su pestaña.
  const others = st.missing.filter((m) => [null, 'rasgos'].includes(deferredTab(m.def)));
  const missing = others.reduce((n, m) => n + m.cantidad, 0);
  return html`<div class="class-block choices-panel">
    <div class="class-block__head"><h4 class="class-block__title">Elecciones</h4></div>
    ${missing && !ctx.readOnly ? html`<div class="callout callout--warning row row--between">
      <p>Te ${missing === 1 ? 'falta 1 elección' : `faltan ${missing} elecciones`} de tus rasgos (${[...new Set(others.map((m) => m.def.titulo ?? m.lista))].join(', ')}).</p>
      <button type="button" class="btn btn--primary btn--sm" data-action="choices-fill" data-class="${f.classKey}" data-only="otras">Elegir ahora</button>
    </div>` : ''}
    ${st.lists.filter((l) => l.values.length).map((l) => html`<div class="choices-panel__list" ${searchAttr(l.def.titulo, ...l.values.map((v) => v.label))}>
      <p class="eyebrow">${l.def.titulo ?? l.lista} · ${l.values.length}</p>
      <ul class="choices-panel__items">${l.values.map((v) => html`<li>
        <div class="row row--between">
          <strong>${v.label}</strong>
          <span class="row">${v.meta ? html`<span class="badge">${v.meta}</span>` : ''}
            ${l.def.cambiable && !ctx.readOnly ? html`<button type="button" class="link-btn" data-action="choice-change" data-class="${f.classKey}" data-list="${l.lista}" data-value="${v.value}">Cambiar</button>` : ''}</span>
        </div>
        ${v.description ? html`<details class="choice-opt__more"><summary>Descripción</summary><div class="rich">${prose(v.description)}</div></details>` : ''}
      </li>`)}</ul>
    </div>`)}
  </div>`;
}

const needsSpellCatalog = (groups) => groups.some((g) => listSource(g.def) === 'conjuros');

/**
 * Diálogo para completar las elecciones pendientes de una clase.
 * @param {string|null} only  'conjuros', 'otras' (las de Rasgos) o la pestaña de una lista `diferir` ('taller')
 */
export async function fillChoices(ed, classKey, only = null) {
  const status = classChoiceStatus(ed.character, classKey);
  // 'conjuros' / 'otras' (Rasgos) o el id de una pestaña de listas `diferir` (p. ej. 'taller').
  const keep = (m) => !only || (only === 'otras' ? [null, 'rasgos'].includes(deferredTab(m.def)) : deferredTab(m.def) === only);
  const missing = status.missing.filter(keep);
  if (!missing.length) return;
  // Las listas diferibles (conjuros, esquemas, `diferir`) se pueden completar por partes.
  const partial = only !== null && (only !== 'otras' || missing.every((m) => deferredTab(m.def)));
  const groups = missing.map((m) => ({ ...m, key: `${m.level}:${m.lista}`, features: [`nivel ${m.level}`, ...m.features] }));
  const spells = needsSpellCatalog(groups) ? (ed.spells ?? await loadSpells().catch(() => null)) : null;
  const state = {};
  const ok = await openDialog({
    title: 'Elecciones pendientes',
    size: 'lg',
    guard: { isDirty: () => Object.values(state).some((s) => s.add.length) },
    render(body, close) {
      let error = '';
      const draw = () => {
        setHtml(body, html`<p class="muted">${partial ? 'Puedes elegir sólo algunos ahora y el resto más tarde. ' : ''}Estas elecciones corresponden a niveles que ya tienes. Se guardan en su nivel: si bajas de nivel, se deshacen.</p>
          ${choiceGroupsHtml(groups, state, { known: status.known, spells })}
          <p class="field__error" role="alert">${error}</p>
          <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button type="button" class="btn btn--primary" data-ok>Guardar</button></div>`);
        bindChoiceGroups(body, groups, state, { known: status.known, spells }, () => { body.querySelector('.field__error').textContent = ''; });
        body.querySelector('[data-ok]').addEventListener('click', () => {
          error = choicesError(groups, state, { partial });
          if (error) return draw();
          close(true);
        });
      };
      draw();
    },
  });
  if (!ok) return;
  const picks = Object.fromEntries(Object.entries(state).map(([k, s]) => [k, s.add]));
  if (!Object.values(picks).some((a) => a.length)) return;
  const res = fillMissingChoices(ed.character, classKey, picks, { spells });
  if (res.errors.length) return toast(res.errors.join(' '), { type: 'error' });
  ed.replace(res.character, { keepScroll: true, message: 'Elecciones guardadas.' });
}

async function changeChoice(ed, classKey, lista, oldValue) {
  const def = choiceListDef(classKey, ed.character.subclasses?.[classKey] ?? null, lista);
  if (!def) return;
  const spells = listSource(def) === 'conjuros' ? (ed.spells ?? await loadSpells().catch(() => null)) : null;
  const group = { lista, def, cantidad: 0, reemplazar: 1, nivelMax: null, features: [] };
  const known = knownChoices(ed.character, classKey);
  const state = { [lista]: { add: [], remove: [oldValue] } };
  const ok = await openDialog({
    title: `Cambiar: ${def.titulo ?? lista}`,
    size: 'md',
    render(body, close) {
      setHtml(body, html`${choiceGroupsHtml([group], state, { known, spells })}
        <p class="field__error" role="alert"></p>
        <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button type="button" class="btn btn--primary" data-ok>Cambiar</button></div>`);
      // El valor a cambiar ya está decidido: no se muestra el selector de reemplazo.
      body.querySelector('.choice-group__replace')?.remove();
      bindChoiceGroups(body, [group], state, { known, spells });
      body.querySelector('[data-ok]').addEventListener('click', () => {
        const msg = choicesError([group], state);
        if (msg) { body.querySelector('.field__error').textContent = msg; return; }
        close(true);
      });
    },
  });
  if (!ok) return;
  const res = replaceChoice(ed.character, classKey, lista, oldValue, state[lista].add[0], { spells });
  if (res.errors.length) return toast(res.errors.join(' '), { type: 'error' });
  ed.replace(res.character, { keepScroll: true, message: `${def.titulo ?? lista}: cambiado.` });
}

/** Extensiones Homebrew asignadas a esta clase (subclases secretas, bendiciones…). */
function extensionsPanel(ctx, f) {
  const assigned = assignedExtensions(ctx.character).filter(({ entry }) => entry.item.classKey === f.classKey);
  const addable = ctx.readOnly ? [] : addableExtensions(ctx.character).filter((e) => e.item.classKey === f.classKey);
  if (!assigned.length && ctx.readOnly) return '';
  if (!assigned.length && !addable.length && !ctx.campaigns?.length && !listEntries('extension', { selectable: false }).length) return '';
  return html`<div class="class-block extension-panel">
    <div class="class-block__head">
      <h4 class="class-block__title">⚜️ Contenido especial</h4>
      ${ctx.readOnly ? '' : html`<div class="row">
        ${addable.length ? html`<button type="button" class="btn btn--ghost btn--sm" data-action="ext-add" data-class="${f.classKey}">＋ Añadir (${addable.length})</button>` : ''}
        <button type="button" class="btn btn--ghost btn--sm" data-action="ext-code">🔑 Tengo un código</button>
      </div>`}
    </div>
    ${assigned.length ? html`<ul class="extension-list">${assigned.map(({ entry }) => {
      const first = entry.item.features[0]?.level ?? 1;
      const active = f.level >= first;
      return html`<li>
        <div><strong>${entry.item.name}</strong>
          <span class="muted"> · ${entry.item.kind === 'subclase' ? f.subclassLabel : 'Habilidad especial'}${entry.item.condition ? ` · ${entry.item.condition}` : ''}</span>
          ${active ? '' : html` <span class="badge">Desde nivel ${first}</span>`}
          ${entry.item.kind === 'subclase' && f.subclass?.key !== entry.ref && f.subclassLevel && f.level >= f.subclassLevel ? html` <button type="button" class="link-btn" data-action="pick-subclass" data-class="${f.classKey}">Elegirla como ${f.subclassLabel.toLowerCase()}</button>` : ''}
        </div>
        ${ctx.readOnly ? '' : html`<button type="button" class="icon-btn" data-action="ext-remove" data-ref="${entry.ref}" aria-label="Quitar ${entry.item.name}" title="Quitar">×</button>`}
      </li>`;
    })}</ul>` : html`<p class="muted">Subclases secretas, bendiciones o evoluciones que tu DM te asigne aparecerán aquí.</p>`}
  </div>`;
}

/** Agrupa niveles consecutivos sin rasgos para no llenar la línea temporal de vacíos. */
function timelineEntries(f) {
  const entries = [];
  for (const l of f.levels) {
    const items = [...l.features.map((x) => ({ ...x, sub: false })), ...l.subFeatures.map((x) => ({ ...x, sub: true }))];
    if (items.length) { entries.push({ type: 'level', level: l.level, items }); continue; }
    const kind = l.defined ? 'empty' : 'missing';
    const last = entries.at(-1);
    if (last?.type === kind && last.to === l.level - 1) last.to = l.level;
    else entries.push({ type: kind, from: l.level, to: l.level });
  }
  return entries;
}

function timeline(f) {
  const entries = timelineEntries(f);
  const range = (e) => (e.from === e.to ? `Nivel ${e.from}` : `Niveles ${e.from}–${e.to}`);
  const next = f.next && [...f.next.features, ...f.next.subFeatures].length ? f.next : null;
  return html`<div class="class-block">
    <div class="class-block__head"><h4 class="class-block__title">Rasgos por nivel</h4></div>
    <ol class="timeline">
      ${entries.map((e) => (e.type === 'level'
        ? html`<li class="timeline__item ${e.level === f.level ? 'is-current' : ''}" data-level-entry>
            <div class="timeline__marker" aria-hidden="true"><small>Nv</small>${e.level}</div>
            <div class="timeline__content">
              <p class="timeline__label">Nivel ${e.level}${e.level === f.level ? html` <span class="badge badge--gold">Actual</span>` : ''}</p>
              ${e.items.map((i) => featureCard(i, f.subclass?.name ?? f.subclassLabel))}
            </div>
          </li>`
        : html`<li class="timeline__item timeline__item--gap" data-level-entry>
            <div class="timeline__marker timeline__marker--gap" aria-hidden="true">·</div>
            <p class="timeline__gap">${range(e)} · ${e.type === 'missing' ? 'datos pendientes de cargar' : 'sin rasgos nuevos'}</p>
          </li>`))}
      ${next ? html`<li class="timeline__item timeline__item--next" data-level-entry>
          <div class="timeline__marker timeline__marker--next" aria-hidden="true"><small>Nv</small>${next.level}</div>
          <div class="timeline__content">
            <details class="disclosure disclosure--ghost" data-key="next:${f.classKey}">
              <summary>Próximo nivel: ${[...next.features, ...next.subFeatures].map((i) => i.title).filter(Boolean).join(' · ') || `nivel ${next.level}`}</summary>
              <div class="disclosure__body">${[...next.features.map((x) => ({ ...x, sub: false })), ...next.subFeatures.map((x) => ({ ...x, sub: true }))].map((i) => featureCard(i, f.subclass?.name))}</div>
            </details>
          </div>
        </li>` : ''}
    </ol>
  </div>`;
}

function classSection(ctx, f) {
  const id = `tr-class-${f.classKey}`;
  if (f.missing) {
    return html`<section class="traits-section" id="${id}" aria-labelledby="${id}-title">
      ${sectionHead({ id, icon: '❔', eyebrow: 'Clase', title: f.className })}
      <p class="callout callout--warning">Esta clase no existe en los datos actuales; sus rasgos no se pueden mostrar.</p>
    </section>`;
  }
  const gained = f.levels.reduce((n, l) => n + l.features.length + l.subFeatures.length, 0);
  const hp = ctx.sheet.hp.perLevel.filter((p) => p.classKey === f.classKey).reduce((s, p) => s + p.total, 0);
  return html`<section class="traits-section traits-section--class" id="${id}" aria-labelledby="${id}-title">
    <header class="class-hero">
      <span class="class-hero__emblem" aria-hidden="true">${CLASS_ICONS[f.classKey] ?? getClass(f.classKey)?.icono ?? '⚔️'}</span>
      <div class="class-hero__titles">
        <p class="eyebrow">Clase · ${CLASS_SECTIONS[f.section] ?? 'Suplemento'}</p>
        <h3 class="traits-section__title" id="${id}-title">${f.className} <span class="badge badge--gold">Nivel ${f.level}</span></h3>
        ${f.summary ? html`<p class="class-hero__summary">${f.summary}</p>` : ''}
      </div>
      <dl class="class-hero__stats">
        <div><dt>Dado de golpe</dt><dd>d${f.hitDie}</dd></div>
        <div><dt>PG de la clase</dt><dd>${hp}</dd></div>
        <div><dt>Rasgos</dt><dd>${gained}</dd></div>
        <div><dt>${f.subclassLabel}</dt><dd>${f.subclass?.name ?? (f.subclassLevel && f.level < f.subclassLevel ? `Nivel ${f.subclassLevel}` : '—')}</dd></div>
        ${f.classDc ? html`<div title="8 + competencia + ${f.classDc.ability}"><dt>${f.classDc.name}</dt><dd>${f.classDc.value}</dd></div>` : ''}
      </dl>
    </header>
    ${!f.subclass && f.subclassLevel && f.level >= f.subclassLevel && !ctx.readOnly ? html`<div class="callout callout--warning row row--between">
      <p>Te falta elegir tu ${f.subclassLabel.toLowerCase()}.</p>
      <button type="button" class="btn btn--primary btn--sm" data-action="pick-subclass" data-class="${f.classKey}">Elegir ${f.subclassLabel.toLowerCase()}</button>
    </div>` : ''}
    ${f.subclassPending ? html`<p class="callout">Las subclases de ${f.className} están pendientes de definir por el autor de la clase.</p>` : ''}
    ${f.subclass?.pending ? html`<p class="callout">Los rasgos de nivel de esta ${f.subclassLabel.toLowerCase()} aún no están cargados en la app. Consulta el manual (${f.subclass.source ?? 'fuente oficial'}).</p>` : ''}
    ${f.subclass ? html`<div class="subclass-card" ${searchAttr(f.subclass.name, f.subclass.description)}>
      <p class="eyebrow">${f.subclassLabel}</p>
      <h4 class="subclass-card__title">${f.subclass.name}</h4>
      ${clampable(f.subclass.description.replace(/^✦[^\n]*\n/, ''))}
    </div>` : ''}
    <div class="class-columns">
      ${basicsPanel(ctx, f)}
      ${progressionTable(f)}
    </div>
    ${choicesPanel(ctx, f)}
    ${extensionsPanel(ctx, f)}
    ${timeline(f)}
    ${f.missingLevels.length ? html`<p class="callout callout--warning">Faltan datos de ${f.className} para ${f.missingLevels.length === 1 ? 'el nivel' : 'los niveles'} ${f.missingLevels.join(', ')}. Consulta el manual o a tu DM.</p>` : ''}
  </section>`;
}

// ── Índice y página ──────────────────────────────────────────────────────

function nav(ctx, classes) {
  const links = [
    { href: '#tr-race', label: ctx.character.race.key ? `🧬 ${raceName(ctx.character.race.key)}` : '🧬 Raza' },
    ...(ctx.sheet.background ? [{ href: '#tr-background', label: '📜 Trasfondo' }] : []),
    ...(ctx.sheet.feats.length || ctx.character.epicBoons.length ? [{ href: '#tr-feats', label: '✦ Dotes' }] : []),
    ...(ctx.character.traits.length || !ctx.readOnly ? [{ href: '#tr-other', label: '✧ Otros rasgos' }] : []),
    ...classes.map((f) => ({ href: `#tr-class-${f.classKey}`, label: `${CLASS_ICONS[f.classKey] ?? getClass(f.classKey)?.icono ?? '⚔️'} ${f.className} ${f.level}` })),
  ];
  return html`<nav class="traits-nav" aria-label="Índice de rasgos">
    <p class="traits-nav__title">En esta página</p>
    <ul>${links.map((l) => html`<li><a href="${l.href}" data-trait-link>${l.label}</a></li>`)}</ul>
  </nav>`;
}

export function renderFeatures(ctx) {
  const classes = classFeatures(ctx.character);
  return html`<div class="traits-layout">
    ${nav(ctx, classes)}
    <div class="traits-main">
      <div class="traits-search">
        <label class="visually-hidden" for="trait-search">Buscar rasgo</label>
        <input id="trait-search" class="input" type="search" placeholder="Buscar rasgo, dote o competencia…" value="${ctx.ui.traitsQuery}" data-trait-search autocomplete="off">
        <p class="traits-search__status muted" data-trait-status aria-live="polite"></p>
      </div>
      ${raceSection(ctx)}
      ${backgroundSection(ctx)}
      ${featsSection(ctx)}
      ${customTraitsSection(ctx)}
      ${classes.length
        ? classes.map((f) => classSection(ctx, f))
        : html`<div class="empty-state"><h2>Sin rasgos de clase</h2><p>Sube a nivel 1 en «Progresión» para ver los rasgos de tu clase.</p></div>`}
    </div>
  </div>`;
}

/** Filtra tarjetas por texto sin volver a renderizar (conserva el foco). */
export function applyTraitFilter(root, query) {
  const q = norm(query.trim());
  const cards = root.querySelectorAll('[data-search-text]');
  let shown = 0;
  for (const el of cards) {
    const match = !q || el.dataset.searchText.includes(q);
    el.hidden = !match;
    if (match) shown++;
    if (q && match) {
      for (const box of el.querySelectorAll('.clampable.is-clamped')) {
        box.classList.remove('is-clamped');
        const btn = box.querySelector('[data-expand]');
        if (btn) { btn.textContent = 'Leer menos'; btn.setAttribute('aria-expanded', 'true'); }
      }
    }
  }
  for (const entry of root.querySelectorAll('[data-level-entry]')) {
    entry.hidden = Boolean(q) && !entry.querySelector('[data-search-text]:not([hidden])');
  }
  for (const section of root.querySelectorAll('.traits-section')) {
    section.classList.toggle('is-filtered-out', Boolean(q) && !section.querySelector('[data-search-text]:not([hidden])'));
  }
  const status = root.querySelector('[data-trait-status]');
  if (status) status.textContent = q ? (shown ? `${shown} resultado(s) para «${query.trim()}»` : `Sin resultados para «${query.trim()}»`) : '';
}

async function editTrait(ed, id) {
  const current = id ? ed.character.traits.find((t) => t.id === id) : null;
  const perms = ed.permissions;
  const trait = await openTraitEditor(current, { allowEffects: perms.traitEffects !== false, catalog: perms.homebrew.rasgo ? listEntries('rasgo') : [] });
  if (!trait) return;
  ed.update((c) => {
    const i = c.traits.findIndex((t) => t.id === trait.id);
    if (i >= 0) c.traits[i] = trait; else c.traits.push(trait);
  }, { keepScroll: true });
}

async function addExtension(ed, classKey) {
  const options = addableExtensions(ed.character).filter((e) => e.item.classKey === classKey);
  const ref = await openDialog({
    title: 'Añadir contenido especial',
    size: 'lg',
    render(body, close) {
      setHtml(body, html`<div class="stack stack--sm">${options.map((e) => html`<button type="button" class="option-card" data-ref="${e.ref}">
        <span><strong>${e.item.name}</strong> <span class="badge">${e.item.kind === 'subclase' ? 'Subclase' : 'Habilidad especial'}</span>
        ${e.item.condition ? html`<span class="muted"> · ${e.item.condition}</span>` : ''}
        <span class="rich">${richText(e.item.description || e.item.features.map((x) => `Nivel ${x.level}: ${x.name}`).join('\n'))}</span></span></button>`)}</div>
        <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button></div>`);
      body.addEventListener('click', (e) => { const b = e.target.closest('[data-ref]'); if (b) close(b.dataset.ref); });
    },
  });
  if (!ref) return;
  ed.replace(addUnlock(ed.character, ref), { keepScroll: true, message: 'Contenido especial añadido.' });
}

async function unlockWithCode(ed) {
  const result = await openDialog({
    title: 'Desbloquear con un código',
    size: 'sm',
    render(body, close) {
      setHtml(body, html`<form class="stack" data-f novalidate>
        <div class="field"><label class="field__label" for="unlock-code">Código que te dio el DM</label>
          <input id="unlock-code" class="input" autocomplete="off" autocapitalize="characters" placeholder="ABCD-EFGH-JKLM" maxlength="20" autofocus></div>
        <p class="field__error" data-error role="alert"></p>
        <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button class="btn btn--primary">Desbloquear</button></div>
      </form>`);
      body.querySelector('[data-f]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const raw = body.querySelector('#unlock-code').value;
        const code = normalizeUnlockCode(raw);
        const entry = code ? await findByCode(code) : null;
        if (!entry) {
          body.querySelector('[data-error]').textContent = 'Ese código no corresponde a ningún contenido disponible. Comprueba que estás en la campaña correcta y que el DM lo ha publicado.';
          return;
        }
        close({ entry, code });
      });
    },
  });
  if (!result) return;
  const { entry, code } = result;
  if (!ed.character.levels.some((l) => l.classKey === entry.item.classKey)) {
    toast(`«${entry.item.name}» es para la clase ${getClass(entry.item.classKey)?.nombre ?? entry.item.classKey}, que tu personaje no tiene. Se guardará igualmente y se aplicará si la consigues.`, { type: 'warning' });
  }
  ed.replace(addUnlock(ed.character, entry.ref, code), { keepScroll: true, message: `Desbloqueado: ${entry.item.name}.` });
}

async function pickSubclass(ed, classKey) {
  const info = subclassInfo(classKey, ed.character);
  if (!info) return;
  const key = await openDialog({
    title: `Elige tu ${info.label.toLowerCase()}`,
    size: 'lg',
    render(body, close) {
      setHtml(body, html`<div class="stack stack--sm">${info.options.map((o) => html`<button type="button" class="option-card" data-sub="${o.key}">
        <span><strong>${o.name}</strong><span class="rich">${richText(o.description)}</span></span></button>`)}</div>
        <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button></div>`);
      body.addEventListener('click', (e) => { const b = e.target.closest('[data-sub]'); if (b) close(b.dataset.sub); });
    },
  });
  if (!key) return;
  const res = setSubclass(ed.character, classKey, key);
  if (res.errors.length) return toast(res.errors.join(' '), { type: 'error' });
  ed.replace(res.character, { keepScroll: true, message: `${info.label}: ${info.options.find((o) => o.key === key)?.name}.` });
}

export const featuresActions = {
  'ext-add': (ed, el) => addExtension(ed, el.dataset.class),
  'ext-code': (ed) => unlockWithCode(ed),
  async 'ext-remove'(ed, el) {
    const entry = assignedExtensions(ed.character).find((x) => x.entry.ref === el.dataset.ref)?.entry;
    const ok = await confirmDialog({ title: 'Quitar contenido especial', message: `¿Quitar «${entry?.item.name ?? 'este contenido'}» del personaje? Si era tu subclase, tendrás que elegir otra. Si tenía código, necesitarás el código otra vez para recuperarlo.`, confirmLabel: 'Quitar', danger: true });
    if (ok) ed.replace(removeUnlock(ed.character, el.dataset.ref), { keepScroll: true });
  },
  'pick-subclass': (ed, el) => pickSubclass(ed, el.dataset.class),
  'choices-fill': (ed, el) => fillChoices(ed, el.dataset.class, el.dataset.only || null),
  'choice-change': (ed, el) => changeChoice(ed, el.dataset.class, el.dataset.list, el.dataset.value),
  'trait-add': (ed) => editTrait(ed, null),
  'trait-edit': (ed, el) => editTrait(ed, el.dataset.id),
  'trait-toggle': (ed, el) => ed.update((c) => {
    const t = c.traits.find((x) => x.id === el.dataset.id);
    if (t) t.active = !t.active;
  }, { keepScroll: true }),
  async 'trait-delete'(ed, el) {
    const t = ed.character.traits.find((x) => x.id === el.dataset.id);
    if (!t || !(await confirmDialog({ title: 'Eliminar rasgo', message: `¿Eliminar «${t.name}»? Sus efectos dejarán de aplicarse.`, confirmLabel: 'Eliminar', danger: true }))) return;
    ed.update((c) => { c.traits = c.traits.filter((x) => x.id !== t.id); }, { keepScroll: true });
  },
  'class-skill': (ed, el) => {
    const { class: classKey, key } = el.dataset;
    const cur = ed.character.classChoices?.[classKey]?.skills ?? [];
    const next = cur.includes(key) ? cur.filter((s) => s !== key) : [...cur, key];
    ed.replace(setClassSkills(ed.character, classKey, next), { keepScroll: true, refocus: `[data-action="class-skill"][data-class="${classKey}"][data-key="${key}"]` });
  },
  'class-save': (ed, el) => {
    const { class: classKey, key } = el.dataset;
    const cur = ed.character.classChoices?.[classKey]?.saves ?? [];
    ed.replace(setClassSaves(ed.character, classKey, cur.includes(key) ? [] : [key]), { keepScroll: true });
  },
  'class-skills-from-manual': (ed, el) => {
    const classKey = el.dataset.class;
    const st = ed.sheet.classChoices.find((x) => x.classKey === classKey);
    if (!st?.skills) return;
    const extra = ed.character.proficiencies.skills
      .filter((m) => st.skills.options.includes(m) && !st.chosenSkills.includes(m) && !st.blockedByBackground.includes(m))
      .slice(0, st.skillsRemaining);
    ed.replace(setClassSkills(ed.character, classKey, [...st.chosenSkills, ...extra]), { keepScroll: true, message: 'Habilidades asignadas a la clase.' });
  },
  'restore-race-traits': (ed) => ed.update((c) => { c.notes.raceTraits = getRace(c.race.key)?.info ?? ''; }, { structural: true }),
  'toggle-trait-edit': (ed, el) => {
    const key = el.dataset.target;
    if (ed.ui.traitsEdit.has(key)) ed.ui.traitsEdit.delete(key);
    else ed.ui.traitsEdit.add(key);
    ed.rerender({ keepScroll: true });
    if (ed.ui.traitsEdit.has(key)) ed.root.querySelector(`#tr-${key === 'race' ? 'race' : `class-${key.slice(6)}`} textarea`)?.focus();
  },
};

