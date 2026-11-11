// Pestaña «Conjuros»: estadísticas de lanzamiento, espacios, grimorio y biblioteca.

import { getClass } from '../../data/index.js';
import { html, raw, richText } from '../../ui/dom.js';
import { ABILITY_LABEL } from '../../domain/constants.js';
import { formatModifier } from '../../domain/rules.js';
import { sectionCard, out } from './common.js';
import { pendingSpellChoices } from '../../domain/class-choices.js';
import { fillChoices } from './features.js';

const PAGE_SIZE = 12;
const LEVEL_NAMES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Erratas detectadas en spells.json: se normalizan al filtrar (ver docs/DATOS.md).
const SCHOOL_ALIASES = { Trasmutación: 'Transmutación', Necromancia: 'Nigromancia', abjuración: 'Abjuración', Ilución: 'Ilusión', Rvocación: 'Evocación' };
const TYPE_ALIASES = { Curacuón: 'Curación', Acido: 'Ácido', Solcial: 'Social' };
const CLASS_ALIASES = { artífice: 'artifice', paladín: 'paladin' };

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function spellSchool(spell) {
  const s = (spell.escuela ?? '').trim();
  return SCHOOL_ALIASES[s] ?? s;
}
export function spellTypes(spell) {
  return (spell.tipo ?? []).map((t) => TYPE_ALIASES[t] ?? t).filter(Boolean);
}
export function spellClasses(spell) {
  return Object.keys(spell.conjuradorTrue ?? {}).map((k) => CLASS_ALIASES[k] ?? k);
}
const levelLabel = (lvl) => (lvl === 'Truco' ? 'Truco' : `Nivel ${lvl}`);

export function filterSpells(spells, filters, classKeys) {
  const q = norm(filters.query);
  return Object.entries(spells).filter(([name, s]) => {
    if (q && !norm(name).includes(q)) return false;
    if (filters.level && String(s.nivel) !== filters.level) return false;
    if (filters.school && spellSchool(s) !== filters.school) return false;
    if (filters.type && !spellTypes(s).includes(filters.type)) return false;
    // Una clase puede declarar su lista en su JSON (`listaConjuros`) además de la marca del conjuro.
    if (filters.onlyMine && classKeys.length && !spellClasses(s).some((k) => classKeys.includes(k))
      && !classKeys.some((k) => getClass(k)?.listaConjuros?.includes(name))) return false;
    return true;
  }).sort(([a, sa], [b, sb]) => {
    const la = sa.nivel === 'Truco' ? 0 : Number(sa.nivel);
    const lb = sb.nivel === 'Truco' ? 0 : Number(sb.nivel);
    return la - lb || a.localeCompare(b, 'es');
  });
}

function statsCards(ctx) {
  const sc = ctx.sheet.spellcasting;
  const known = ctx.character.spells.known;
  const cantripCount = ctx.spells ? known.filter((n) => ctx.spells[n]?.nivel === 'Truco').length : null;
  const cards = sc.entries.map((e) => html`<div class="cast-card">
      <h4>${e.className} ${e.level}</h4>
      <div class="cast-card__stats">
        <div><span>Atributo</span><strong>${ABILITY_LABEL[e.ability]}</strong></div>
        <div><span>Ataque</span><strong>${out(`cast.${e.classKey}.attack`, formatModifier(e.attack))}</strong></div>
        <div><span>CD salvación</span><strong>${out(`cast.${e.classKey}.dc`, e.dc)}</strong></div>
        ${e.cantrips !== null ? html`<div><span>Trucos</span><strong>${cantripCount ?? '–'}/${e.cantrips}</strong></div>` : ''}
        ${e.known !== null ? html`<div><span>Conocidos</span><strong>${e.known}</strong></div>` : ''}
        ${e.prepared !== null ? html`<div><span>Preparables</span><strong>${out(`cast.${e.classKey}.prepared`, e.prepared)}</strong></div>` : ''}
        ${e.spellbook !== null ? html`<div><span>Libro (mín.)</span><strong>${e.spellbook}</strong></div>` : ''}
      </div>
    </div>`);
  if (sc.featGranted) {
    const f = sc.featGranted;
    cards.push(html`<div class="cast-card"><h4>Por dote: ${f.feat}</h4><div class="cast-card__stats">
      <div><span>Atributo</span><strong>${ABILITY_LABEL[f.ability]}</strong></div>
      <div><span>Ataque</span><strong>${out('cast.feat.attack', formatModifier(f.attack))}</strong></div>
      <div><span>CD salvación</span><strong>${out('cast.feat.dc', f.dc)}</strong></div>
    </div></div>`);
  }
  return html`<div class="cast-cards">${cards}</div>
    ${sc.notes.map((n) => html`<p class="callout callout--warning">${n}</p>`)}`;
}

