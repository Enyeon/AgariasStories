// Sección «Campañas»: crear, invitar, unirse, aprobar, PJ por campaña,
// registro de acontecimientos y herramientas rápidas del DM.
//
//   /campanas              mis campañas (y solicitudes pendientes)
//   /campanas/<id>         la campaña: Resumen · Jugadores · PJ · Registro · Herramientas (DM)
//   /unirse#<id>.<clave>   enlace de invitación, de DM o personal (otro dispositivo)
//
// Diseño móvil primero: tarjetas (no tablas), pestañas deslizables y
// diálogos a pantalla completa en pantallas estrechas.

import './campaigns.css';
import { html, raw, setHtml, formatDate } from '../ui/dom.js';
import { toast, confirmDialog, openDialog, reportError, userMessageFor } from '../ui/feedback.js';
import { getPack, listEntries } from '../content/registry.js';
import { linkState } from '../content/library.js';
import { inviteUrl, parseInvite } from '../services/homebrew.js';
import { campaignError } from '../services/campaign-play.js';
import { parseDocument } from '../domain/validation.js';
import { campaignSummary } from '../domain/campaign.js';
import {
  VISIBILITY, PC_PRIVACY, PC_STATE, EVENT_KINDS,
  dmGiveItem, dmMoney, dmSetHp, dmLevelUp, dmGrantXp,
} from '../domain/campaign-play.js';
import { COIN_SHORT, coinValues, currencyOf, CURRENCIES } from '../domain/money.js';
import { campaignCard, editCampaignDetails, roleLabel } from './homebrew.js';
import { createSheetView } from './sheet/sheet-view.js';
import { createWorldPanel } from './campaign-world.js';
import { createSessionsPanel } from './campaign-sessions.js';

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: '🏰' },
  { id: 'jugadores', label: 'Jugadores', icon: '👥' },
  { id: 'pj', label: 'Personajes', icon: '🧝' },
  { id: 'mundo', label: 'Mundo', icon: '🗺️' },
  { id: 'sesiones', label: 'Sesiones', icon: '🎬' },
  { id: 'registro', label: 'Registro', icon: '📜' },
  { id: 'dm', label: 'Herramientas', icon: '🎲', dm: true },
];

// El router monta la vista ANTES de cambiar la URL: lo que hay que pasarle a la
// siguiente vista (pestaña inicial, invitación) va por aquí.
const handoff = { tab: null, invite: null };

const MANUAL_KINDS = { acontecimiento: 'Acontecimiento', nota: 'Nota', mision: 'Misión', recompensa: 'Recompensa' };
const COIN_KEYS = ['pp', 'gp', 'sp', 'cp'];

const statusBadge = (m) => (m.status === 'pendiente' ? html`<span class="badge badge--warning">Pendiente</span>`
  : m.status === 'expulsado' ? html`<span class="badge badge--danger">Sin acceso</span>` : '');
const roleBadge = (role) => html`<span class="badge ${role === 'dm' ? 'badge--gold' : role === 'observador' ? '' : 'badge--accent'}">${roleLabel(role)}</span>`;
const errText = (err, fallback) => userMessageFor(campaignError(err), fallback);

async function copyText(text, input) {
  try { await navigator.clipboard.writeText(text); toast('Copiado.', { type: 'success' }); } catch { if (input) { input.type = 'text'; input.select(); } }
}

/** Diálogo de formulario: `fields` es HTML; devuelve FormData o null. */
function formDialog({ title, body, submit = 'Guardar', size = 'sm', danger = false }) {
  return openDialog({
    title,
    size,
    render(el, close) {
      setHtml(el, html`<form class="stack camp-form" data-f>${body}
        <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button class="btn ${danger ? 'btn--danger' : 'btn--primary'}">${submit}</button></div>
      </form>`);
      const form = el.querySelector('[data-f]');
      form.querySelector('input, select, textarea')?.focus();
      form.addEventListener('submit', (e) => { e.preventDefault(); if (form.reportValidity()) close(new FormData(form)); });
    },
  });
}

// ── /campanas ───────────────────────────────────────────────────────────

function listView(svc) {
  const all = svc.allMemberships();
  const online = svc.available();
  const card = (m) => {
    const pack = getPack(m.id);
    const summary = campaignSummary(pack?.details);
    return html`<li class="camp-card">
      <a class="camp-card__main" href="/campanas/${m.id}" data-link>
        <span class="camp-card__icon" aria-hidden="true">${m.role === 'dm' ? '🎲' : m.role === 'observador' ? '👁' : '🏰'}</span>
        <span class="camp-card__info">
          <strong class="camp-card__name">${m.name}</strong>
          ${summary ? html`<span class="muted camp-card__meta">${summary}</span>` : ''}
          <span class="row">${roleBadge(m.role)}${statusBadge(m)}</span>
        </span>
        <span class="camp-card__go" aria-hidden="true">›</span>
      </a>
    </li>`;
  };
  return html`
    <header class="page-header">
      <div><h1>Campañas</h1><p>Crea tu campaña e invita a tu mesa, o únete con el enlace de tu DM. Cada campaña guarda su propia copia de tu PJ.</p></div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--primary" data-act="create" ${online ? '' : raw('disabled')}>＋ Crear campaña</button>
        <button type="button" class="btn btn--ghost" data-act="join" ${online ? '' : raw('disabled')}>Unirme con un enlace</button>
      </div>
    </header>
    ${online ? '' : html`<p class="callout callout--warning">Las campañas necesitan el servidor en línea (Supabase), que no está configurado en esta instalación.</p>`}
    ${all.length ? html`<ul class="camp-list" role="list">${all.map(card)}</ul>`
      : html`<div class="empty-state"><h2>Todavía no hay campañas</h2><p>Si eres DM, crea una y comparte el enlace. Si eres jugador, abre el enlace que te pasó tu DM.</p></div>`}`;
}

async function createCampaign(ctx) {
  const fd = await formDialog({
    title: 'Nueva campaña',
    submit: 'Crear',
    body: html`<div class="field"><label class="field__label" for="cmp-name">Nombre de la campaña</label><input id="cmp-name" class="input" name="name" maxlength="120" required autocomplete="off"></div>
      <p class="field__hint">Serás el DM. Después compartes el enlace de invitación y apruebas a cada jugador.</p>`,
  });
  const name = String(fd?.get('name') ?? '').trim();
  if (!name) return;
  try {
    const m = await ctx.services.homebrew.create(name);
    toast('Campaña creada. Comparte el enlace con tus jugadores.', { type: 'success' });
    handoff.tab = 'jugadores';
    ctx.navigate(`/campanas/${m.id}`);
  } catch (err) {
    reportError(campaignError(err), 'No se pudo crear la campaña.');
  }
}

async function joinWithLink(ctx) {
  const fd = await formDialog({
    title: 'Unirme a una campaña',
    submit: 'Continuar',
    body: html`<div class="field"><label class="field__label" for="join-link">Enlace de invitación</label><input id="join-link" class="input" name="link" required placeholder="https://…/unirse#…" autocomplete="off"></div>`,
  });
  const link = String(fd?.get('link') ?? '').trim();
  if (!link) return;
  const inv = parseInvite(link.includes('#') ? link.slice(link.indexOf('#')) : link);
  if (!inv) { toast('Ese enlace no parece una invitación válida.', { type: 'error' }); return; }
  handoff.invite = inv;
  ctx.navigate('/unirse');
}

