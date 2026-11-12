// Controlador de la ficha: pestañas, renderizado y eventos.
// Lo usan el editor (editable, con guardado) y la vista compartida (sólo lectura).

import { permissionsFor } from '../../content/rules.js';
import { html, setHtml, setPath, getPath } from '../../ui/dom.js';
import { computeSheet } from '../../domain/rules.js';
import { loadSpells } from '../../data/index.js';
import { reportError, toast, confirmDialog } from '../../ui/feedback.js';
import { portraitFromFile } from '../../services/image.js';
import { rollAbilityScore } from '../../domain/progression.js';
import { ABILITY_KEYS } from '../../domain/constants.js';
import { TABS, ACTIONS, CHANGES } from './index.js';
import { onSpellFilter } from './spells.js';
import { applyTraitFilter } from './features.js';
import { onBackgroundChange } from './background.js';
import { computeOutputs, applyOutputs } from './outputs.js';
import { setEntry } from '../../domain/personality.js';
import { alignmentStyle } from '../../domain/alignment.js';

function parseValue(el) {
  const type = el.dataset.type;
  if (type === 'bool') return el.checked;
  if (type === 'int' || type === 'optint') {
    if (el.value.trim() === '') return type === 'optint' ? null : undefined;
    const n = Math.trunc(Number(el.value));
    if (!Number.isFinite(n)) return undefined;
    const min = Number(el.dataset.min ?? -Infinity);
    const max = Number(el.dataset.max ?? Infinity);
    return Math.min(max, Math.max(min, n));
  }
  return el.value;
}

/**
 * @param {HTMLElement} root
 * @param {{ character: object, readOnly?: boolean, initialTab?: string, onChange?: (c: object) => void,
 *   listHomebrewBackgrounds?: () => Promise<object[]> }} opts
 */