function slotsTable(ctx) {
  const { slots, pactSlots } = ctx.sheet.spellcasting;
  if (!slots.some(Boolean) && !pactSlots?.some(Boolean)) return '';
  return html`<div class="table-wrap"><table class="table">
    <thead><tr><th>Espacios</th>${LEVEL_NAMES.map((l) => html`<th class="num">${l}</th>`)}</tr></thead>
    <tbody>
      ${slots.some(Boolean) ? html`<tr><td>Por nivel de conjuro</td>${slots.map((n) => html`<td class="num">${n || '—'}</td>`)}</tr>` : ''}
      ${pactSlots?.some(Boolean) ? html`<tr><td>Magia de pacto</td>${pactSlots.map((n) => html`<td class="num">${n || '—'}</td>`)}</tr>` : ''}
    </tbody>
  </table></div>`;
}

function spellMeta(s) {
  return html`<dl class="spell-meta">
    <div><dt>Escuela</dt><dd>${spellSchool(s) || '—'}</dd></div>
    <div><dt>Lanzamiento</dt><dd>${s.tiempoLanzamiento || '—'}</dd></div>
    <div><dt>Alcance</dt><dd>${s.alcance || '—'}</dd></div>
    <div><dt>Componentes</dt><dd>${s.componentes || '—'}</dd></div>
    <div><dt>Duración</dt><dd>${s.duracion || '—'}</dd></div>
    ${s.ataque ? html`<div><dt>Ataque / salvación</dt><dd>${s.ataque}</dd></div>` : ''}
    ${s.origen ? html`<div><dt>Origen</dt><dd>${s.origen}</dd></div>` : ''}
  </dl>`;
}

function spellItem(ctx, name, s, { compact = false } = {}) {
  const inBook = (ctx.sheet.spellcasting.bookSpells ?? []).includes(name);
  const known = inBook || ctx.character.spells.known.includes(name);
  const prepared = ctx.character.spells.prepared.includes(name);
  const actions = ctx.readOnly ? '' : html`<div class="row">
    ${known
      ? html`<button type="button" class="btn btn--sm ${prepared ? 'btn--gold' : 'btn--ghost'}" data-action="spell-prepare" data-spell="${name}" aria-pressed="${prepared}">${prepared ? '★ Preparado' : '☆ Preparar'}</button>
             ${inBook ? html`<span class="badge" title="Añadido a tu libro al subir de nivel; se cambia desde la subida de nivel o la pestaña Rasgos">En tu libro</span>` : html`<button type="button" class="btn btn--sm btn--ghost" data-action="spell-forget" data-spell="${name}">Quitar</button>`}`
      : html`<button type="button" class="btn btn--sm btn--primary" data-action="spell-learn" data-spell="${name}">＋ Añadir</button>`}
  </div>`;
  return html`<details class="disclosure spell ${prepared ? 'is-prepared' : ''}" data-key="${compact ? 'g' : 'l'}:${name}">
    <summary>
      <span class="spell__title">${name}</span>
      <span class="spell__badges"><span class="badge ${s.nivel === 'Truco' ? 'badge--accent' : ''}">${levelLabel(s.nivel)}</span>${compact ? '' : spellTypes(s).slice(0, 2).map((t) => html`<span class="badge">${t}</span>`)}${prepared ? html`<span class="badge badge--gold">★</span>` : ''}</span>
    </summary>
    <div class="disclosure__body">
      ${spellMeta(s)}
      <div class="rich">${richText(s.descripcion)}</div>
      ${actions}
    </div>
  </details>`;
}