export function mountCampaigns(container, ctx, campaignId = null) {
  if (campaignId) return mountCampaign(container, ctx, campaignId);
  const svc = ctx.services.homebrew;
  const page = document.createElement('section');
  page.className = 'page camp-page';
  container.append(page);
  const render = () => setHtml(page, listView(svc));
  render();
  page.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'create') createCampaign(ctx);
    if (act === 'join') joinWithLink(ctx);
  });
  // Solicitudes pendientes: se comprueba si el DM ya respondió.
  const pending = svc.allMemberships().filter((m) => m.personalKey);
  if (pending.length) Promise.allSettled(pending.map((m) => svc.checkStatus(m.id))).then(render);
  return null;
}

// ── /unirse ─────────────────────────────────────────────────────────────

export async function mountJoin(container, ctx) {
  const svc = ctx.services.homebrew;
  const page = document.createElement('section');
  page.className = 'page camp-page camp-join';
  container.append(page);
  const inv = handoff.invite ?? parseInvite(window.location.hash);
  handoff.invite = null;
  const fail = (title, text) => setHtml(page, html`<div class="empty-state"><h1>${title}</h1><p>${text}</p><a class="btn btn--primary" href="/campanas" data-link>Ir a Campañas</a></div>`);
  if (!inv) { fail('Enlace no válido', 'Pide a tu DM que te vuelva a enviar el enlace de invitación.'); return null; }
  // La clave no debe quedarse en la barra de direcciones ni en el historial.
  history.replaceState({}, '', '/unirse');
  if (!svc.available()) { fail('Campañas no disponibles', 'Esta instalación no tiene el servidor de campañas configurado.'); return null; }
  setHtml(page, html`<div class="loading" role="status"><span class="spinner"></span> Comprobando el enlace…</div>`);

  let me = null;
  try {
    me = await svc.inspectKey(inv.id, inv.code);
  } catch (err) {
    if (err?.code === 'not_found') { fail('Esta campaña no existe', 'Puede que el DM la haya borrado o que el enlace esté mal copiado.'); return null; }
    if (err?.code === 'server_not_ready') {
      // Servidor sin la migración de jugadores: se entra como antes (sólo con el código).
      try {
        const m = await svc.join(inv.id, inv.code);
        toast(`Te uniste a «${m.name}».`, { type: 'success' });
        ctx.navigate(`/campanas/${m.id}`, { replace: true });
      } catch (e2) { fail('No se pudo unir', errText(e2, 'El enlace no es válido o ha caducado.')); }
      return null;
    }
    if (err?.code !== 'forbidden') { fail('No se pudo comprobar el enlace', errText(err, 'Inténtalo de nuevo en unos momentos.')); return null; }
  }

  try {
    if (me?.role === 'dm') {
      const m = await svc.join(inv.id, inv.code);
      toast(`Eres el DM de «${m.name}» en este dispositivo.`, { type: 'success' });
      ctx.navigate(`/campanas/${m.id}`, { replace: true });
      return null;
    }
    if (me?.memberId) {
      const m = await svc.adoptPersonalKey(inv.id, inv.code, me);
      toast(`Tu acceso a «${m.name}» ya está en este dispositivo.`, { type: 'success' });
      ctx.navigate(`/campanas/${m.id}`, { replace: true });
      return null;
    }
  } catch (err) {
    fail('No se pudo unir', errText(err, 'El enlace no es válido o ha caducado.'));
    return null;
  }

  // Código de invitación: la persona dice quién es y el DM la aprueba.
  const existing = svc.allMemberships().find((m) => m.id === inv.id && m.memberId);
  if (existing) { ctx.navigate(`/campanas/${inv.id}`, { replace: true }); return null; }
  setHtml(page, html`
    <header class="page-header"><div><p class="eyebrow">Invitación</p><h1>${me?.campaignName ?? 'Unirte a la campaña'}</h1>
      <p>Dile al DM quién eres. Cuando te apruebe podrás vincular tu PJ (puedes elegirlo ya).</p></div></header>
    <form class="card stack camp-form" data-join>
      <div class="field"><label class="field__label" for="j-name">Tu nombre (lo verá el DM y la mesa)</label><input id="j-name" class="input" name="name" required maxlength="60" autocomplete="nickname"></div>
      <fieldset class="choice-group"><legend>Cómo participas</legend>
        <label class="camp-choice"><input type="radio" name="role" value="jugador" checked><span><strong>🧝 Jugador</strong><small>Llevas un PJ.</small></span></label>
        <label class="camp-choice"><input type="radio" name="role" value="observador"><span><strong>👁 Observador</strong><small>Sigues la campaña sin PJ (no compras ni cambias nada).</small></span></label>
      </fieldset>
      <p class="field__hint">Se crea una <strong>clave personal</strong> que sólo se guarda en este dispositivo. No hace falta cuenta.</p>
      <div class="row"><button class="btn btn--primary btn--block">Pedir entrar</button></div>
    </form>`);
  page.querySelector('[data-join]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const btn = e.currentTarget.querySelector('button');
    btn.disabled = true;
    try {
      const m = await svc.requestJoin(inv.id, inv.code, String(fd.get('name')).trim(), String(fd.get('role')));
      toast(m.legacy ? 'Solicitud enviada. Mientras tanto ya puedes ver la campaña.' : 'Solicitud enviada al DM.', { type: 'success' });
      ctx.navigate(`/campanas/${m.id}`, { replace: true });
    } catch (err) {
      btn.disabled = false;
      reportError(campaignError(err), 'No se pudo enviar la solicitud.');
      if (err?.code === 'forbidden') fail('Enlace caducado', 'El DM generó un enlace nuevo. Pídeselo.');
    }
  });
  return null;
}

// ── /campanas/<id> ──────────────────────────────────────────────────────

