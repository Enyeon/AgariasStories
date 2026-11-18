// Pestaña «Mundo» de una campaña: lugares, PNJ, facciones, misiones, pistas y
// notas. El DM decide qué se descubre (todos, algunos o nadie); los jugadores
// ven lo descubierto y escriben sus notas (privadas o compartidas).

import { html, raw, setHtml, formatDate } from '../ui/dom.js';
import { toast, confirmDialog, openDialog, reportError } from '../ui/feedback.js';
import {
  WORLD_KINDS, QUEST_STATUS, ATTITUDES, REVEAL,
  normalizeWorldData, normalizeSecret, questProgress, sortWorld, matchesQuery, relatedTo,
} from '../domain/campaign-world.js';
import { campaignError } from '../services/campaign-play.js';

/**
 * @param {{ id: string, play: object, isDm: () => boolean, me: () => string|null,
 *   members: () => object[], canWrite: () => boolean }} opts
 */
export function createWorldPanel({ id, play, isDm, me, members, canWrite }) {
  const state = { entries: null, error: null, kind: 'todo', query: '', loading: false };
  let root = null;

  const byId = (entryId) => state.entries?.find((e) => e.entryId === entryId) ?? null;
  const mine = (e) => e.author === 'jugador' && e.memberId === me();
  const editable = (e) => (e.author === 'dm' ? isDm() : mine(e));
  const memberName = (mid) => members().find((m) => m.memberId === mid)?.name ?? '¿?';

  async function load() {
    state.loading = true;
    try {
      state.entries = (await play.world(id)).entries;
      state.error = null;
    } catch (err) {
      state.error = campaignError(err);
    }
    state.loading = false;
    paint();
  }

  function revealBadge(e) {
    if (!isDm() && e.author === 'dm') return '';
    const r = REVEAL[e.reveal] ?? REVEAL.oculto;
    const who = e.reveal === 'algunos' && e.revealedTo?.length ? `: ${e.revealedTo.map(memberName).join(', ')}` : '';
    return html`<span class="badge ${e.reveal === 'oculto' ? '' : e.reveal === 'autor' ? '' : 'badge--success'}" title="${r.label}${who}">${r.icon} ${r.short}${who}</span>`;
  }

  function card(e) {
    const k = WORLD_KINDS[e.kind];
    const q = e.kind === 'mision' ? e.data.quest ?? {} : null;
    const prog = q ? questProgress(e) : null;
    const place = e.data.placeId ? byId(e.data.placeId) : null;
    return html`<li class="world-card world-card--${e.kind} ${e.reveal === 'oculto' ? 'is-hidden' : ''}">
      <button type="button" class="world-card__main" data-w-open="${e.entryId}">
        <span class="world-card__icon" aria-hidden="true">${k.icon}</span>
        <span class="world-card__body">
          <strong class="world-card__title">${e.title}</strong>
          <span class="row world-card__badges">
            ${q ? html`<span class="badge ${QUEST_STATUS[q.status]?.badge ?? ''}">${QUEST_STATUS[q.status]?.label ?? ''}</span>` : ''}
            ${e.kind === 'pnj' && e.data.attitude && e.data.attitude !== 'desconocido' ? html`<span class="badge">${ATTITUDES[e.data.attitude].icon} ${ATTITUDES[e.data.attitude].label}</span>` : ''}
            ${revealBadge(e)}
            ${e.author === 'jugador' && !mine(e) ? html`<span class="badge">✍ ${memberName(e.memberId)}</span>` : ''}
          </span>
          ${e.data.role ? html`<span class="muted world-card__meta">${e.data.role}</span>` : ''}
          ${place ? html`<span class="muted world-card__meta">📍 ${place.title}</span>` : ''}
          ${e.data.summary ? html`<span class="world-card__summary">${e.data.summary}</span>` : ''}
          ${prog?.total ? html`<span class="quest-bar" title="${prog.done} de ${prog.total} objetivos"><span style="width:${Math.round((prog.done / prog.total) * 100)}%"></span></span><small class="muted">${prog.done}/${prog.total} objetivos</small>` : ''}
        </span>
      </button>
    </li>`;
  }

  function view() {
    if (state.entries == null) {
      return state.error
        ? html`<div class="callout callout--warning"><p>${state.error.userMessage ?? 'No se pudo cargar el Mundo.'}</p><button class="btn btn--ghost btn--sm" data-w-act="reload">Reintentar</button></div>`
        : html`<div class="loading" role="status"><span class="spinner"></span> Cargando el Mundo…</div>`;
    }
    const all = sortWorld(state.entries);
    const counts = Object.fromEntries(Object.keys(WORLD_KINDS).map((k) => [k, all.filter((e) => e.kind === k).length]));
    const shown = all.filter((e) => (state.kind === 'todo' || e.kind === state.kind) && matchesQuery(e, state.query));
    const groups = Object.keys(WORLD_KINDS).map((k) => [k, shown.filter((e) => e.kind === k)]).filter(([, list]) => list.length);
    const kinds = isDm() ? Object.keys(WORLD_KINDS) : ['nota'];
    return html`
      <div class="world-toolbar">
        <input class="input" type="search" placeholder="Buscar en el Mundo…" value="${state.query}" data-w-query aria-label="Buscar en el Mundo">
        ${canWrite() ? html`<div class="row">
          ${kinds.length > 1 ? html`<label class="visually-hidden" for="w-new">Tipo</label><select id="w-new" class="select select--sm" data-w-newkind>${kinds.map((k) => html`<option value="${k}">${WORLD_KINDS[k].icon} ${WORLD_KINDS[k].label}</option>`)}</select>` : ''}
          <button type="button" class="btn btn--primary btn--sm" data-w-act="new">＋ ${isDm() ? 'Nuevo' : 'Nota'}</button></div>` : ''}
      </div>
      <div class="inv-filters" role="group" aria-label="Filtrar por tipo">
        <button type="button" class="chip-btn ${state.kind === 'todo' ? 'is-on' : ''}" data-w-kind="todo" aria-pressed="${state.kind === 'todo'}">Todo (${all.length})</button>
        ${Object.entries(WORLD_KINDS).filter(([k]) => counts[k]).map(([k, v]) => html`<button type="button" class="chip-btn ${state.kind === k ? 'is-on' : ''}" data-w-kind="${k}" aria-pressed="${state.kind === k}">${v.icon} ${v.plural} (${counts[k]})</button>`)}
      </div>
      ${!all.length ? html`<div class="empty-state"><h2>El Mundo está por descubrir</h2><p>${isDm()
        ? 'Crea lugares, PNJ, facciones, misiones y pistas. Empiezan ocultos: tú decides cuándo y quién los descubre.'
        : 'Aquí aparecerá lo que vayáis descubriendo. Mientras tanto, puedes escribir tus notas (privadas o para la mesa).'}</p></div>`
        : groups.length ? groups.map(([k, list]) => html`<h3 class="camp-h2">${WORLD_KINDS[k].icon} ${WORLD_KINDS[k].plural}</h3><ul class="world-list" role="list">${list.map(card)}</ul>`)
          : html`<p class="muted">Nada coincide con la búsqueda.</p>`}`;
  }

  function paint() {
    if (!root?.isConnected) return;
    const focused = document.activeElement?.matches?.('[data-w-query]');
    const caret = focused ? document.activeElement.selectionStart : null;
    setHtml(root, view());
    if (focused) {
      const q = root.querySelector('[data-w-query]');
      q?.focus();
      if (caret != null) q?.setSelectionRange(caret, caret);
    }
  }

  // ── Detalle y edición ─────────────────────────────────────────────────

  async function openEntry(entryId) {
    const e = byId(entryId);
    if (!e) return;
    const k = WORLD_KINDS[e.kind];
    const related = relatedTo(e, state.entries);
    const q = e.data.quest;
    let objectives = q?.objectives ?? [];
    const action = await openDialog({
      title: `${k.icon} ${e.title}`,
      size: 'md',
      render(body, close) {
        setHtml(body, html`<div class="stack world-detail">
          <p class="row">${revealBadge(e)}${q ? html`<span class="badge ${QUEST_STATUS[q.status]?.badge ?? ''}">${QUEST_STATUS[q.status]?.label}</span>` : ''}
            ${e.data.tags?.map((t) => html`<span class="badge">#${t}</span>`) ?? ''}</p>
          ${e.data.role ? html`<p><strong>${e.data.role}</strong>${e.data.attitude && e.data.attitude !== 'desconocido' ? ` · ${ATTITUDES[e.data.attitude].icon} ${ATTITUDES[e.data.attitude].label}` : ''}</p>` : ''}
          ${e.data.summary ? html`<p class="world-detail__summary">${e.data.summary}</p>` : ''}
          ${e.data.details ? html`<div class="world-detail__text">${e.data.details}</div>` : ''}
          ${q ? html`<section><h3 class="camp-h2">Objetivos</h3>
            ${q.objectives.length ? html`<ul class="quest-objectives" role="list">${q.objectives.map((o, i) => html`<li>
              ${isDm() ? html`<label class="check"><input type="checkbox" data-w-obj="${i}" ${o.done ? raw('checked') : ''}> <span class="${o.done ? 'is-done' : ''}">${o.text}</span></label>`
                : html`<span>${o.done ? '✅' : '⬜'} <span class="${o.done ? 'is-done' : ''}">${o.text}</span></span>`}</li>`)}</ul>` : html`<p class="muted">Sin objetivos.</p>`}
            ${q.reward ? html`<p>🏆 <strong>Recompensa:</strong> ${q.reward}</p>` : ''}</section>` : ''}
          ${related.length ? html`<section><h3 class="camp-h2">Relacionado</h3><div class="row">${related.map((r) => html`<button type="button" class="chip-btn" data-w-goto="${r.entryId}">${WORLD_KINDS[r.kind].icon} ${r.title}</button>`)}</div></section>` : ''}
          ${isDm() && e.author === 'dm' && e.secret?.text ? html`<section class="world-secret"><h3 class="camp-h2">🎲 Sólo para el DM</h3><div class="world-detail__text">${e.secret.text}</div></section>` : ''}
          <p class="muted world-detail__meta">${e.author === 'jugador' ? `✍ ${mine(e) ? 'Tu nota' : memberName(e.memberId)} · ` : ''}${e.revealedAt ? `Descubierto ${formatDate(e.revealedAt)} · ` : ''}Actualizado ${formatDate(e.updatedAt)}</p>
          <div class="dialog__footer">
            ${editable(e) ? html`<button type="button" class="btn btn--ghost btn--danger-text" data-close="delete">Eliminar</button>` : ''}
            ${isDm() && e.author === 'dm' ? html`<button type="button" class="btn btn--ghost" data-close="reveal">👁 Revelar…</button>` : ''}
            ${editable(e) ? html`<button type="button" class="btn btn--primary" data-close="edit">Editar</button>` : html`<button type="button" class="btn btn--ghost" data-dialog-close>Cerrar</button>`}
          </div>
        </div>`);
        body.addEventListener('click', (ev) => {
          const c = ev.target.closest('[data-close]')?.dataset.close;
          if (c) close(c);
          const g = ev.target.closest('[data-w-goto]')?.dataset.wGoto;
          if (g) close(`goto:${g}`);
        });
        body.addEventListener('change', (ev) => {
          const i = ev.target.dataset?.wObj;
          if (i == null) return;
          // Copia local: varios cambios seguidos con el diálogo abierto se acumulan.
          objectives = objectives.map((o, n) => (n === Number(i) ? { ...o, done: ev.target.checked } : o));
          const allDone = objectives.length && objectives.every((o) => o.done);
          save(e, { data: { ...e.data, quest: { ...q, objectives } } }, { quiet: true }).then(() => {
            if (allDone && q.status === 'activa') toast('Todos los objetivos cumplidos. Marca la misión como completada al editarla.', { type: 'info' });
          });
        });
      },
    });
    if (!action) return;
    if (action.startsWith('goto:')) return openEntry(action.slice(5));
    if (action === 'edit') return editEntry(e.kind, e);
    if (action === 'reveal') return revealEntry(e);
    if (action === 'delete') {
      const ok = await confirmDialog({ title: `Eliminar «${e.title}»`, message: 'Se borra del Mundo. Lo que ya quedó en el registro se conserva.', confirmLabel: 'Eliminar', danger: true });
      if (!ok) return;
      try { await play.deleteWorld(id, e.entryId); toast('Eliminado.', { type: 'success' }); await load(); } catch (err) { reportError(campaignError(err)); }
    }
  }

  async function save(entry, changes, { quiet = false } = {}) {
    try {
      const next = await play.saveWorld(id, {
        entryId: entry.entryId, kind: entry.kind, title: entry.title, data: entry.data, secret: entry.secret ?? {},
        reveal: entry.reveal, revealedTo: entry.reveal === 'algunos' ? entry.revealedTo : null, ...changes,
      });
      if (!quiet) toast('Guardado.', { type: 'success' });
      await load();
      return next;
    } catch (err) {
      reportError(campaignError(err), 'No se pudo guardar.');
      return null;
    }
  }

  function revealFields(e, { forPlayer }) {
    if (forPlayer) {
      return html`<fieldset class="choice-group"><legend>Quién la ve</legend>
        ${['autor', 'todos'].map((r) => html`<label class="camp-choice camp-choice--sm"><input type="radio" name="reveal" value="${r}" ${(e?.reveal ?? 'autor') === r ? raw('checked') : ''}><span>${REVEAL[r].icon} ${r === 'todos' ? 'Compartida con la campaña' : REVEAL[r].label}</span></label>`)}
      </fieldset>`;
    }
    const current = e?.reveal ?? 'oculto';
    const players = members().filter((m) => m.status === 'activo');
    return html`<fieldset class="choice-group"><legend>¿Quién lo ha descubierto?</legend>
      ${['oculto', 'todos', 'algunos'].map((r) => html`<label class="camp-choice camp-choice--sm"><input type="radio" name="reveal" value="${r}" ${current === r ? raw('checked') : ''}><span>${REVEAL[r].icon} ${REVEAL[r].label}</span></label>`)}
      <div class="world-who" data-who ${current === 'algunos' ? '' : raw('hidden')}>
        ${players.length ? players.map((m) => html`<label class="check"><input type="checkbox" name="to" value="${m.memberId}" ${e?.revealedTo?.includes(m.memberId) ? raw('checked') : ''}> ${m.name}</label>`) : html`<p class="muted">Aún no hay jugadores aprobados.</p>`}
      </div>
    </fieldset>`;
  }

  function wireReveal(form) {
    form.addEventListener('change', (ev) => {
      if (ev.target.name === 'reveal') form.querySelector('[data-who]')?.toggleAttribute('hidden', ev.target.value !== 'algunos');
    });
  }

  async function revealEntry(e) {
    const fd = await openDialog({
      title: `Revelar «${e.title}»`,
      size: 'sm',
      render(body, close) {
        setHtml(body, html`<form class="stack camp-form" data-f>${revealFields(e, { forPlayer: false })}
          <p class="field__hint">Al descubrirlo se anota en el registro. Tus notas secretas nunca se muestran.</p>
          <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button class="btn btn--primary">Guardar</button></div></form>`);
        const form = body.querySelector('[data-f]');
        wireReveal(form);
        form.addEventListener('submit', (ev) => { ev.preventDefault(); close(new FormData(form)); });
      },
    });
    if (!fd) return;
    await save(e, { reveal: String(fd.get('reveal')), revealedTo: fd.getAll('to').map(String) });
  }

  async function editEntry(kind, e = null) {
    const k = WORLD_KINDS[kind];
    const d = e?.data ?? normalizeWorldData(kind, {});
    const forPlayer = !isDm() || e?.author === 'jugador';
    const places = (state.entries ?? []).filter((x) => x.kind === 'lugar' && x.entryId !== e?.entryId);
    const factions = (state.entries ?? []).filter((x) => x.kind === 'faccion');
    const npcs = (state.entries ?? []).filter((x) => x.kind === 'pnj');
    const opt = (list, current) => html`<option value="">—</option>${list.map((x) => html`<option value="${x.entryId}" ${current === x.entryId ? raw('selected') : ''}>${x.title}</option>`)}`;
    const q = d.quest ?? { status: 'activa', objectives: [], reward: '' };
    const fd = await openDialog({
      title: `${e ? 'Editar' : 'Nuevo'}: ${k.label}`,
      size: 'md',
      render(body, close) {
        setHtml(body, html`<form class="stack camp-form" data-f>
          <div class="field"><label class="field__label" for="w-title">Nombre</label><input id="w-title" class="input" name="title" required maxlength="120" value="${e?.title ?? ''}"></div>
          ${kind === 'pnj' ? html`<div class="grid-2 grid-2--tight">
            <div class="field"><label class="field__label" for="w-role">Quién es</label><input id="w-role" class="input" name="role" maxlength="80" value="${d.role ?? ''}" placeholder="Posadero de El Ciervo Blanco"></div>
            <label class="field"><span class="field__label">Actitud</span><select class="select" name="attitude">${Object.entries(ATTITUDES).map(([a, v]) => html`<option value="${a}" ${d.attitude === a ? raw('selected') : ''}>${v.icon} ${v.label}</option>`)}</select></label>
          </div>` : ''}
          <div class="field"><label class="field__label" for="w-sum">Resumen (una o dos frases)</label><textarea id="w-sum" class="textarea" name="summary" rows="2" maxlength="600">${d.summary ?? ''}</textarea></div>
          <div class="field"><label class="field__label" for="w-det">${kind === 'nota' ? 'Nota' : 'Descripción'}</label><textarea id="w-det" class="textarea" name="details" rows="5" maxlength="8000">${d.details ?? ''}</textarea></div>
          ${kind === 'mision' ? html`
            <label class="field"><span class="field__label">Estado</span><select class="select" name="status">${Object.entries(QUEST_STATUS).map(([s, v]) => html`<option value="${s}" ${q.status === s ? raw('selected') : ''}>${v.label}</option>`)}</select></label>
            <div class="field"><label class="field__label" for="w-obj">Objetivos (uno por línea; empieza con [x] si ya está cumplido)</label><textarea id="w-obj" class="textarea" name="objectives" rows="4">${q.objectives.map((o) => `${o.done ? '[x] ' : ''}${o.text}`).join('\n')}</textarea></div>
            <div class="field"><label class="field__label" for="w-rew">Recompensa</label><input id="w-rew" class="input" name="reward" maxlength="300" value="${q.reward ?? ''}"></div>
            ${npcs.length ? html`<label class="field"><span class="field__label">Quién la encarga</span><select class="select" name="giverId">${opt(npcs, d.giverId)}</select></label>` : ''}` : ''}
          ${kind !== 'nota' && places.length ? html`<label class="field"><span class="field__label">${kind === 'lugar' ? 'Está dentro de' : 'Dónde'}</span><select class="select" name="placeId">${opt(places, d.placeId)}</select></label>` : ''}
          ${kind === 'pnj' && factions.length ? html`<label class="field"><span class="field__label">Facción</span><select class="select" name="factionId">${opt(factions, d.factionId)}</select></label>` : ''}
          <div class="field"><label class="field__label" for="w-tags">Etiquetas (separadas por comas)</label><input id="w-tags" class="input" name="tags" maxlength="300" value="${(d.tags ?? []).join(', ')}"></div>
          ${forPlayer ? '' : html`<div class="field world-secret"><label class="field__label" for="w-sec">🎲 Notas secretas del DM (nunca se muestran)</label><textarea id="w-sec" class="textarea" name="secret" rows="3" maxlength="8000">${e?.secret?.text ?? ''}</textarea></div>`}
          ${revealFields(e, { forPlayer })}
          <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button class="btn btn--primary">Guardar</button></div>
        </form>`);
        const form = body.querySelector('[data-f]');
        wireReveal(form);
        form.querySelector('[name="title"]').focus();
        form.addEventListener('submit', (ev) => { ev.preventDefault(); if (form.reportValidity()) close(new FormData(form)); });
      },
    });
    if (!fd) return;
    const get = (n) => String(fd.get(n) ?? '');
    const data = normalizeWorldData(kind, {
      summary: get('summary'), details: get('details'), role: get('role'), attitude: get('attitude'),
      placeId: get('placeId'), factionId: get('factionId'), giverId: get('giverId'),
      tags: get('tags').split(','),
      quest: kind === 'mision' ? {
        status: get('status'), reward: get('reward'),
        objectives: get('objectives').split('\n').map((l) => l.trim()).filter(Boolean)
          .map((l) => ({ done: /^\[x\]\s*/i.test(l), text: l.replace(/^\[[x ]?\]\s*/i, '') })),
      } : undefined,
    });
    await save(e ?? { kind }, {
      kind, title: get('title').trim(), data, secret: forPlayer ? {} : normalizeSecret({ text: get('secret') }),
      reveal: get('reveal') || null, revealedTo: get('reveal') === 'algunos' ? fd.getAll('to').map(String) : null,
    });
  }

  function onClick(ev) {
    const t = ev.target;
    const open = t.closest('[data-w-open]');
    if (open) return openEntry(open.dataset.wOpen);
    const k = t.closest('[data-w-kind]');
    if (k) { state.kind = k.dataset.wKind; return paint(); }
    const act = t.closest('[data-w-act]')?.dataset.wAct;
    if (act === 'reload') return load();
    if (act === 'new') return editEntry(root.querySelector('[data-w-newkind]')?.value ?? 'nota');
    return undefined;
  }

  function onInput(ev) {
    if (ev.target.matches('[data-w-query]')) { state.query = ev.target.value; paint(); }
  }

  return {
    /** Pinta el panel en `el` (la vista de la campaña se vuelve a pintar entera). */
    mount(el) {
      root = el;
      el.addEventListener('click', onClick);
      el.addEventListener('input', onInput);
      paint();
      if (state.entries == null && !state.loading) load();
    },
    reload: load,
  };
}
