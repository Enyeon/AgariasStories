// Pestaña «Historia»: aspecto, retrato, idiomas, competencias y trasfondo.

import { html, raw } from '../../ui/dom.js';
import { textField, textArea, sectionCard } from './common.js';
import {
  TRAIT_SETS, traitSetKey, slotsFor, optionsFor, getEntry, setEntry, rollEntry, pickEntry, emptyPersonality,
} from '../../domain/personality.js';
import { alignmentStyle } from '../../domain/alignment.js';

const MODES = [
  { id: 'custom', icon: '✏️', label: 'Personalizado' },
  { id: 'random', icon: '🎲', label: 'Aleatorio' },
  { id: 'list', icon: '📋', label: 'Elegir de la lista' },
];

/** ¿Encaja el alineamiento del ideal («Legal», «Bueno»…) con el del personaje? */
function idealFits(idealAlign, charAlign) {
  if (!idealAlign || !charAlign) return false;
  if (idealAlign === 'Cualquiera') return true;
  const want = { Legal: 'legal', Caótico: 'caótico', Bueno: 'bueno', Malvado: 'malo', Neutral: 'neutral' }[idealAlign];
  return charAlign.toLowerCase().split(' ').includes(want);
}

function optionLabel(opt, ctx) {
  if (!opt.alignment) return '';
  const fits = idealFits(opt.alignment, ctx.character.identity.alignment);
  return html` <span class="persona-tag ${fits ? 'persona-tag--fits' : ''}" title="${fits ? 'Encaja con tu alineamiento' : 'Alineamiento del ideal'}">${opt.alignment}</span>`;
}

function slotBody(ctx, slot, entry, options) {
  const ro = ctx.readOnly;
  if (ro) return entry.text ? html`<p class="persona-text">${entry.text}</p>` : html`<p class="muted">—</p>`;
  const chosen = (icon) => html`<blockquote class="persona-chosen">
      <span class="persona-chosen__die" aria-hidden="true">${icon}${entry.index !== null ? html`<b>${entry.index + 1}</b>` : ''}</span>
      <span>${entry.text}${optionLabel(options[entry.index] ?? {}, ctx)}</span>
    </blockquote>`;
  if (entry.mode === 'random' && entry.index !== null) {
    return html`${chosen('🎲')}<div class="row persona-actions">
      <button type="button" class="btn btn--ghost btn--sm" data-action="persona-reroll" data-slot="${slot.id}">🎲 Volver a tirar</button>
      <button type="button" class="btn btn--ghost btn--sm" data-action="persona-edit" data-slot="${slot.id}">✏️ Retocar</button></div>`;
  }
  if (entry.mode === 'list' && entry.index !== null) {
    return html`${chosen('📋')}<div class="row persona-actions">
      <button type="button" class="btn btn--ghost btn--sm" data-action="persona-change" data-slot="${slot.id}">📋 Cambiar</button>
      <button type="button" class="btn btn--ghost btn--sm" data-action="persona-edit" data-slot="${slot.id}">✏️ Retocar</button></div>`;
  }
  if (entry.mode === 'list') {
    return html`<ol class="persona-options" aria-label="Opciones de ${slot.label}">
      ${options.map((o, i) => html`<li><button type="button" class="persona-option" data-action="persona-pick" data-slot="${slot.id}" data-index="${i}">
        <span class="persona-option__n">${i + 1}</span><span>${o.text}${optionLabel(o, ctx)}</span></button></li>`)}
    </ol>`;
  }
  return html`<textarea class="textarea persona-input" rows="2" maxlength="1000" data-persona-text="${slot.id}" aria-label="${slot.label}" placeholder="${slot.extra ? 'Escribe la tuya…' : 'Escríbelo con tus palabras…'}">${entry.text}</textarea>`;
}

function slotCard(ctx, setKey, slot) {
  const entry = getEntry(ctx.character, slot.id);
  const options = optionsFor(setKey, slot);
  return html`<article class="persona-slot persona-slot--${entry.mode}">
    <header class="persona-slot__head"><h3>${slot.label}</h3>${options.length ? html`<span class="die-badge" title="Tabla de ${options.length} opciones">${slot.die}</span>` : ''}</header>
    ${ctx.readOnly ? '' : html`<div class="persona-modes" role="group" aria-label="¿Cómo querés definirlo?">
      ${MODES.map((m) => html`<button type="button" class="persona-mode" data-action="persona-mode" data-slot="${slot.id}" data-mode="${m.id}"
        aria-pressed="${entry.mode === m.id}" ${m.id !== 'custom' && !options.length ? raw('disabled title="Elige unas tablas de trasfondo"') : ''}><span aria-hidden="true">${m.icon}</span>${m.label}</button>`)}
    </div>`}
    ${slotBody(ctx, slot, entry, options)}
  </article>`;
}

function personalityCard(ctx) {
  const c = ctx.character;
  const setKey = traitSetKey(c);
  const fromBackground = c.personality?.set ? null : setKey;
  const align = alignmentStyle(c.identity.alignment);
  const select = ctx.readOnly ? '' : html`<label class="persona-set">
      <span>Tablas</span>
      <select class="select select--sm" data-persona-set aria-label="Tablas de características">
        <option value="" ${!c.personality?.set ? 'selected' : ''}>${fromBackground ? `Las del trasfondo (${TRAIT_SETS[fromBackground].name})` : 'Las del trasfondo (sin tablas)'}</option>
        ${Object.entries(TRAIT_SETS).map(([k, set]) => html`<option value="${k}" ${c.personality?.set === k ? 'selected' : ''}>${set.name}</option>`)}
      </select>
    </label>`;
  return sectionCard({
    title: 'Personalidad',
    subtitle: setKey
      ? `Tablas de ${TRAIT_SETS[setKey].name}${align ? ` · ${align.name}` : ''}. ✏️ Escríbelo, 🎲 tíralo o 📋 elígelo.`
      : 'Escríbelas tú o elige unas tablas de trasfondo para tirar o elegir.',
    actions: select,
    body: html`<div class="persona-grid">${slotsFor(setKey).map((slot) => slotCard(ctx, setKey, slot))}</div>`,
  });
}