function grimoire(ctx) {
  const { prepared } = ctx.character.spells;
  const known = [...new Set([...(ctx.sheet.spellcasting.bookSpells ?? []), ...ctx.character.spells.known])];
  if (!known.length) return html`<p class="muted">Aún no has añadido conjuros. Búscalos en la biblioteca de abajo.</p>`;
  const missing = known.filter((n) => !ctx.spells[n]);
  const groups = {};
  for (const n of known) {
    const s = ctx.spells[n];
    if (!s) continue;
    (groups[s.nivel] ??= []).push(n);
  }
  const order = ['Truco', ...LEVEL_NAMES, '10'];
  return html`<p class="muted">${known.length} conjuro(s) · ${prepared.length} preparado(s)</p>
    ${order.filter((l) => groups[l]).map((l) => html`<h4 class="grimoire__level">${levelLabel(l)}</h4>
      ${groups[l].sort((a, b) => a.localeCompare(b, 'es')).map((n) => spellItem(ctx, n, ctx.spells[n], { compact: true }))}`)}
    ${missing.length ? html`<p class="callout callout--warning">Conjuros que ya no existen en los datos: ${missing.join(', ')}.</p>` : ''}`;
}

/**
 * Lo que el personaje aún puede elegir: conjuros de sus rasgos (libro de
 * conjuros, Arcanum…), trucos y conjuros preparados/conocidos libres.
 * Al subir de nivel no se obliga a elegirlos: se avisa aquí.
 */