export function createSheetView(root, { character, readOnly = false, initialTab = 'resumen', onChange, listHomebrewBackgrounds = async () => [], campaigns = () => [], recordId = null }) {
  const ed = {
    root,
    readOnly,
    character,
    sheet: computeSheet(character),
    tab: initialTab,
    listHomebrewBackgrounds,
    spells: null,
    ui: {
      spells: { query: '', level: '', school: '', type: '', onlyMine: true, page: 1 },
      traitsEdit: new Set(),
      traitsQuery: '',
    },
  };

  const tabsEl = document.createElement('div');
  tabsEl.className = 'tabs';
  tabsEl.setAttribute('role', 'tablist');
  tabsEl.setAttribute('aria-label', 'Secciones de la ficha');
  const panel = document.createElement('div');
  panel.className = 'tab-panel';
  panel.setAttribute('role', 'tabpanel');
  panel.id = 'sheet-panel';
  root.append(tabsEl, panel);

  Object.defineProperty(ed, 'permissions', { get: () => permissionsFor(ed.character) });
  // recordId: id local del personaje (para enlazar con la Tienda). null en la vista compartida.
  const ctx = () => ({ character: ed.character, sheet: ed.sheet, readOnly, spells: ed.spells, ui: ed.ui, permissions: ed.permissions, campaigns: campaigns(), recordId });

  function visibleTabs() {
    const c = ctx();
    return TABS.filter((t) => !t.visible || t.visible(c));
  }

  function renderTabs() {
    const c = ctx();
    const tabs = visibleTabs();
    if (!tabs.some((t) => t.id === ed.tab)) ed.tab = 'resumen';
    setHtml(tabsEl, tabs.map((t) => html`<button type="button" role="tab" class="tab" id="tab-${t.id}" data-tab="${t.id}"
      aria-selected="${t.id === ed.tab}" aria-controls="sheet-panel" tabindex="${t.id === ed.tab ? 0 : -1}">${t.label}${!readOnly && t.attention?.(c) ? html`<span class="tab__dot" title="Hay elecciones pendientes"></span>` : ''}</button>`));
    panel.setAttribute('aria-labelledby', `tab-${ed.tab}`);
  }

  function renderPanel() {
    const tab = TABS.find((t) => t.id === ed.tab) ?? TABS[0];
    // Decoración del alineamiento en toda la ficha (ver styles/alignment.css).
    const align = alignmentStyle(ed.character.identity.alignment);
    if (align) root.dataset.alignment = align.id;
    else delete root.dataset.alignment;
    if (tab.needsSpells && !ed.spells) {
      loadSpells().then((s) => { ed.spells = s; if (ed.tab === tab.id) ed.rerender({ keepScroll: true }); })
        .catch((err) => reportError(err, 'No se pudieron cargar los conjuros.'));
    }
    try {
      setHtml(panel, tab.render(ctx()));
    } catch (err) {
      console.error('[sheet] Error al renderizar', tab.id, err);
      setHtml(panel, html`<div class="callout callout--danger"><p>No se pudo mostrar esta sección. Tus datos no se han perdido; prueba a recargar la página.</p></div>`);
    }
    applyOutputs(panel, computeOutputs(ed.character, ed.sheet));
    if (tab.id === 'rasgos' && ed.ui.traitsQuery) applyTraitFilter(panel, ed.ui.traitsQuery);
  }

  ed.rerender = ({ keepScroll = true, refocus, scrollTo } = {}) => {
    const y = window.scrollY;
    // Conserva qué secciones desplegables estaban abiertas.
    const openKeys = new Set([...panel.querySelectorAll('details[data-key][open]')].map((d) => d.dataset.key));
    const closedKeys = new Set([...panel.querySelectorAll('details[data-key]:not([open])')].map((d) => d.dataset.key));
    renderTabs();
    renderPanel();
    for (const d of panel.querySelectorAll('details[data-key]')) {
      if (openKeys.has(d.dataset.key)) d.open = true;
      else if (closedKeys.has(d.dataset.key)) d.open = false;
    }
    if (keepScroll) window.scrollTo(0, y);
    if (scrollTo) panel.querySelector(scrollTo)?.scrollIntoView({ block: 'start' });
    if (refocus) {
      const el = panel.querySelector(refocus);
      if (el) { el.focus(); if (el.setSelectionRange && el.type === 'search') el.setSelectionRange(el.value.length, el.value.length); }
    }
  };

  function changed({ structural = false, ...opts } = {}) {
    ed.sheet = computeSheet(ed.character);
    if (structural) ed.rerender(opts);
    else {
      applyOutputs(root, computeOutputs(ed.character, ed.sheet));
      renderTabs();
    }
    onChange?.(ed.character);
  }

  /** Muta el personaje en el sitio (rápido, para escritura en campos). */
  ed.update = (mutator, opts = {}) => {
    if (readOnly) return;
    mutator(ed.character);
    changed({ structural: true, ...opts });
    if (opts.focusLast) [...panel.querySelectorAll(opts.focusLast)].at(-1)?.focus();
  };

  /** Sustituye el personaje por uno nuevo devuelto por el dominio. */
  ed.replace = (next, { message, ...opts } = {}) => {
    if (readOnly || !next) return;
    ed.character = next;
    changed({ structural: true, ...opts });
    if (message) toast(message, { type: 'success' });
  };

  ed.setTab = (id, { focus = false } = {}) => {
    ed.tab = id;
    ed.rerender({ keepScroll: false });
    root.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (focus) tabsEl.querySelector(`[data-tab="${id}"]`)?.focus();
  };

  // ── Eventos ────────────────────────────────────────────────────────────
  tabsEl.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) ed.setTab(t.dataset.tab);
  });
  tabsEl.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const ids = visibleTabs().map((t) => t.id);
    let i = ids.indexOf(ed.tab);
    if (e.key === 'ArrowRight') i = (i + 1) % ids.length;
    if (e.key === 'ArrowLeft') i = (i - 1 + ids.length) % ids.length;
    if (e.key === 'Home') i = 0;
    if (e.key === 'End') i = ids.length - 1;
    e.preventDefault();
    ed.setTab(ids[i], { focus: true });
  });

  async function onClick(e) {
    const expand = e.target.closest('[data-expand]');
    if (expand) {
      const box = expand.closest('.clampable');
      const open = box.classList.toggle('is-clamped') === false;
      expand.textContent = open ? 'Leer menos' : 'Leer más';
      expand.setAttribute('aria-expanded', String(open));
      return;
    }
    const link = e.target.closest('[data-trait-link]');
    if (link) {
      e.preventDefault();
      const target = panel.querySelector(link.getAttribute('href'));
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target?.querySelector('h3')?.focus?.();
      return;
    }
    const goto = e.target.closest('[data-action="goto-tab"]');
    if (goto) return ed.setTab(goto.dataset.tab);
    const btn = e.target.closest('[data-action]');
    if (!btn || readOnly || btn.disabled) return;
    const action = btn.dataset.action;
    try {
      if (action === 'roll-abilities') return await rollAbilities();
      const handler = ACTIONS[action];
      if (handler) await handler(ed, btn, e);
    } catch (err) {
      reportError(err);
    }
  }

  async function rollAbilities() {
    const ok = await confirmDialog({
      title: 'Tirar atributos',
      message: 'Se tirarán 4d6 (descartando el menor) para cada atributo y se reemplazarán las puntuaciones base actuales.',
      confirmLabel: '🎲 Tirar',
    });
    if (!ok) return;
    ed.update((c) => { for (const k of ABILITY_KEYS) c.abilities[k] = rollAbilityScore(); });
    toast('¡Atributos tirados! Puedes ajustarlos a mano si tu DM lo permite.', { type: 'success' });
  }

  function onInput(e) {
    const el = e.target;
    if (el.matches('[data-spell-filter]') && el.type === 'search') return onSpellFilter(ed, el);
    if (el.matches('[data-trait-search]')) {
      ed.ui.traitsQuery = el.value;
      return applyTraitFilter(panel, el.value);
    }
    if (el.matches('[data-persona-text]') && !readOnly) {
      // Texto «Personalizado» de una característica (crea la estructura si falta).
      setEntry(ed.character, el.dataset.personaText, { mode: 'custom', text: el.value.slice(0, 1000), index: null });
      return changed({ structural: false });
    }
    if (!el.matches('[data-bind]') || readOnly) return;
    if (el.type === 'checkbox' || el.tagName === 'SELECT') return; // se procesan en change
    const value = parseValue(el);
    if (value === undefined) return;
    if (getPath(ed.character, el.dataset.bind) === value) return;
    setPath(ed.character, el.dataset.bind, value);
    changed({ structural: false });
  }

  async function onChangeEvent(e) {
    const el = e.target;
    if (readOnly) return;
    try {
      if (el.matches('[data-spell-filter]') && el.type !== 'search') return onSpellFilter(ed, el);
      if (el.matches('[data-race-choice]')) return CHANGES['race-choice'](ed, el);
      if (el.matches('[data-bg]')) return onBackgroundChange(ed, el);
      if (el.matches('[data-persona-set]')) return CHANGES['persona-set'](ed, el);
      if (el.matches('[data-affiliation]')) return CHANGES.affiliation(ed, el);
      if (el.matches('[data-language]')) return CHANGES.language(ed, el);
      if (el.matches('[data-workshop-equip]')) return CHANGES['workshop-equip'](ed, el);
      if (el.matches('[data-workshop-filter]')) return CHANGES['workshop-filter'](ed, el);
      if (el.matches('[data-portrait-input]')) {
        const file = el.files?.[0];
        el.value = '';
        if (!file) return;
        const dataUrl = await portraitFromFile(file);
        return ed.update((c) => { c.identity.portrait = dataUrl; });
      }
      if (el.matches('[data-bind]')) {
        const value = parseValue(el);
        if (value === undefined) {
          // Valor numérico vacío/no válido: se restaura el anterior.
          el.value = getPath(ed.character, el.dataset.bind) ?? '';
          return;
        }
        if (el.type === 'number') el.value = value ?? '';
        const structural = el.tagName === 'SELECT' || el.type === 'checkbox' || el.dataset.bind.startsWith('combat.speedOverrides');
        if (getPath(ed.character, el.dataset.bind) !== value) {
          setPath(ed.character, el.dataset.bind, value);
          changed({ structural });
        }
      }
    } catch (err) {
      reportError(err);
    }
  }

  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChangeEvent);

  renderTabs();
  renderPanel();
  return ed;
}