function portraitCard(ctx) {
  const src = ctx.character.identity.portrait;
  return html`<div class="portrait">
    <div class="portrait__frame">${src ? html`<img src="${src}" alt="Retrato de ${ctx.character.identity.name || 'el personaje'}">` : html`<span class="portrait__empty" aria-hidden="true">🜲</span>`}</div>
    ${ctx.readOnly ? '' : html`<div class="row">
      <label class="btn btn--ghost btn--sm">${src ? 'Cambiar imagen' : 'Subir imagen'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="visually-hidden" data-portrait-input></label>
      ${src ? html`<button type="button" class="btn btn--ghost btn--sm" data-action="remove-portrait">Quitar</button>` : ''}
    </div>
    <p class="field__hint">Se redimensiona a 512 px para que el personaje ocupe poco.</p>`}
  </div>`;
}

export function renderStory(ctx) {
  const lang = ctx.sheet.languages;
  const known = [...lang.fixed, ...lang.chosen];
  return html`<div class="stack">
    ${sectionCard({
      title: 'Identidad',
      body: html`<div class="identity-layout">
        ${portraitCard(ctx)}
        <div class="form-grid">
          ${textField(ctx, { label: 'Nombre del personaje', path: 'identity.name' })}
          ${textField(ctx, { label: 'Jugador/a', path: 'identity.player', placeholder: 'Tu nombre' })}
          ${textField(ctx, { label: 'Edad', path: 'identity.age', placeholder: 'En años' })}
          ${textField(ctx, { label: 'Altura', path: 'identity.height', placeholder: 'cm o pies' })}
          ${textField(ctx, { label: 'Peso', path: 'identity.weight', placeholder: 'kg o lb' })}
          ${textField(ctx, { label: 'Ojos', path: 'identity.eyes', placeholder: 'Ámbar, grises…' })}
          ${textField(ctx, { label: 'Piel', path: 'identity.skin', placeholder: 'Pálida, azulada…' })}
          ${textField(ctx, { label: 'Pelo', path: 'identity.hair', placeholder: 'Negro, blanco…' })}
        </div>
      </div>`,
    })}
    <div class="grid-2">
      ${sectionCard({
        title: 'Idiomas',
        subtitle: known.length ? known.join(', ') : 'Según la raza elegida.',
        body: textArea(ctx, { label: 'Otros idiomas y notas', path: 'notes.languages', rows: 4, placeholder: 'Idiomas aprendidos en campaña…' }),
      })}
      ${sectionCard({
        title: 'Competencias',
        subtitle: ctx.sheet.background?.tools.length ? `Del trasfondo: ${ctx.sheet.background.tools.join(', ')}` : 'Armaduras, armas, herramientas…',
        body: textArea(ctx, { label: 'Competencias', path: 'notes.proficiencies', rows: 4, hideLabel: true, placeholder: 'Armadura ligera, espadas cortas, herramientas de ladrón…' }),
      })}
    </div>
    ${personalityCard(ctx)}
    ${sectionCard({
      title: 'Historia',
      body: textArea(ctx, { label: 'Historia', path: 'notes.backstory', rows: 14, tall: true, hideLabel: true, placeholder: 'Escribe aquí la historia, el pasado o la mitología de tu personaje…' }),
    })}
  </div>`;
}

const slotOf = (c, id) => slotsFor(traitSetKey(c)).find((s) => s.id === id);

export const storyActions = {
  'remove-portrait': (ed) => ed.update((c) => { c.identity.portrait = null; }, { structural: true }),
  'persona-mode'(ed, el) {
    const id = el.dataset.slot;
    const mode = el.dataset.mode;
    const current = getEntry(ed.character, id);
    if (current.mode === mode && mode !== 'random') return;
    ed.update((c) => {
      const slot = slotOf(c, id);
      if (!slot) return;
      if (mode === 'random') setEntry(c, id, rollEntry(c, slot, traitSetKey(c)) ?? current);
      else if (mode === 'list') setEntry(c, id, { mode: 'list', text: '', index: null });
      else setEntry(c, id, { mode: 'custom', text: current.text, index: null });
    }, mode === 'custom' ? { refocus: `[data-persona-text="${id}"]` } : {});
  },
  'persona-reroll': (ed, el) => ed.update((c) => {
    const slot = slotOf(c, el.dataset.slot);
    const rolled = slot && rollEntry(c, slot, traitSetKey(c));
    if (rolled) setEntry(c, slot.id, rolled);
  }),
  'persona-pick': (ed, el) => ed.update((c) => {
    const slot = slotOf(c, el.dataset.slot);
    const picked = slot && pickEntry(traitSetKey(c), slot, Number(el.dataset.index));
    if (picked) setEntry(c, slot.id, picked);
  }),
  'persona-change': (ed, el) => ed.update((c) => setEntry(c, el.dataset.slot, { mode: 'list', text: '', index: null })),
  'persona-edit': (ed, el) => ed.update((c) => {
    setEntry(c, el.dataset.slot, { mode: 'custom', text: getEntry(c, el.dataset.slot).text, index: null });
  }, { refocus: `[data-persona-text="${el.dataset.slot}"]` }),
};

export const storyChanges = {
  'persona-set': (ed, el) => ed.update((c) => {
    c.personality = c.personality ?? emptyPersonality();
    c.personality.set = el.value || null;
  }),
};

