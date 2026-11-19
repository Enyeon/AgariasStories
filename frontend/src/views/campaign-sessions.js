// Pestaña «Sesiones» de una campaña: capítulos, sesiones con su resumen y lo
// que pasó en cada una (el registro filtrado por sesión).

import { html, raw, setHtml, formatDate } from '../ui/dom.js';
import { toast, openDialog, reportError } from '../ui/feedback.js';
import { campaignError } from '../services/campaign-play.js';
import { EVENT_KINDS } from '../domain/campaign-play.js';

/**
 * @param {{ id: string, play: object, isDm: () => boolean, pcName: (pcId: string) => string, onChanged: () => void }} opts
 */
export function createSessionsPanel({ id, play, isDm, pcName, onChanged }) {
  const state = { data: null, error: null, open: new Set(), timelines: new Map(), loading: false };
  let root = null;

  async function load() {
    state.loading = true;
    try {
      state.data = await play.sessions(id);
      state.error = null;
      // Al abrir: la sesión en curso (o la última) desplegada.
      if (!state.open.size && state.data.sessions.length) state.open.add(state.data.current ?? state.data.sessions.at(-1).sessionId);
      await Promise.all([...state.open].map(loadTimeline));
    } catch (err) {
      state.error = campaignError(err);
    }
    state.loading = false;
    paint();
  }

  async function loadTimeline(sessionId) {
    try {
      const res = await play.events(id, { session: sessionId, limit: 200 });
      state.timelines.set(sessionId, res.events.slice().reverse());
    } catch { state.timelines.set(sessionId, null); }
  }

  function sessionCard(s) {
    const open = state.open.has(s.sessionId);
    const live = state.data.current === s.sessionId;
    const events = state.timelines.get(s.sessionId);
    return html`<li class="session-card ${live ? 'is-live' : ''}">
      <div class="session-card__head">
        <div>
          <strong>Sesión ${s.sessionId}${s.title ? `: ${s.title}` : ''}</strong>
          <p class="muted session-card__meta">${formatDate(s.startedAt)}${s.endedAt ? '' : ''} · ${s.events} ${s.events === 1 ? 'acontecimiento' : 'acontecimientos'}</p>
        </div>
        ${live ? html`<span class="badge badge--success">🎬 En curso</span>` : ''}
      </div>
      ${s.summary ? html`<p class="session-card__summary">${s.summary}</p>` : isDm() ? html`<p class="muted">Sin resumen. Escribe uno para que la mesa recuerde qué pasó.</p>` : ''}
      ${isDm() && s.dmNotes ? html`<p class="session-card__secret">🎲 ${s.dmNotes}</p>` : ''}
      <div class="row">
        <button type="button" class="btn btn--ghost btn--sm" data-s-toggle="${s.sessionId}" aria-expanded="${open}">${open ? 'Ocultar lo que pasó' : 'Ver lo que pasó'}</button>
        ${isDm() ? html`<button type="button" class="btn btn--ghost btn--sm" data-s-edit="${s.sessionId}">✎ Resumen</button>` : ''}
      </div>
      ${open ? (events == null ? html`<p class="muted">Cargando…</p>` : events.length
        ? html`<ol class="session-timeline">${events.map((e) => html`<li><span aria-hidden="true">${EVENT_KINDS[e.kind] ?? '📖'}</span> ${e.pcId && !e.text.startsWith(pcName(e.pcId)) ? html`<strong>${pcName(e.pcId)}</strong> · ` : ''}${e.text}</li>`)}</ol>`
        : html`<p class="muted">No hay nada anotado que puedas ver.</p>`) : ''}
    </li>`;
  }

  function view() {
    if (!state.data) {
      return state.error
        ? html`<div class="callout callout--warning"><p>${state.error.userMessage ?? 'No se pudieron cargar las sesiones.'}</p><button class="btn btn--ghost btn--sm" data-s-act="reload">Reintentar</button></div>`
        : html`<div class="loading" role="status"><span class="spinner"></span> Cargando sesiones…</div>`;
    }
    const { chapters, sessions, current } = state.data;
    const groups = [...chapters].reverse().map((c) => ({ c, list: sessions.filter((s) => s.chapterId === c.chapterId).reverse() }));
    const loose = sessions.filter((s) => !s.chapterId || !chapters.some((c) => c.chapterId === s.chapterId)).reverse();
    return html`
      ${isDm() ? html`<section class="card stack">
        <div class="row row--between">
          <p class="muted">${current ? `Sesión ${current} en curso: lo que pase se anota en ella.` : 'No hay ninguna sesión en curso.'}</p>
          <div class="row">
            <button type="button" class="btn btn--ghost btn--sm" data-s-act="chapter">＋ Capítulo</button>
            ${current ? html`<button type="button" class="btn btn--ghost btn--sm" data-s-act="end">Terminar sesión ${current}</button>`
              : html`<button type="button" class="btn btn--primary btn--sm" data-s-act="start">🎬 Empezar sesión</button>`}
          </div>
        </div>
      </section>` : ''}
      ${!sessions.length && !chapters.length ? html`<div class="empty-state"><h2>Todavía no hay sesiones</h2><p>${isDm()
        ? 'Empieza una sesión cuando juguéis: todo lo que pase (compras, daño, descubrimientos…) quedará agrupado en ella. Los capítulos agrupan sesiones.'
        : 'Cuando el DM empiece una sesión, aquí verás su resumen y lo que pasó.'}</p></div>` : ''}
      ${groups.map(({ c, list }) => html`<section class="chapter">
        <header class="chapter__head">
          <div><p class="eyebrow">Capítulo ${c.chapterId}</p><h3 class="chapter__title">${c.title}</h3>${c.summary ? html`<p class="muted">${c.summary}</p>` : ''}</div>
          ${isDm() ? html`<button type="button" class="btn btn--ghost btn--sm" data-s-chapter="${c.chapterId}">✎</button>` : ''}
        </header>
        ${list.length ? html`<ul class="session-list" role="list">${list.map(sessionCard)}</ul>` : html`<p class="muted">Aún sin sesiones en este capítulo.</p>`}
      </section>`)}
      ${loose.length ? html`<section class="chapter">${chapters.length ? html`<header class="chapter__head"><h3 class="chapter__title">Sin capítulo</h3></header>` : ''}
        <ul class="session-list" role="list">${loose.map(sessionCard)}</ul></section>` : ''}`;
  }

  function paint() {
    if (root?.isConnected) setHtml(root, view());
  }

  async function form({ title, body, submit = 'Guardar' }) {
    return openDialog({
      title,
      size: 'md',
      render(el, close) {
        setHtml(el, html`<form class="stack camp-form" data-f>${body}
          <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button class="btn btn--primary">${submit}</button></div></form>`);
        const f = el.querySelector('[data-f]');
        f.querySelector('input, textarea, select')?.focus();
        f.addEventListener('submit', (e) => { e.preventDefault(); if (f.reportValidity()) close(new FormData(f)); });
      },
    });
  }

  const chapterSelect = (current) => html`<label class="field"><span class="field__label">Capítulo</span><select class="select" name="chapter">
    <option value="">— Sin capítulo —</option>${state.data.chapters.map((c) => html`<option value="${c.chapterId}" ${current === c.chapterId ? raw('selected') : ''}>${c.chapterId}. ${c.title}</option>`)}</select></label>`;

  async function run(fn, ok) {
    try {
      const res = await fn();
      if (ok) toast(typeof ok === 'function' ? ok(res) : ok, { type: 'success' });
      await load();
      onChanged?.();
    } catch (err) {
      reportError(campaignError(err), 'No se pudo guardar.');
    }
  }

  async function onClick(ev) {
    const t = ev.target;
    const toggle = t.closest('[data-s-toggle]');
    if (toggle) {
      const sid = Number(toggle.dataset.sToggle);
      if (state.open.has(sid)) state.open.delete(sid);
      else { state.open.add(sid); state.timelines.delete(sid); paint(); await loadTimeline(sid); }
      paint();
      return;
    }
    const edit = t.closest('[data-s-edit]');
    if (edit) {
      const s = state.data.sessions.find((x) => x.sessionId === Number(edit.dataset.sEdit));
      const fd = await form({
        title: `Sesión ${s.sessionId}`,
        body: html`<div class="field"><label class="field__label" for="s-t">Título</label><input id="s-t" class="input" name="title" maxlength="120" value="${s.title}"></div>
          ${chapterSelect(s.chapterId)}
          <div class="field"><label class="field__label" for="s-sum">Resumen (lo ve toda la campaña)</label><textarea id="s-sum" class="textarea" name="summary" rows="5" maxlength="4000">${s.summary}</textarea></div>
          <div class="field world-secret"><label class="field__label" for="s-dm">🎲 Notas del DM (sólo tú)</label><textarea id="s-dm" class="textarea" name="dm" rows="3" maxlength="4000">${s.dmNotes ?? ''}</textarea></div>`,
      });
      if (fd) {
        await run(() => play.updateSession(id, s.sessionId, {
          title: String(fd.get('title')).trim(), summary: String(fd.get('summary')).trim(), dmNotes: String(fd.get('dm')).trim(),
          chapterId: fd.get('chapter') ? Number(fd.get('chapter')) : null,
        }), 'Sesión guardada.');
      }
      return;
    }
    const ch = t.closest('[data-s-chapter]');
    const act = t.closest('[data-s-act]')?.dataset.sAct;
    if (ch || act === 'chapter') {
      const c = ch ? state.data.chapters.find((x) => x.chapterId === Number(ch.dataset.sChapter)) : null;
      const fd = await form({
        title: c ? `Capítulo ${c.chapterId}` : 'Nuevo capítulo',
        submit: c ? 'Guardar' : 'Crear',
        body: html`<div class="field"><label class="field__label" for="c-t">Título</label><input id="c-t" class="input" name="title" required maxlength="120" value="${c?.title ?? ''}"></div>
          <div class="field"><label class="field__label" for="c-s">Resumen (lo ve toda la campaña)</label><textarea id="c-s" class="textarea" name="summary" rows="4" maxlength="4000">${c?.summary ?? ''}</textarea></div>
          ${c ? '' : html`<p class="field__hint">Las sesiones que empieces a partir de ahora quedan en este capítulo.</p>`}`,
      });
      if (fd) await run(() => play.saveChapter(id, { chapterId: c?.chapterId ?? null, title: String(fd.get('title')).trim(), summary: String(fd.get('summary')).trim() }), c ? 'Capítulo guardado.' : 'Capítulo creado.');
      return;
    }
    if (act === 'reload') return load();
    if (act === 'start') {
      const last = state.data.chapters.at(-1)?.chapterId ?? null;
      const fd = await form({
        title: 'Empezar sesión',
        submit: 'Empezar',
        body: html`<div class="field"><label class="field__label" for="ss-t">Título (opcional)</label><input id="ss-t" class="input" name="title" maxlength="120" placeholder="La cripta olvidada"></div>
          ${state.data.chapters.length ? chapterSelect(last) : ''}`,
      });
      if (fd) await run(() => play.startSession(id, String(fd.get('title') ?? '').trim(), fd.get('chapter') ? Number(fd.get('chapter')) : null), (r) => `Empieza la sesión ${r.session}.`);
      return;
    }
    if (act === 'end') await run(() => play.endSession(id), 'Sesión terminada. Escribe su resumen cuando quieras.');
  }

  return {
    mount(el) {
      root = el;
      el.addEventListener('click', onClick);
      paint();
      if (!state.data && !state.loading) load();
    },
    reload: load,
  };
}