export function spellAllowance(ctx) {
  const sc = ctx.sheet.spellcasting;
  const always = new Set((sc.alwaysPrepared ?? []).map((x) => x.name));
  const isCantrip = (n) => ctx.spells?.[n]?.nivel === 'Truco';
  const own = ctx.character.spells.known.filter((n) => !always.has(n));
  const sum = (key) => sc.entries.reduce((t, e) => (e[key] === null ? t : (t ?? 0) + e[key]), null);
  const free = (limit, used) => (limit === null ? 0 : Math.max(0, limit - used));
  const choices = [...new Set(sc.entries.map((e) => e.classKey).concat(Object.keys(ctx.character.subclasses ?? {})))]
    .flatMap((classKey) => pendingSpellChoices(ctx.character, classKey).map((m) => ({ classKey, titulo: m.def.titulo ?? m.lista, cantidad: m.cantidad })));
  const out = {
    choices,
    cantrips: ctx.spells ? free(sum('cantrips'), own.filter(isCantrip).length) : 0,
    prepared: ctx.spells ? free(sum('prepared'), ctx.character.spells.prepared.filter((n) => !isCantrip(n) && !always.has(n)).length) : 0,
    known: ctx.spells ? free(sum('known'), own.filter((n) => !isCantrip(n)).length) : 0,
  };
  out.total = choices.reduce((t, c) => t + c.cantidad, 0) + out.cantrips + out.prepared + out.known;
  return out;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function allowanceCallout(ctx) {
  if (ctx.readOnly) return '';
  const a = spellAllowance(ctx);
  if (!a.total) return '';
  // Una lista puede aparecer en varios niveles: se agrupa por clase y título.
  const byList = new Map();
  for (const c of a.choices) {
    const k = `${c.classKey}|${c.titulo}`;
    byList.set(k, { ...c, cantidad: (byList.get(k)?.cantidad ?? 0) + c.cantidad });
  }
  const classes = [...new Set(a.choices.map((c) => c.classKey))];
  return html`<div class="callout callout--accent spell-allowance" role="status">
    <p><strong>✨ Aún puedes elegir ${plural(a.total, 'conjuro', 'conjuros')}.</strong> Tómate tu tiempo: no hace falta hacerlo todo de una vez.</p>
    <ul class="spell-allowance__list">
      ${[...byList.values()].map((c) => html`<li>${c.titulo}: <strong>${c.cantidad}</strong></li>`)}
      ${a.cantrips ? html`<li>Trucos: <strong>${a.cantrips}</strong> <span class="muted">(añádelos desde la biblioteca)</span></li>` : ''}
      ${a.known ? html`<li>Conjuros conocidos: <strong>${a.known}</strong> <span class="muted">(añádelos desde la biblioteca)</span></li>` : ''}
      ${a.prepared ? html`<li>Conjuros preparados: <strong>${a.prepared}</strong> <span class="muted">(añádelos a tu grimorio y márcalos con ☆)</span></li>` : ''}
    </ul>
    ${classes.length ? html`<div class="row">${classes.map((k) => html`<button type="button" class="btn btn--primary btn--sm" data-action="spell-choices-fill" data-class="${k}">Elegir ${classes.length > 1 ? `(${getClass(k)?.nombre ?? k})` : 'ahora'}</button>`)}</div>` : ''}
  </div>`;
}

/** Conjuros que los rasgos dejan siempre preparados: no ocupan grimorio ni límite. */
function alwaysPrepared(ctx) {
  const list = ctx.sheet.spellcasting.alwaysPrepared ?? [];
  if (!list.length) return '';
  return sectionCard({
    title: 'Siempre preparados',
    subtitle: 'Por tus rasgos. No cuentan para el número de conjuros preparados.',
    body: html`<div class="spell-list">${list.map(({ name, source }) => {
      const s = ctx.spells[name];
      return s
        ? html`<details class="disclosure spell is-prepared" data-key="a:${name}">
            <summary><span class="spell__title">${name}</span><span class="spell__badges"><span class="badge ${s.nivel === 'Truco' ? 'badge--accent' : ''}">${levelLabel(s.nivel)}</span><span class="badge badge--gold">${source}</span></span></summary>
            <div class="disclosure__body">${spellMeta(s)}<div class="rich">${richText(s.descripcion)}</div></div>
          </details>`
        : html`<div class="disclosure spell is-prepared"><div class="row row--between spell__static"><span class="spell__title">${name}</span><span class="spell__badges"><span class="badge badge--gold">${source}</span><span class="badge">No está en el catálogo</span></span></div></div>`;
    })}</div>`,
  });
}

function library(ctx) {
  const f = ctx.ui.spells;
  const all = Object.values(ctx.spells);
  const schools = [...new Set(all.map(spellSchool))].filter((s) => s && !/acción/.test(s)).sort((a, b) => a.localeCompare(b, 'es'));
  const types = [...new Set(all.flatMap(spellTypes))].sort((a, b) => a.localeCompare(b, 'es'));
  // Listas de otras clases que los rasgos permiten usar (p. ej. Secretos mágicos).
  const classKeys = [...new Set([...ctx.sheet.spellcasting.classKeys, ...(ctx.sheet.spellcasting.extraLists ?? [])])];
  const results = filterSpells(ctx.spells, f, classKeys);
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const slice = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const levelOptions = [['', 'Todos los niveles'], ['Truco', 'Trucos'], ...LEVEL_NAMES.map((l) => [l, `Nivel ${l}`]), ['10', 'Nivel 10 (homebrew)']];

  return html`<div class="filters" role="search">
      <input class="input" type="search" placeholder="Buscar conjuro…" value="${f.query}" data-spell-filter="query" aria-label="Buscar conjuro por nombre">
      <select class="select" data-spell-filter="level" aria-label="Nivel">${levelOptions.map(([v, l]) => html`<option value="${v}" ${f.level === v ? raw('selected') : ''}>${l}</option>`)}</select>
      <select class="select" data-spell-filter="school" aria-label="Escuela"><option value="">Todas las escuelas</option>${schools.map((s) => html`<option ${f.school === s ? raw('selected') : ''}>${s}</option>`)}</select>
      <select class="select" data-spell-filter="type" aria-label="Tipo"><option value="">Todos los tipos</option>${types.map((t) => html`<option ${f.type === t ? raw('selected') : ''}>${t}</option>`)}</select>
      ${classKeys.length ? html`<label class="check"><input type="checkbox" data-spell-filter="onlyMine" ${f.onlyMine ? raw('checked') : ''}> Sólo de mis clases</label>` : ''}
    </div>
    <p class="muted" aria-live="polite">${results.length} conjuro(s) encontrados</p>
    <div class="spell-list">${slice.map(([n, s]) => spellItem(ctx, n, s))}</div>
    ${pages > 1 ? html`<nav class="pagination" aria-label="Páginas de conjuros">
      <button type="button" class="btn btn--ghost btn--sm" data-action="spell-page" data-page="${page - 1}" ${page <= 1 ? raw('disabled') : ''}>← Anterior</button>
      <span class="muted">Página ${page} de ${pages}</span>
      <button type="button" class="btn btn--ghost btn--sm" data-action="spell-page" data-page="${page + 1}" ${page >= pages ? raw('disabled') : ''}>Siguiente →</button>
    </nav>` : ''}`;
}

export function renderSpells(ctx) {
  const sc = ctx.sheet.spellcasting;
  if (!ctx.spells) {
    return html`<div class="loading" role="status"><span class="spinner"></span> Cargando conjuros…</div>`;
  }
  return html`<div class="stack">
    ${allowanceCallout(ctx)}
    ${sc.isCaster ? sectionCard({ title: 'Lanzamiento de conjuros', body: html`${statsCards(ctx)}${slotsTable(ctx)}` }) : html`<div class="callout"><p>Tu personaje no tiene una clase lanzadora de conjuros. Puedes anotar igualmente conjuros obtenidos por objetos o rasgos.</p></div>`}
    ${alwaysPrepared(ctx)}
    ${sectionCard({ title: 'Mi grimorio', body: grimoire(ctx) })}
    ${ctx.readOnly ? '' : sectionCard({ title: 'Biblioteca de conjuros', subtitle: 'Añade conjuros a tu grimorio y marca los preparados.', body: library(ctx) })}
  </div>`;
}

export const spellsActions = {
  'spell-learn': (ed, el) => ed.update((c) => {
    if (!c.spells.known.includes(el.dataset.spell)) c.spells.known.push(el.dataset.spell);
  }, { structural: true, keepScroll: true }),
  'spell-forget': (ed, el) => ed.update((c) => {
    c.spells.known = c.spells.known.filter((n) => n !== el.dataset.spell);
    c.spells.prepared = c.spells.prepared.filter((n) => n !== el.dataset.spell);
  }, { structural: true, keepScroll: true }),
  'spell-prepare': (ed, el) => ed.update((c) => {
    const n = el.dataset.spell;
    c.spells.prepared = c.spells.prepared.includes(n) ? c.spells.prepared.filter((x) => x !== n) : [...c.spells.prepared, n];
  }, { structural: true, keepScroll: true }),
  'spell-choices-fill': (ed, el) => fillChoices(ed, el.dataset.class, 'conjuros'),
  'spell-page': (ed, el) => {
    ed.ui.spells.page = Math.max(1, Number(el.dataset.page));
    ed.rerender({ keepScroll: false, scrollTo: '.filters' });
  },
};

export function onSpellFilter(ed, el) {
  const key = el.dataset.spellFilter;
  ed.ui.spells[key] = el.type === 'checkbox' ? el.checked : el.value;
  ed.ui.spells.page = 1;
  ed.rerender({ keepScroll: true, refocus: `[data-spell-filter="${key}"]` });
}