function mountCampaign(container, ctx, id) {
  const { homebrew: svc, play, characters } = ctx.services;
  const page = document.createElement('section');
  page.className = 'page camp-page camp-hub';
  container.append(page);
  const params = new URLSearchParams(window.location.search);
  const wanted = handoff.tab ?? params.get('tab');
  handoff.tab = null;
  const state = {
    tab: TABS.some((t) => t.id === wanted) ? wanted : 'resumen',
    roster: null,
    events: [],
    moreEvents: false,
    eventsPc: '',
    error: null,
    loading: true,
    toolPc: null,
  };
  let alive = true;

  const m = () => svc.membership(id);
  const isDm = () => m()?.role === 'dm';
  const pcs = () => state.roster?.characters ?? [];
  const pcName = (pcId) => pcs().find((p) => p.pcId === pcId)?.summary?.name ?? 'PJ';
  const memberName = (memberId) => state.roster?.members?.find((x) => x.memberId === memberId)?.name ?? '';

  async function load({ quiet = false } = {}) {
    if (!quiet) { state.loading = true; render(); }
    state.error = null;
    try {
      const mm = m();
      if (mm?.personalKey) await svc.checkStatus(id).catch(() => null);
      if (!m()?.key) { state.loading = false; render(); return; }
      await svc.refresh(id).catch(() => null);
      const [roster, events] = await Promise.all([
        play.roster(id),
        play.events(id, { pcId: state.eventsPc || null, limit: 30 }),
      ]);
      state.roster = roster;
      state.events = events.events;
      state.moreEvents = events.events.length === 30;
    } catch (err) {
      state.error = campaignError(err);
    }
    state.loading = false;
    if (alive) render();
  }

  // ── Pestañas ──────────────────────────────────────────────────────────

  function tabs() {
    const pendingCount = isDm() ? (state.roster?.members ?? []).filter((x) => x.status === 'pendiente').length + pcs().filter((p) => p.status === 'pendiente').length : 0;
    return html`<nav class="camp-tabs" role="tablist" aria-label="Secciones de la campaña">
      ${TABS.filter((t) => !t.dm || isDm()).map((t) => html`<button type="button" role="tab" class="camp-tab ${state.tab === t.id ? 'is-on' : ''}" aria-selected="${state.tab === t.id}" data-tab="${t.id}">
        <span aria-hidden="true">${t.icon}</span> ${t.label}${t.id === 'jugadores' && pendingCount ? html` <span class="camp-dot" title="${pendingCount} pendientes">${pendingCount}</span>` : ''}</button>`)}
    </nav>`;
  }

  function header() {
    const mm = m();
    const session = state.roster?.session;
    return html`<header class="page-header camp-header">
      <div>
        <p class="eyebrow"><a href="/campanas" data-link>← Campañas</a></p>
        <h1>${mm?.name ?? 'Campaña'}</h1>
        <p class="row">${roleBadge(mm?.role)}${statusBadge(mm ?? {})}${session ? html`<span class="badge badge--success">🎬 Sesión ${session} en curso</span>` : ''}</p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--ghost btn--sm" data-act="reload" aria-label="Actualizar">↻ Actualizar</button>
      </div>
    </header>`;
  }

  function pendingView() {
    const mm = m();
    return html`${header()}
      <section class="card stack">
        ${mm.status === 'expulsado'
          ? html`<h2>Sin acceso</h2><p>El DM rechazó la solicitud o te retiró de la campaña. Si es un error, pídele un enlace nuevo.</p>
              <div class="row"><button class="btn btn--ghost btn--danger-text" data-act="leave">Quitar de este dispositivo</button></div>`
          : html`<h2>⏳ Esperando al DM</h2>
              <p>Tu solicitud como <strong>${roleLabel(mm.role)}</strong> está pendiente. Mientras tanto ${mm.role === 'jugador' ? 'puedes elegir el PJ que llevarás:' : 'puedes esperar aquí.'}</p>
              <div class="row"><button class="btn btn--primary" data-act="check">Comprobar ahora</button>
              ${mm.role === 'jugador' ? html`<button class="btn btn--ghost" data-act="link-pc">🧝 Elegir mi PJ</button>` : ''}</div>
              ${myLocalCopies()}`}
      </section>`;
  }

  // Copias de campaña de este dispositivo (para enlazarlas mientras se espera).
  let localCopies = [];
  const myLocalCopies = () => (localCopies.length ? html`<ul class="camp-pcs" role="list">${localCopies.map((r) => html`<li class="pc-card">
      <div class="pc-card__head"><strong>${r.summary?.name || 'Personaje'}</strong>${r.pc.status === 'pendiente' ? html`<span class="badge badge--warning">Pendiente</span>` : ''}</div>
      <div class="row"><a class="btn btn--ghost btn--sm" href="/editar/${r.id}" data-link>Abrir ficha</a></div></li>`)}</ul>` : '');

  function resumenTab() {
    const pack = getPack(id);
    const roster = state.roster;
    const active = (roster?.members ?? []).filter((x) => x.status === 'activo');
    const mine = pcs().filter((p) => p.mine);
    const pendingMembers = (roster?.members ?? []).filter((x) => x.status === 'pendiente');
    const pendingPcs = pcs().filter((p) => p.status === 'pendiente');
    return html`
      ${isDm() && (pendingMembers.length || pendingPcs.length) ? html`<button type="button" class="callout callout--warning camp-alert" data-tab="jugadores">
        <strong>${pendingMembers.length + pendingPcs.length} solicitud${pendingMembers.length + pendingPcs.length === 1 ? '' : 'es'} esperando tu aprobación</strong> · Revisar ›</button>` : ''}
      ${isDm() ? libraryNotice() : ''}
      <div class="camp-stats">
        <div class="camp-stat"><span class="camp-stat__n">${active.filter((x) => x.role === 'jugador').length}</span><span>Jugadores</span></div>
        <div class="camp-stat"><span class="camp-stat__n">${pcs().filter((p) => p.status === 'activo').length}</span><span>PJ</span></div>
        <div class="camp-stat"><span class="camp-stat__n">${state.roster?.session ?? '—'}</span><span>Sesión</span></div>
      </div>
      ${!isDm() && m()?.role === 'jugador' ? html`<section class="card stack">
        <header class="card__header"><div><h2 class="card__title">Tu PJ en esta campaña</h2><p class="card__subtitle">Es una copia: tu personaje original no cambia.</p></div></header>
        ${mine.length ? html`<ul class="camp-pcs" role="list">${mine.map(pcCard)}</ul>` : html`<p class="muted">Aún no has vinculado ningún PJ.</p>`}
        <div class="row"><button class="btn ${mine.length ? 'btn--ghost' : 'btn--primary'}" data-act="link-pc">🧝 Vincular un personaje</button></div>
      </section>` : ''}
      ${pack ? campaignCard(pack) : ''}
      <section class="card">
        <header class="card__header"><div><h2 class="card__title">Atajos</h2></div></header>
        <div class="camp-shortcuts">
          <a class="camp-shortcut" href="/tienda" data-link><span aria-hidden="true">🛒</span>Tienda de la campaña</a>
          <a class="camp-shortcut" href="/homebrew/${id}" data-link><span aria-hidden="true">📜</span>Homebrew y reglas</a>
          <button type="button" class="camp-shortcut" data-tab="registro"><span aria-hidden="true">📖</span>Registro</button>
          ${isDm() ? html`<button type="button" class="camp-shortcut" data-tab="dm"><span aria-hidden="true">🎲</span>Herramientas del DM</button>` : ''}
        </div>
      </section>
      ${myAccessCard()}`;
  }

  /** DM: elementos de su biblioteca con versión nueva que esta campaña aún no usa. */
  function libraryNotice() {
    const lib = svc.localPack().items;
    const entries = listEntries(null, { selectable: false, packId: id });
    const linked = entries.filter((e) => linkState(e, lib));
    const outdated = linked.filter((e) => linkState(e, lib).state === 'nueva-version').length;
    if (!outdated) return '';
    return html`<a class="callout callout--accent camp-alert" href="/homebrew/${id}" data-link>
      <strong>📚 ${outdated} ${outdated === 1 ? 'elemento de tu biblioteca tiene' : 'elementos de tu biblioteca tienen'} una versión nueva</strong> · La campaña sigue con la suya hasta que la actualices. Revisar ›</a>`;
  }

  /** Enlace personal para usar el mismo acceso en otro dispositivo. */
  function myAccessCard() {
    const mm = m();
    if (!mm) return '';
    const key = mm.personalKey ?? mm.key;
    const label = mm.role === 'dm' ? 'Tu enlace de DM' : 'Tu enlace personal';
    return html`<details class="disclosure" data-key="access">
      <summary>🔑 ${label} (para otro dispositivo)</summary>
      <div class="disclosure__body stack">
        <p>Ábrelo en tu otro dispositivo para entrar con el mismo acceso. <strong>No lo compartas:</strong> quien lo tenga entra como tú.</p>
        ${mm.legacy && !mm.memberId ? html`<p class="callout callout--warning">Entraste con el código de invitación de la mesa (modo antiguo). Pide tu clave personal para tener tu PJ en la campaña.</p>
          <div class="row"><button class="btn btn--primary" data-act="upgrade">Pedir mi clave personal</button></div>`
          : html`<div class="row row--nowrap"><input class="input" type="password" readonly value="${inviteUrl(id, key)}" data-copy-src="mine" aria-label="${label}"><button type="button" class="btn btn--ghost" data-act="copy" data-src="mine">Copiar</button></div>`}
        <div class="row"><button class="btn btn--ghost btn--danger-text btn--sm" data-act="leave">Quitar la campaña de este dispositivo</button></div>
      </div>
    </details>`;
  }

  function pcCard(p) {
    const s = p.summary ?? {};
    const state0 = PC_STATE[p.state] ?? PC_STATE.vivo;
    const hpPct = s.maxHp ? Math.max(0, Math.min(100, Math.round(((s.hp ?? s.maxHp) / s.maxHp) * 100))) : null;
    const owner = p.memberId ? memberName(p.memberId) : 'DM';
    const canSee = isDm() || p.mine || p.privacy === 'publico';
    return html`<li class="pc-card ${p.state === 'muerto' ? 'is-dead' : ''}">
      <div class="pc-card__head">
        <strong class="pc-card__name">${s.name || 'Personaje'}</strong>
        <span class="row">
          ${p.status !== 'activo' ? html`<span class="badge ${p.status === 'pendiente' ? 'badge--warning' : 'badge--danger'}">${p.status === 'pendiente' ? 'Pendiente' : 'Desvinculado'}</span>` : ''}
          ${p.state !== 'vivo' ? html`<span class="badge badge--danger">${state0.icon} ${state0.label}</span>` : ''}
        </span>
      </div>
      <p class="pc-card__meta muted">${[s.race, s.classes, s.level ? `Nivel ${s.level}` : ''].filter(Boolean).join(' · ') || (p.privacy === 'privado' && !canSee ? 'Ficha privada' : '')}</p>
      ${hpPct != null ? html`<div class="pc-hp" title="Puntos de golpe"><span class="pc-hp__bar"><span style="width:${hpPct}%" class="${hpPct <= 25 ? 'is-low' : ''}"></span></span><small>${s.hp ?? s.maxHp}/${s.maxHp} PG</small></div>` : ''}
      <p class="pc-card__owner muted">${owner ? html`👤 ${owner} · ` : ''}${PC_PRIVACY[p.privacy]?.short ?? ''}</p>
      <div class="row pc-card__actions">
        ${p.mine || (isDm() && !p.memberId) ? html`<button class="btn btn--primary btn--sm" data-act="open-mine" data-pc="${p.pcId}">✎ ${p.mine ? 'Abrir mi ficha' : 'Editar ficha'}</button>
          <button class="btn btn--ghost btn--sm" data-act="shop-mine" data-pc="${p.pcId}">🛒 Tienda</button>` : ''}
        ${canSee && !p.mine && !(isDm() && !p.memberId) ? html`<button class="btn btn--ghost btn--sm" data-act="view-pc" data-pc="${p.pcId}">👁 Ver ficha</button>` : ''}
        ${p.mine || isDm() ? html`<label class="visually-hidden" for="priv-${p.pcId}">Quién ve la ficha</label><select id="priv-${p.pcId}" class="select select--sm" data-privacy="${p.pcId}" title="Quién ve la ficha completa">
          ${Object.entries(PC_PRIVACY).map(([k, v]) => html`<option value="${k}" ${p.privacy === k ? raw('selected') : ''}>${v.short}</option>`)}</select>` : ''}
        ${isDm() && p.status === 'pendiente' ? html`<button class="btn btn--primary btn--sm" data-act="pc-approve" data-pc="${p.pcId}">✓ Aprobar PJ</button>` : ''}
        ${isDm() && p.status === 'activo' ? html`<button class="btn btn--ghost btn--sm" data-act="tools-for" data-pc="${p.pcId}">🎲 Herramientas</button>` : ''}
        ${isDm() && p.status !== 'desvinculado' ? html`<button class="btn btn--ghost btn--danger-text btn--sm" data-act="pc-unlink" data-pc="${p.pcId}">Desvincular</button>` : ''}
        ${isDm() && p.status === 'desvinculado' ? html`<button class="btn btn--ghost btn--sm" data-act="pc-approve" data-pc="${p.pcId}">Volver a vincular</button>` : ''}
      </div>
    </li>`;
  }

  function jugadoresTab() {
    const members = state.roster?.members ?? [];
    const dm = isDm();
    const pending = members.filter((x) => x.status === 'pendiente');
    const active = members.filter((x) => x.status === 'activo');
    const gone = members.filter((x) => x.status === 'expulsado');
    const memberCard = (x) => {
      const theirs = pcs().filter((p) => p.memberId === x.memberId);
      return html`<li class="member-card">
        <div class="member-card__head">
          <span class="member-card__avatar" aria-hidden="true">${(x.name || '?').slice(0, 1).toUpperCase()}</span>
          <span class="member-card__info"><strong>${x.name}</strong>
            <span class="row">${roleBadge(x.role)}${statusBadge(x)}${dm && x.seenAt ? html`<small class="muted">visto ${formatDate(x.seenAt)}</small>` : ''}</span></span>
        </div>
        ${theirs.length ? html`<p class="muted member-card__pcs">🧝 ${theirs.map((p) => `${p.summary?.name ?? 'PJ'}${p.status === 'pendiente' ? ' (pendiente)' : p.status === 'desvinculado' ? ' (desvinculado)' : ''}`).join(', ')}</p>` : ''}
        ${dm ? html`<div class="row member-card__actions">
          ${x.status === 'pendiente' ? html`<button class="btn btn--primary btn--sm" data-act="approve" data-member="${x.memberId}">✓ Aprobar</button>
            <button class="btn btn--ghost btn--danger-text btn--sm" data-act="reject" data-member="${x.memberId}">Rechazar</button>` : ''}
          ${x.status === 'activo' ? html`<label class="visually-hidden" for="role-${x.memberId}">Rol</label><select id="role-${x.memberId}" class="select select--sm" data-role="${x.memberId}">
              <option value="jugador" ${x.role === 'jugador' ? raw('selected') : ''}>Jugador</option><option value="observador" ${x.role === 'observador' ? raw('selected') : ''}>Observador</option></select>
            <button class="btn btn--ghost btn--danger-text btn--sm" data-act="expel" data-member="${x.memberId}">Expulsar</button>` : ''}
          ${x.status === 'expulsado' ? html`<button class="btn btn--ghost btn--sm" data-act="approve" data-member="${x.memberId}">Readmitir</button>
            <button class="btn btn--ghost btn--danger-text btn--sm" data-act="reject" data-member="${x.memberId}">Eliminar</button>` : ''}
        </div>` : ''}
      </li>`;
    };
    return html`
      ${dm ? inviteSection() : ''}
      ${dm && pending.length ? html`<h2 class="camp-h2">Solicitudes (${pending.length})</h2><ul class="member-list" role="list">${pending.map(memberCard)}</ul>` : ''}
      ${dm && pcs().some((p) => p.status === 'pendiente') ? html`<h2 class="camp-h2">PJ por aprobar</h2><ul class="camp-pcs" role="list">${pcs().filter((p) => p.status === 'pendiente').map(pcCard)}</ul>` : ''}
      <h2 class="camp-h2">En la campaña (${active.length})</h2>
      ${active.length ? html`<ul class="member-list" role="list">${active.map(memberCard)}</ul>` : html`<p class="muted">${dm ? 'Todavía no hay nadie. Comparte el enlace de invitación.' : 'Todavía no hay nadie más.'}</p>`}
      ${dm && gone.length ? html`<details class="disclosure"><summary>Sin acceso (${gone.length})</summary><div class="disclosure__body"><ul class="member-list" role="list">${gone.map(memberCard)}</ul></div></details>` : ''}`;
  }

  function inviteSection() {
    const mm = m();
    const open = state.roster?.openInvite;
    const url = mm?.inviteCode ? inviteUrl(id, mm.inviteCode) : '';
    return html`<section class="card stack invite-card">
      <header class="card__header"><div><h2 class="card__title">📨 Invitar</h2><p class="card__subtitle">Quien abra el enlace pide entrar; tú lo apruebas aquí.</p></div></header>
      ${url ? html`<div class="row row--nowrap"><input class="input" readonly value="${url}" data-copy-src="invite" aria-label="Enlace de invitación">
          <button type="button" class="btn btn--primary" data-act="${typeof navigator.share === 'function' ? 'share' : 'copy'}" data-src="invite">${typeof navigator.share === 'function' ? 'Compartir' : 'Copiar'}</button></div>`
        : html`<p class="muted">Este dispositivo no guarda el enlace actual. Genera uno nuevo.</p>`}
      <div class="row">
        <button type="button" class="btn btn--ghost btn--sm" data-act="rotate">Generar enlace nuevo</button>
      </div>
      <label class="check camp-toggle"><input type="checkbox" data-open-invite ${open ? raw('checked') : ''}>
        <span>El enlace basta para jugar, sin aprobación (modo antiguo). ${open ? html`<strong class="text-warning">Activado:</strong> cualquiera con el enlace entra como jugador.` : 'Recomendado: desactivado.'}</span></label>
    </section>`;
  }

  function pjTab() {
    const list = pcs();
    const visible = isDm() ? list : list.filter((p) => p.status === 'activo' || p.mine);
    return html`
      <div class="row row--between camp-section-head">
        <h2 class="camp-h2">Personajes (${visible.length})</h2>
        ${m()?.role !== 'observador' ? html`<button class="btn btn--ghost btn--sm" data-act="link-pc">＋ ${isDm() ? 'Añadir PJ/PNJ' : 'Vincular un personaje'}</button>` : ''}
      </div>
      ${visible.length ? html`<ul class="camp-pcs" role="list">${visible.map(pcCard)}</ul>` : html`<p class="muted">Todavía no hay personajes en la campaña.</p>`}`;
  }

  function eventItem(e) {
    const vis = VISIBILITY[e.visibility] ?? VISIBILITY.publico;
    return html`<li class="event ${e.kind === 'muerte' ? 'event--death' : ''}">
      <span class="event__icon" aria-hidden="true">${EVENT_KINDS[e.kind] ?? '📌'}</span>
      <div class="event__body">
        <p class="event__text">${e.pcId && !e.text.startsWith(pcName(e.pcId)) ? html`<strong>${pcName(e.pcId)}</strong> · ` : ''}${e.text}</p>
        <p class="event__meta muted">${formatDate(e.createdAt)}${e.day != null ? ` · día ${e.day}` : ''}${e.sessionId ? ` · sesión ${e.sessionId}` : ''} · ${e.author === 'dm' ? 'DM' : e.author === 'sistema' ? 'automático' : memberName(e.memberId) || 'jugador'}
          <span title="${vis.label}"> · ${vis.icon}</span></p>
      </div>
    </li>`;
  }

  function registroTab() {
    const list = pcs().filter((p) => p.status !== 'pendiente' || p.mine || isDm());
    const canWrite = isDm() || (m()?.role === 'jugador' && m()?.memberId);
    return html`
      <div class="row row--between camp-section-head">
        <label class="field field--inline"><span class="field__label">Ver</span>
          <select class="select select--sm" data-events-pc><option value="">Toda la campaña</option>${list.map((p) => html`<option value="${p.pcId}" ${state.eventsPc === p.pcId ? raw('selected') : ''}>${p.summary?.name ?? 'PJ'}</option>`)}</select></label>
        ${canWrite ? html`<button class="btn btn--primary btn--sm" data-act="add-event">＋ Anotar</button>` : ''}
      </div>
      <p class="muted camp-legend">${Object.values(VISIBILITY).map((v) => `${v.icon} ${v.label}`).join(' · ')}</p>
      ${state.events.length ? html`<ol class="event-list">${state.events.map(eventItem)}</ol>` : html`<p class="muted">Todavía no hay nada en el registro.</p>`}
      ${state.moreEvents ? html`<div class="row"><button class="btn btn--ghost btn--block" data-act="more-events">Ver anteriores</button></div>` : ''}`;
  }

  function dmTab() {
    const active = pcs().filter((p) => p.status === 'activo');
    const sel = active.find((p) => p.pcId === state.toolPc) ?? active[0] ?? null;
    state.toolPc = sel?.pcId ?? null;
    const session = state.roster?.session;
    const tool = (act, icon, label, extra = '') => html`<button type="button" class="tool-btn ${extra}" data-tool="${act}" ${sel ? '' : raw('disabled')}><span aria-hidden="true">${icon}</span>${label}</button>`;
    return html`
      <button type="button" class="callout callout--accent camp-alert" data-tab="sesiones">
        <strong>🎬 ${session ? `Sesión ${session} en curso` : 'No hay sesión en curso'}</strong> · Sesiones y capítulos ›</button>
      <section class="card stack">
        <header class="card__header"><div><h2 class="card__title">🎲 Herramientas rápidas</h2><p class="card__subtitle">Se aplican a la copia del PJ en la campaña y quedan en el registro.</p></div></header>
        ${active.length ? html`<label class="field"><span class="field__label">Personaje</span>
          <select class="select" data-tool-pc>${active.map((p) => html`<option value="${p.pcId}" ${p.pcId === state.toolPc ? raw('selected') : ''}>${p.summary?.name ?? 'PJ'}${p.state !== 'vivo' ? ` (${PC_STATE[p.state].label})` : ''} · ${p.summary?.hp ?? '?'}/${p.summary?.maxHp ?? '?'} PG</option>`)}</select></label>`
          : html`<p class="muted">No hay PJ activos. Aprueba alguno en «Jugadores».</p>`}
        <div class="tool-grid">
          ${tool('item', '🎒', 'Dar objeto')}
          ${tool('money', '🪙', 'Dar / quitar dinero')}
          ${tool('hp', '❤', 'Modificar PG')}
          ${tool('xp', '✨', 'Dar experiencia')}
          ${tool('level', '⬆', 'Subir nivel')}
          ${sel?.state === 'muerto' ? tool('revive', '🌅', 'Revivir') : tool('dead', '💀', 'Marcar muerto', 'tool-btn--danger')}
          ${tool('event', '📌', 'Añadir acontecimiento')}
          ${tool('view', '👁', 'Ver ficha e inventario')}
        </div>
      </section>`;
  }

  function render() {
    if (!alive) return;
    const mm = m();
    const openKeys = new Set([...page.querySelectorAll('details[data-key][open]')].map((d) => d.dataset.key));
    if (!mm) {
      setHtml(page, html`<div class="empty-state"><h1>Campaña no encontrada</h1><p>No participas en esta campaña en este dispositivo. Abre el enlace de invitación o tu enlace personal.</p><a class="btn btn--primary" href="/campanas" data-link>Volver</a></div>`);
      return;
    }
    if (!mm.key) { setHtml(page, pendingView()); return; }
    if (state.tab === 'dm' && !isDm()) state.tab = 'resumen';
    const body = state.loading && !state.roster ? html`<div class="loading" role="status"><span class="spinner"></span> Cargando la campaña…</div>`
      : state.error && !state.roster ? html`<div class="callout callout--warning"><p>${state.error.userMessage ?? 'No se pudo cargar la campaña.'}</p><div class="row"><button class="btn btn--ghost btn--sm" data-act="reload">Reintentar</button></div></div>${state.tab === 'resumen' ? resumenTab() : ''}`
        : { resumen: resumenTab, jugadores: jugadoresTab, pj: pjTab, registro: registroTab, dm: dmTab,
          mundo: () => html`<div data-panel="mundo"></div>`, sesiones: () => html`<div data-panel="sesiones"></div>` }[state.tab]();
    setHtml(page, html`${header()}${tabs()}<div class="camp-body" role="tabpanel">${body}</div>`);
    // Mundo y Sesiones son paneles con estado propio: se vuelven a montar en el nuevo contenedor.
    const slot = page.querySelector('[data-panel]');
    if (slot) (slot.dataset.panel === 'mundo' ? world : sessions).mount(slot);
    for (const d of page.querySelectorAll('details[data-key]')) if (openKeys.has(d.dataset.key)) d.open = true;
  }

  const world = createWorldPanel({
    id, play, isDm,
    me: () => m()?.memberId ?? state.roster?.memberId ?? null,
    members: () => (state.roster?.members ?? []).filter((x) => x.status === 'activo'),
    canWrite: () => isDm() || Boolean(m()?.memberId),
  });
  const sessions = createSessionsPanel({ id, play, isDm, pcName, onChanged: () => load({ quiet: true }) });

  // ── Acciones ──────────────────────────────────────────────────────────

  async function act(fn, success, { reload = true } = {}) {
    try {
      const res = await fn();
      if (res?.error) { toast(res.error, { type: 'error' }); return null; }
      if (success) toast(typeof success === 'function' ? success(res) : success, { type: 'success' });
      if (reload) await load({ quiet: true });
      return res ?? true;
    } catch (err) {
      reportError(campaignError(err), 'No se pudo completar la operación.');
      return null;
    }
  }

  async function linkPc() {
    const records = (await characters.list()).filter((r) => !r.pc);
    if (!records.length) { toast('No tienes personajes en este dispositivo. Crea uno en «Personajes».', { type: 'info' }); return; }
    const fd = await formDialog({
      title: 'Vincular un personaje',
      submit: 'Vincular copia',
      body: html`<fieldset class="choice-group"><legend>¿Qué personaje llevas?</legend>
        <div class="camp-choices">${records.map((r, i) => html`<label class="camp-choice"><input type="radio" name="rec" value="${r.id}" ${i === 0 ? raw('checked') : ''}>
          <span><strong>${r.summary?.name || 'Personaje sin nombre'}</strong><small>${[r.summary?.race, r.summary?.classes, r.summary?.level ? `Nivel ${r.summary.level}` : ''].filter(Boolean).join(' · ')}</small></span></label>`)}</div></fieldset>
        <p class="field__hint">Se sube una <strong>copia</strong> a la campaña. Lo que pase en ella (compras, daño, niveles…) no cambia tu personaje original.${isDm() ? '' : ' El DM debe aprobarla.'}</p>`,
    });
    const recId = fd?.get('rec');
    if (!recId) return;
    const rec = await act(() => play.linkCharacter(id, String(recId)), isDm() ? 'PJ añadido a la campaña.' : 'PJ enviado al DM para su aprobación.');
    if (rec && !m()?.key) { localCopies = (await characters.list()).filter((r) => r.pc?.campaignId === id); render(); }
  }

  async function openMine(pcId, target = 'edit') {
    try {
      const recId = await play.openMine(id, pcId);
      ctx.navigate(target === 'shop' ? `/tienda/${recId}` : `/editar/${recId}`);
    } catch (err) {
      reportError(campaignError(err), 'No se pudo abrir la ficha.');
    }
  }

  async function viewPc(pcId) {
    let remote;
    try { remote = await play.pcGet(id, pcId); } catch (err) { reportError(campaignError(err), 'No se pudo cargar la ficha.'); return; }
    if (!remote.document) { toast('Esta ficha es privada: sólo ves su resumen.', { type: 'info' }); return; }
    const { character } = parseDocument(remote.document);
    await openDialog({
      title: `${character.identity.name || 'Personaje'} · sólo lectura`,
      size: 'xl',
      render(body) {
        setHtml(body, html`<div data-sheet class="camp-sheet"></div>`);
        createSheetView(body.querySelector('[data-sheet]'), { character, readOnly: true });
      },
    });
  }

  // Herramientas del DM: cada una pide sus datos y aplica una función pura.
  async function runTool(tool) {
    const pcId = state.toolPc;
    const p = pcs().find((x) => x.pcId === pcId);
    if (!p) return;
    const name = p.summary?.name ?? 'el PJ';
    if (tool === 'view') return viewPc(pcId);
    if (tool === 'event') return addEvent(pcId);
    if (tool === 'dead' || tool === 'revive') {
      const dead = tool === 'dead';
      const ok = await confirmDialog({ title: dead ? `¿${name} muere?` : `¿${name} vuelve a la vida?`, message: dead ? 'Queda marcado como muerto en la campaña (no puede comprar ni vender). Su ficha y su historial se conservan; puedes revivirlo cuando quieras.' : 'Vuelve a estar vivo. Ajusta sus PG con «Modificar PG» si hace falta.', confirmLabel: dead ? 'Marcar muerto' : 'Revivir', danger: dead });
      if (ok) await act(() => play.setPcState(id, pcId, dead ? 'muerto' : 'vivo'), dead ? `${name} ha muerto. Queda en el registro.` : `${name} vuelve a la vida.`);
      return undefined;
    }
    if (tool === 'level') {
      const ok = await confirmDialog({ title: `Subir de nivel a ${name}`, message: 'Le das la experiencia justa para el siguiente nivel. El jugador elige clase, PG y mejoras al subir en su ficha.', confirmLabel: 'Autorizar subida' });
      if (ok) await act(() => play.dmApply(id, pcId, dmLevelUp), 'Subida de nivel autorizada.');
      return undefined;
    }
    let fn = null;
    if (tool === 'item') {
      const fd = await formDialog({ title: `Dar objeto a ${name}`, submit: 'Dar', body: html`
        <div class="field"><label class="field__label" for="t-item">Objeto</label><input id="t-item" class="input" name="name" required maxlength="120" autocomplete="off"></div>
        <div class="grid-2 grid-2--tight"><div class="field"><label class="field__label" for="t-qty">Cantidad</label><input id="t-qty" class="input" type="number" inputmode="numeric" name="qty" min="1" max="9999" value="1"></div></div>
        <div class="field"><label class="field__label" for="t-notes">Notas (opcional)</label><input id="t-notes" class="input" name="notes" maxlength="500"></div>` });
      if (!fd) return undefined;
      fn = (c) => dmGiveItem(c, { name: fd.get('name'), quantity: fd.get('qty'), notes: fd.get('notes') });
    }
    if (tool === 'money') {
      const fd = await formDialog({ title: `Dinero de ${name}`, submit: 'Aplicar', body: html`
        <fieldset class="choice-group"><legend>Operación</legend><div class="row">
          <label class="chip"><input type="radio" name="sign" value="1" checked>＋ Dar</label><label class="chip"><input type="radio" name="sign" value="-1">− Quitar</label></div></fieldset>
        <div class="coin-inputs">${COIN_KEYS.map((k) => html`<label class="field"><span class="field__label">${COIN_SHORT[k]}</span><input class="input" type="number" inputmode="numeric" name="${k}" min="0" max="9999999" value="0"></label>`)}</div>
        <p class="field__hint">Se cuentan con las monedas del PJ (${Object.values(CURRENCIES).map((c) => c.label).join(' o ')}).</p>
        <div class="field"><label class="field__label" for="t-why">Motivo (opcional)</label><input id="t-why" class="input" name="why" maxlength="120" placeholder="Botín de la cripta"></div>` });
      if (!fd) return undefined;
      fn = (c) => {
        const values = coinValues(currencyOf(c.equipment.coins));
        const total = COIN_KEYS.reduce((t, k) => t + Math.max(0, Math.trunc(Number(fd.get(k)) || 0)) * values[k], 0);
        return dmMoney(c, Number(fd.get('sign')) * total, fd.get('why'));
      };
    }
    if (tool === 'hp') {
      const fd = await formDialog({ title: `PG de ${name}`, submit: 'Aplicar', body: html`
        <p class="muted">Ahora: ${p.summary?.hp ?? '?'} / ${p.summary?.maxHp ?? '?'} PG</p>
        <fieldset class="choice-group"><legend>Cómo</legend><div class="row">
          <label class="chip"><input type="radio" name="mode" value="damage" checked>Daño</label>
          <label class="chip"><input type="radio" name="mode" value="heal">Curación</label>
          <label class="chip"><input type="radio" name="mode" value="set">Fijar</label></div></fieldset>
        <div class="field"><label class="field__label" for="t-hp">Puntos de golpe</label><input id="t-hp" class="input" type="number" inputmode="numeric" name="hp" required min="0" max="9999"></div>` });
      if (!fd) return undefined;
      const n = Math.trunc(Number(fd.get('hp')) || 0);
      const mode = fd.get('mode');
      fn = (c) => dmSetHp(c, mode === 'damage' ? -n : n, { relative: mode !== 'set' });
    }
    if (tool === 'xp') {
      const fd = await formDialog({ title: `Experiencia para ${name}`, submit: 'Dar', body: html`
        <div class="field"><label class="field__label" for="t-xp">PX</label><input id="t-xp" class="input" type="number" inputmode="numeric" name="xp" required min="1" max="1000000"></div>` });
      if (!fd) return undefined;
      fn = (c) => dmGrantXp(c, fd.get('xp'));
    }
    if (fn) await act(() => play.dmApply(id, pcId, fn), (r) => r.events?.[0]?.text ?? 'Hecho.');
    return undefined;
  }

  async function addEvent(presetPc = null) {
    const dm = isDm();
    const own = pcs().filter((p) => (dm ? p.status === 'activo' : p.mine));
    const fd = await formDialog({
      title: 'Anotar en el registro',
      submit: 'Anotar',
      size: 'md',
      body: html`
        <div class="field"><label class="field__label" for="e-text">Qué pasó</label><textarea id="e-text" class="textarea" name="text" rows="3" maxlength="480" required></textarea></div>
        <div class="grid-2 grid-2--tight">
          <label class="field"><span class="field__label">Tipo</span><select class="select" name="kind">${Object.entries(MANUAL_KINDS).map(([k, l]) => html`<option value="${k}">${EVENT_KINDS[k]} ${l}</option>`)}</select></label>
          <label class="field"><span class="field__label">Personaje</span><select class="select" name="pc">${dm ? html`<option value="">— Toda la mesa —</option>` : ''}${own.map((p) => html`<option value="${p.pcId}" ${p.pcId === presetPc ? raw('selected') : ''}>${p.summary?.name ?? 'PJ'}</option>`)}</select></label>
        </div>
        <fieldset class="choice-group"><legend>Quién lo ve</legend>
          ${Object.entries(VISIBILITY).map(([k, v], i) => html`<label class="camp-choice camp-choice--sm"><input type="radio" name="vis" value="${k}" ${i === 0 ? raw('checked') : ''}><span>${v.icon} ${v.label}</span></label>`)}
        </fieldset>`,
    });
    if (!fd) return;
    await act(() => play.addEvent(id, {
      kind: String(fd.get('kind')), text: String(fd.get('text')).trim(), pcId: fd.get('pc') ? String(fd.get('pc')) : null, visibility: String(fd.get('vis')),
    }), 'Anotado en el registro.');
  }

  page.addEventListener('click', async (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      state.tab = tabBtn.dataset.tab;
      history.replaceState(history.state, '', `/campanas/${id}${state.tab === 'resumen' ? '' : `?tab=${state.tab}`}`);
      render();
      page.querySelector('.camp-tab.is-on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
      // Registro y lista de PJ: al entrar se traen las novedades.
      if (['registro', 'pj', 'jugadores', 'resumen'].includes(state.tab)) load({ quiet: true });
      return;
    }
    const toolBtn = e.target.closest('[data-tool]');
    if (toolBtn) { runTool(toolBtn.dataset.tool); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { pc, member } = btn.dataset;
    switch (btn.dataset.act) {
      case 'reload': {
        if (state.tab === 'mundo') world.reload();
        if (state.tab === 'sesiones') sessions.reload();
        return load();
      }
      case 'edit-details': {
        const pack = getPack(id);
        if (pack && isDm() && (await editCampaignDetails(svc, pack))) render();
        return undefined;
      }
      case 'check': {
        const next = await svc.checkStatus(id).catch((err) => { reportError(campaignError(err)); return null; });
        if (next?.status === 'activo') toast('¡El DM te aprobó!', { type: 'success' });
        else if (next?.status === 'pendiente') toast('Todavía está pendiente.', { type: 'info' });
        return load();
      }
      case 'upgrade': {
        const fd = await formDialog({ title: 'Tu clave personal', submit: 'Pedir', body: html`<div class="field"><label class="field__label" for="u-name">Tu nombre (lo verá el DM)</label><input id="u-name" class="input" name="name" required maxlength="60"></div>` });
        if (!fd) return undefined;
        return act(() => svc.upgradeLegacy(id, String(fd.get('name')).trim()), 'Solicitud enviada. Sigues jugando como hasta ahora mientras el DM la aprueba.');
      }
      case 'leave': {
        const ok = await confirmDialog({ title: 'Quitar la campaña de este dispositivo', message: isDm() ? 'Se borrará tu clave de DM de este dispositivo. Si no guardaste tu enlace de DM, no podrás volver a administrarla.' : 'Se borrará tu clave de este dispositivo. Para volver necesitarás tu enlace personal o uno nuevo del DM. Tus copias de PJ se quedan en «Tus personajes».', confirmLabel: 'Quitar', danger: true });
        if (ok) { svc.leave(id); ctx.navigate('/campanas'); }
        return undefined;
      }
      case 'copy': {
        const input = page.querySelector(`[data-copy-src="${btn.dataset.src}"]`);
        return copyText(input.value, input);
      }
      case 'share': {
        const input = page.querySelector(`[data-copy-src="${btn.dataset.src}"]`);
        try { await navigator.share({ title: m()?.name, text: `Únete a «${m()?.name}» en Stories of Agarias`, url: input.value }); } catch { /* cancelado */ }
        return undefined;
      }
      case 'rotate': {
        const ok = await confirmDialog({ title: 'Nuevo enlace de invitación', message: 'El enlace anterior deja de servir para pedir entrar. Quien ya está en la campaña no pierde el acceso.', confirmLabel: 'Generar' });
        if (ok) await act(() => svc.rotateInvite(id), 'Nuevo enlace generado.');
        return undefined;
      }
      case 'approve': return act(() => play.approveMember(id, member), 'Aprobado.');
      case 'reject': {
        const ok = await confirmDialog({ title: 'Rechazar / eliminar', message: 'Su clave deja de funcionar. Sus PJ aprobados quedan desvinculados (el historial se conserva).', confirmLabel: 'Eliminar', danger: true });
        if (ok) await act(() => play.removeMember(id, member), 'Hecho.');
        return undefined;
      }
      case 'expel': {
        const ok = await confirmDialog({ title: `Expulsar a ${memberName(member)}`, message: 'Pierde el acceso y sus PJ quedan desvinculados. Nada se borra: puedes readmitirlo después.', confirmLabel: 'Expulsar', danger: true });
        if (ok) await act(() => play.expelMember(id, member), 'Expulsado.');
        return undefined;
      }
      case 'pc-approve': return act(() => play.reviewPc(id, pc, 'activo'), 'PJ vinculado a la campaña.');
      case 'pc-unlink': {
        const ok = await confirmDialog({ title: `Desvincular a ${pcName(pc)}`, message: 'Deja de estar en la campaña (no puede usar la Tienda de la campaña). Su ficha y su historial se conservan y puedes volver a vincularlo.', confirmLabel: 'Desvincular', danger: true });
        if (ok) await act(() => play.reviewPc(id, pc, 'desvinculado'), 'PJ desvinculado.');
        return undefined;
      }
      case 'tools-for': state.toolPc = pc; state.tab = 'dm'; return render();
      case 'link-pc': return linkPc();
      case 'open-mine': return openMine(pc);
      case 'shop-mine': return openMine(pc, 'shop');
      case 'view-pc': return viewPc(pc);
      case 'add-event': return addEvent();
      case 'more-events': {
        const last = state.events[state.events.length - 1];
        try {
          const res = await play.events(id, { before: last?.id ?? null, pcId: state.eventsPc || null, limit: 30 });
          state.events = [...state.events, ...res.events];
          state.moreEvents = res.events.length === 30;
          render();
        } catch (err) { reportError(campaignError(err)); }
        return undefined;
      }
      default: return undefined;
    }
  });

  page.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.matches('[data-events-pc]')) { state.eventsPc = t.value; await load({ quiet: true }); return; }
    if (t.matches('[data-tool-pc]')) { state.toolPc = t.value; render(); return; }
    if (t.matches('[data-privacy]')) { await act(() => play.setPcPrivacy(id, t.dataset.privacy, t.value), `Ahora: ${PC_PRIVACY[t.value].label}.`); return; }
    if (t.matches('[data-role]')) { await act(() => play.setMemberRole(id, t.dataset.role, t.value), 'Rol cambiado.'); return; }
    if (t.matches('[data-open-invite]')) {
      if (t.checked) {
        const ok = await confirmDialog({ title: 'Entrar sin aprobación', message: 'Cualquiera con el enlace podrá jugar sin que lo apruebes (y sin clave personal, no podrá tener su PJ en la campaña). ¿Activar el modo antiguo?', confirmLabel: 'Activar', danger: true });
        if (!ok) { t.checked = false; return; }
      }
      await act(() => play.setOpenInvite(id, t.checked), t.checked ? 'El enlace basta para entrar.' : 'Ahora apruebas a cada persona.');
    }
  });

  page.addEventListener('submit', (e) => e.preventDefault());

  // Al volver a la pestaña: novedades (aprobaciones, registro).
  const onVisible = () => {
    if (document.visibilityState !== 'visible' || state.loading) return;
    if (state.tab === 'mundo') world.reload();
    if (state.tab === 'sesiones') sessions.reload();
    load({ quiet: true });
  };
  document.addEventListener('visibilitychange', onVisible);

  characters.list().then((all) => { localCopies = all.filter((r) => r.pc?.campaignId === id); if (!m()?.key) render(); }).catch(() => {});
  load();
  return {
    unmount() {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
