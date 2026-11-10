// Página «Homebrew»: contenido propio del usuario y campañas.
//
//   /homebrew             resumen: mi Homebrew + mis campañas
//   /homebrew/<paquete>   contenido de un paquete (local o campaña) y, si eres
//                         DM, las reglas y la invitación de la campaña
//   /unirse#<id>.<código> unirse a una campaña con un enlace de invitación

import { html, raw, setHtml } from '../ui/dom.js';
import { toast, confirmDialog, openDialog, reportError, userMessageFor } from '../ui/feedback.js';
import { listEntries, onRegistryChange, getPack } from '../content/registry.js';
import { CONTENT_TYPES, CONTENT_TYPE_KEYS, CONTENT_STATUS } from '../content/schema.js';
import { HOMEBREW_MODES, OFFICIAL_TYPES, normalizeRules } from '../content/rules.js';
import { inviteUrl, parseInvite } from '../services/homebrew.js';
import { downloadJson, readJsonFile } from '../services/file-transfer.js';
import { openContentEditor } from './components/content-editor.js';
import { generateUnlockCode, hashUnlockCode } from '../domain/extensions.js';
import { getClass } from '../data/index.js';

const STATUS_BADGE = { borrador: '', propuesto: 'badge--accent', publicado: 'badge--success', oculto: 'badge--warning', retirado: 'badge--danger', instantanea: '' };

function roleLabel(role) {
  return role === 'dm' ? 'DM' : 'Jugador';
}

// ── Resumen ──────────────────────────────────────────────────────────────

function overview(svc) {
  const local = svc.localPack();
  const localCount = listEntries(null, { packId: local.id }).length;
  const ms = svc.memberships();
  const online = svc.available();
  return html`
    <header class="page-header">
      <div><h1>Homebrew y campañas</h1><p>Crea tus propias clases, razas, hechizos, dotes, criaturas… y compártelas con tu mesa.</p></div>
    </header>
    <div class="grid-2">
      <section class="card">
        <header class="card__header"><div><h2 class="card__title">Mi Homebrew</h2><p class="card__subtitle">Se guarda en este dispositivo. Puedes exportarlo y pasárselo a otra persona.</p></div></header>
        <p><span class="badge">${localCount} ${localCount === 1 ? 'elemento' : 'elementos'}</span></p>
        <div class="row">
          <a class="btn btn--primary" href="/homebrew/${local.id}" data-link>Abrir</a>
          <button type="button" class="btn btn--ghost" data-act="import">⤒ Importar paquete</button>
        </div>
      </section>
      <section class="card">
        <header class="card__header"><div><h2 class="card__title">Campañas</h2><p class="card__subtitle">El DM decide qué contenido se permite y publica su Homebrew; los jugadores lo usan en sus fichas.</p></div></header>
        ${online ? '' : html`<p class="callout callout--warning">Las campañas necesitan el servidor en línea (Supabase), que aún no está configurado en esta instalación. Mientras tanto, usa «Mi Homebrew» y comparte el archivo exportado.</p>`}
        ${ms.length ? html`<ul class="campaign-list">${ms.map((m) => html`<li>
            <a href="/homebrew/${m.id}" data-link><strong>${m.name}</strong></a>
            <span class="badge ${m.role === 'dm' ? 'badge--gold' : ''}">${roleLabel(m.role)}</span>
          </li>`)}</ul>` : html`<p class="muted">Todavía no participas en ninguna campaña.</p>`}
        <div class="row">
          <button type="button" class="btn btn--primary" data-act="create-campaign" ${online ? '' : raw('disabled')}>Crear campaña (soy DM)</button>
          <button type="button" class="btn btn--ghost" data-act="join" ${online ? '' : raw('disabled')}>Unirme con un enlace</button>
        </div>
      </section>
    </div>`;
}

// ── Detalle de un paquete ────────────────────────────────────────────────

function rulesCard(pack) {
  const rules = normalizeRules(pack.rules);
  return html`<details class="disclosure" data-key="rules">
    <summary>Reglas de la campaña</summary>
    <div class="disclosure__body">
      <form class="stack" data-rules>
        <div class="table-wrap"><table class="table">
          <thead><tr><th scope="col">Tipo</th><th scope="col">Contenido oficial</th><th scope="col">Homebrew</th></tr></thead>
          <tbody>${CONTENT_TYPE_KEYS.map((t) => html`<tr>
            <th scope="row">${CONTENT_TYPES[t].icon} ${CONTENT_TYPES[t].plural}</th>
            <td>${OFFICIAL_TYPES.includes(t) ? html`<label class="check"><input type="checkbox" name="official-${t}" ${rules.official[t] ? raw('checked') : ''}> Permitido</label>` : html`<span class="muted">—</span>`}</td>
            <td><select class="select" name="homebrew-${t}" aria-label="Homebrew de ${CONTENT_TYPES[t].plural}">${Object.entries(HOMEBREW_MODES).map(([k, l]) => html`<option value="${k}" ${rules.homebrew[t] === k ? raw('selected') : ''}>${l}</option>`)}</select></td>
          </tr>`)}</tbody>
        </table></div>
        <label class="check"><input type="checkbox" name="epicBoons" ${rules.epicBoons ? raw('checked') : ''}> Se permiten bendiciones épicas (nivel 20, atributos hasta 30)</label>
        <label class="field"><span class="field__label">Rasgos con efectos automáticos</span>
          <select class="select" name="traitEffects">
            <option value="todos" ${rules.traitEffects === 'todos' ? raw('selected') : ''}>Cualquier jugador puede añadirlos</option>
            <option value="dm" ${rules.traitEffects === 'dm' ? raw('selected') : ''}>Sólo el DM (los jugadores sólo rasgos narrativos)</option>
          </select></label>
        <div><button type="submit" class="btn btn--primary">Guardar reglas</button></div>
      </form>
    </div>
  </details>`;
}

function inviteCard(m) {
  return html`<details class="disclosure" data-key="invite">
    <summary>Invitar jugadores</summary>
    <div class="disclosure__body stack">
      <p>Comparte este enlace con tus jugadores. Quien lo tenga podrá ver el contenido publicado y vincular sus personajes.</p>
      ${m.inviteCode ? html`<div class="row"><input class="input" readonly value="${inviteUrl(m.id, m.inviteCode)}" data-copy-src="invite" aria-label="Enlace de invitación"><button type="button" class="btn btn--ghost" data-act="copy" data-src="invite">Copiar</button></div>`
        : html`<p class="muted">Este dispositivo no guarda el enlace actual. Genera uno nuevo.</p>`}
      <div class="row"><button type="button" class="btn btn--ghost btn--sm" data-act="rotate-invite">Generar enlace nuevo (el anterior deja de funcionar)</button></div>
      <hr>
      <p><strong>Tu clave de DM</strong> te identifica como DM. Para usarla en otro dispositivo, abre allí este enlace. No lo compartas con nadie.</p>
      <div class="row"><input class="input" type="password" readonly value="${inviteUrl(m.id, m.key)}" data-copy-src="dm" aria-label="Enlace de DM"><button type="button" class="btn btn--ghost" data-act="copy" data-src="dm">Copiar enlace de DM</button></div>
    </div>
  </details>`;
}

function itemActions(svc, pack, e) {
  const isLocal = pack.kind === 'local';
  const dm = pack.role === 'dm';
  const ownProposal = !dm && e.status === 'propuesto';
  const canEdit = isLocal ? e.status !== 'retirado' : dm || ownProposal;
  return html`<div class="row row--end">
    ${canEdit ? html`<button type="button" class="btn btn--ghost btn--sm" data-act="edit" data-ref="${e.ref}">Editar</button>` : ''}
    ${e.type === 'extension' && e.item.access === 'desbloqueo' && (isLocal || dm) ? html`<button type="button" class="btn btn--ghost btn--sm" data-act="code" data-ref="${e.ref}">🔑 Código</button><button type="button" class="btn btn--ghost btn--sm" data-act="renew-code" data-ref="${e.ref}" title="Invalida el código anterior">Nuevo código</button>` : ''}
    ${dm ? html`<select class="select select--sm" data-act-change="status" data-ref="${e.ref}" aria-label="Estado de ${e.item.name}">${Object.entries(CONTENT_STATUS).map(([k, l]) => html`<option value="${k}" ${e.status === k ? raw('selected') : ''}>${l}</option>`)}</select>` : ''}
    ${isLocal && e.status === 'retirado' ? html`<button type="button" class="btn btn--ghost btn--sm" data-act="restore" data-ref="${e.ref}">Restaurar</button>` : ''}
    ${(isLocal && e.status !== 'retirado') || dm ? html`<button type="button" class="icon-btn icon-btn--danger" data-act="delete" data-ref="${e.ref}" aria-label="Eliminar ${e.item.name}">🗑</button>` : ''}
  </div>`;
}

function detail(svc, pack, state) {
  const isLocal = pack.kind === 'local';
  const m = isLocal ? null : svc.membership(pack.id);
  const dm = pack.role === 'dm';
  const rules = normalizeRules(pack.rules);
  const creatable = isLocal || dm ? CONTENT_TYPE_KEYS : CONTENT_TYPE_KEYS.filter((t) => rules.homebrew[t] === 'propuestas');
  const all = listEntries(null, { selectable: false, packId: pack.id }).filter((e) => e.origin !== 'snapshot');
  const items = all.filter((e) => (state.type === 'todo' || e.type === state.type) && (state.showRetired || e.status !== 'retirado'));
  return html`
    <header class="page-header">
      <div>
        <p class="eyebrow"><a href="/homebrew" data-link>← Homebrew y campañas</a></p>
        <h1>${pack.name}</h1>
        <p>${isLocal ? 'Tu Homebrew en este dispositivo. Todo lo que crees aquí está disponible al instante en tus personajes.'
          : dm ? 'Eres el DM: decides las reglas y qué contenido ven los jugadores.' : 'Eres jugador: ves el contenido que el DM ha publicado.'}</p>
      </div>
      <div class="row">
        ${isLocal ? '' : html`<span class="badge ${dm ? 'badge--gold' : ''}">${roleLabel(pack.role)}</span>`}
        ${isLocal ? '' : html`<button type="button" class="btn btn--ghost btn--sm" data-act="refresh">↻ Actualizar</button>`}
        <button type="button" class="btn btn--ghost btn--sm" data-act="export">⤓ Exportar</button>
      </div>
    </header>
    ${dm ? html`<div class="stack">${inviteCard(m)}${rulesCard(pack)}</div>` : ''}
    ${!isLocal && !dm ? html`<details class="disclosure"><summary>Reglas de la campaña</summary><div class="disclosure__body">
      <ul class="summary-list">${CONTENT_TYPE_KEYS.map((t) => html`<li><span>${CONTENT_TYPES[t].plural}</span><strong>${OFFICIAL_TYPES.includes(t) ? (rules.official[t] ? 'Oficial permitido · ' : 'Oficial NO permitido · ') : ''}Homebrew: ${HOMEBREW_MODES[rules.homebrew[t]]}</strong></li>`)}
      <li><span>Bendiciones épicas</span><strong>${rules.epicBoons ? 'Permitidas' : 'No'}</strong></li></ul>
    </div></details>` : ''}
    <section class="card">
      <header class="card__header">
        <div><h2 class="card__title">Contenido</h2><p class="card__subtitle">${all.length} elementos</p></div>
        ${creatable.length ? html`<div class="row">
          <select class="select" data-new-type aria-label="Tipo de contenido nuevo">${creatable.map((t) => html`<option value="${t}">${CONTENT_TYPES[t].icon} ${CONTENT_TYPES[t].label}</option>`)}</select>
          <button type="button" class="btn btn--primary" data-act="new">${dm || isLocal ? '+ Crear' : '+ Proponer al DM'}</button>
        </div>` : ''}
      </header>
      <div class="chips" role="group" aria-label="Filtrar por tipo">
        ${['todo', ...CONTENT_TYPE_KEYS].map((t) => html`<button type="button" class="chip-toggle ${state.type === t ? 'is-on' : ''}" aria-pressed="${state.type === t}" data-type="${t}">${t === 'todo' ? 'Todo' : CONTENT_TYPES[t].plural}</button>`)}
        <label class="check"><input type="checkbox" data-show-retired ${state.showRetired ? raw('checked') : ''}> Ver retirados</label>
      </div>
      ${items.length ? html`<ul class="content-list">${items.map((e) => html`<li class="content-item">
          <span class="content-item__icon" aria-hidden="true">${CONTENT_TYPES[e.type].icon}</span>
          ${!isLocal && !dm && e.type === 'extension' && e.item.access === 'desbloqueo' ? html`<div class="content-item__main">
            <strong>🔒 Contenido secreto</strong>
            <span class="muted">${CONTENT_TYPES[e.type].label} para ${getClass(e.item.classKey)?.nombre ?? 'una clase'} · se desbloquea con un código del DM</span>
          </div>` : html`<div class="content-item__main">
            <strong>${e.item.name}</strong>
            <span class="muted">${CONTENT_TYPES[e.type].label}${e.type === 'extension' ? ` · ${getClass(e.item.classKey)?.nombre ?? e.item.classKey} · ${e.item.access === 'desbloqueo' ? 'con código' : 'abierta'}` : ''} · v${e.version}</span>
            ${e.item.description ? html`<span class="content-item__desc">${e.item.description.slice(0, 160)}${e.item.description.length > 160 ? '…' : ''}</span>` : ''}
          </div>`}
          ${isLocal && e.status !== 'retirado' ? '' : html`<span class="badge ${STATUS_BADGE[e.status] ?? ''}">${CONTENT_STATUS[e.status] ?? e.status}</span>`}
          ${itemActions(svc, pack, e)}
        </li>`)}</ul>`
        : html`<p class="muted">${all.length ? 'Nada con este filtro.' : 'Todavía no hay contenido.'}</p>`}
    </section>
    ${isLocal ? '' : html`<div class="row"><button type="button" class="btn btn--ghost btn--danger-text" data-act="leave">Salir de la campaña en este dispositivo</button></div>`}`;
}

// ── Montaje ──────────────────────────────────────────────────────────────

export function mountHomebrew(container, ctx, packId = null) {
  const svc = ctx.services.homebrew;
  const page = document.createElement('section');
  page.className = 'page homebrew-page';
  container.append(page);
  const state = { type: 'todo', showRetired: false };

  function currentPack() {
    if (!packId) return null;
    if (packId === svc.localPack().id) return { ...svc.localPack(), kind: 'local', role: 'propietario' };
    return getPack(packId);
  }

  function render() {
    const openKeys = new Set([...page.querySelectorAll('details[data-key][open]')].map((d) => d.dataset.key));
    const pack = currentPack();
    if (packId && !pack) {
      setHtml(page, html`<div class="empty-state"><h1>Campaña no encontrada</h1><p>No perteneces a esta campaña en este dispositivo.</p><a class="btn btn--primary" href="/homebrew" data-link>Volver</a></div>`);
      return;
    }
    setHtml(page, pack ? detail(svc, pack, state) : overview(svc));
    for (const d of page.querySelectorAll('details[data-key]')) if (openKeys.has(d.dataset.key)) d.open = true;
  }

  async function run(fn, success) {
    try {
      const res = await fn();
      if (success) toast(typeof success === 'function' ? success(res) : success, { type: 'success' });
      return res;
    } catch (err) {
      reportError(err, 'No se pudo completar la operación.');
      return undefined;
    } finally {
      render();
    }
  }

  async function createCampaign() {
    const name = await openDialog({
      title: 'Nueva campaña',
      size: 'sm',
      render(body, close) {
        setHtml(body, html`<form class="stack" data-f>
          <div class="field"><label class="field__label" for="cmp-name">Nombre de la campaña</label><input id="cmp-name" class="input" maxlength="120" required autofocus></div>
          <p class="field__hint">Serás el DM. Recibirás un enlace de invitación para tus jugadores.</p>
          <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button class="btn btn--primary">Crear</button></div>
        </form>`);
        body.querySelector('[data-f]').addEventListener('submit', (e) => { e.preventDefault(); const v = body.querySelector('#cmp-name').value.trim(); if (v) close(v); });
      },
    });
    if (!name) return;
    const m = await run(() => svc.create(name), 'Campaña creada.');
    if (m) ctx.navigate(`/homebrew/${m.id}`);
  }

  async function joinWithLink() {
    const link = await openDialog({
      title: 'Unirme a una campaña',
      size: 'sm',
      render(body, close) {
        setHtml(body, html`<form class="stack" data-f>
          <div class="field"><label class="field__label" for="join-link">Enlace de invitación</label><input id="join-link" class="input" required autofocus placeholder="https://…/unirse#…"></div>
          <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button class="btn btn--primary">Unirme</button></div>
        </form>`);
        body.querySelector('[data-f]').addEventListener('submit', (e) => { e.preventDefault(); close(body.querySelector('#join-link').value.trim()); });
      },
    });
    if (!link) return;
    const inv = parseInvite(link.includes('#') ? link.slice(link.indexOf('#')) : link);
    if (!inv) { toast('Ese enlace no parece una invitación válida.', { type: 'error' }); return; }
    const m = await run(() => svc.join(inv.id, inv.code), (x) => `Te uniste a «${x.name}» como ${roleLabel(x.role)}.`);
    if (m) ctx.navigate(`/homebrew/${m.id}`);
  }

  function showCode(item, code) {
    return openDialog({
      title: `Código de «${item.name}»`,
      size: 'sm',
      render(body, close) {
        setHtml(body, html`<div class="stack">
          <p class="unlock-code" aria-label="Código de desbloqueo">${code}</p>
          <p class="dialog__message">Dáselo sólo al jugador que debe recibir este contenido. Lo escribirá en su ficha: «Rasgos → Contenido especial → Tengo un código». Puedes volver a verlo aquí, en este dispositivo.</p>
          <div class="dialog__actions"><button type="button" class="btn btn--ghost" data-copy>Copiar</button><button type="button" class="btn btn--primary" data-ok>Entendido</button></div>
        </div>`);
        body.querySelector('[data-ok]').addEventListener('click', () => close());
        body.querySelector('[data-copy]').addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(code); toast('Copiado.', { type: 'success' }); } catch { /* el código está a la vista */ }
        });
      },
    });
  }

  /** Para extensiones «con código»: crea el código si aún no hay uno (o si se pide uno nuevo). */
  async function withUnlockCode(item, { renew = false } = {}) {
    if (item.access !== 'desbloqueo' || (item.unlockHash && !renew)) return { item, code: null };
    const code = generateUnlockCode();
    return { item: { ...item, unlockHash: await hashUnlockCode(code) }, code };
  }

  async function saveItem(pack, type, data, contentId) {
    if (pack.kind === 'local') {
      const res = svc.saveLocalItem({ type, data, contentId });
      if (res.errors.length) { toast(res.errors.join(' '), { type: 'error' }); return null; }
      return res;
    }
    return run(() => svc.saveCampaignItem(pack.id, { type, data, contentId }), (r) => (r.status === 'propuesto' ? 'Propuesta enviada al DM.' : `«${data.name}» guardado (${CONTENT_STATUS[r.status]?.toLowerCase()}).`));
  }

  async function editItem(pack, type, entry) {
    const dm = pack.role === 'dm';
    const isLocal = pack.kind === 'local';
    const item = await openContentEditor(type, entry?.item ?? null, {
      draftKey: `${pack.id}:${type}:${entry?.ref.split(':').at(-1) ?? 'nuevo'}`,
      note: isLocal ? '' : dm ? 'Los cambios en contenido publicado llegan a los jugadores al actualizar; sus fichas avisarán de la nueva versión.' : 'Tu propuesta la revisará el DM antes de que se pueda usar.',
    });
    if (!item) return;
    const contentId = entry?.ref.split(':').at(-1) ?? null;
    const { item: data, code } = type === 'extension' ? await withUnlockCode(item) : { item, code: null };
    const res = await saveItem(pack, type, data, contentId);
    if (!res) return;
    if (isLocal) toast(`«${item.name}» guardado.`, { type: 'success' });
    render();
    if (code) {
      svc.setUnlockCode(pack.id, res.ref, code);
      await showCode(data, code);
    }
  }

  async function codeFor(pack, entry, { renew = false } = {}) {
    if (!renew) {
      const known = svc.unlockCode(pack.id, entry.ref);
      if (known) return showCode(entry.item, known);
    }
    const ok = await confirmDialog({
      title: 'Generar un código nuevo',
      message: renew ? 'El código anterior dejará de servir para desbloquearlo. Quien ya lo tenga en su ficha lo conserva en este dispositivo, pero no podrá publicar la ficha en la campaña hasta usar el código nuevo.'
        : 'Este dispositivo no guarda el código actual (quizá se creó en otro). Puedes generar uno nuevo: el anterior dejará de servir.',
      confirmLabel: 'Generar',
    });
    if (!ok) return undefined;
    const { item: data, code } = await withUnlockCode(entry.item, { renew: true });
    const res = await saveItem(pack, 'extension', data, entry.ref.split(':').at(-1));
    if (!res) return undefined;
    svc.setUnlockCode(pack.id, res.ref, code);
    render();
    return showCode(data, code);
  }

  page.addEventListener('click', async (e) => {
    const typeBtn = e.target.closest('[data-type]');
    if (typeBtn) { state.type = typeBtn.dataset.type; render(); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const pack = currentPack();
    const entry = btn.dataset.ref ? listEntries(null, { selectable: false, packId: pack?.id }).find((x) => x.ref === btn.dataset.ref) : null;
    switch (act) {
      case 'create-campaign': return createCampaign();
      case 'join': return joinWithLink();
      case 'import': {
        try {
          const raw = await readJsonFile();
          if (!raw) return undefined;
          const res = svc.importPack(raw);
          toast(`Importados ${res.added} elementos${res.rejected.length ? ` (${res.rejected.length} no válidos)` : ''}.`, { type: res.rejected.length ? 'warning' : 'success' });
        } catch (err) { toast(userMessageFor(err, 'No se pudo importar el archivo.'), { type: 'error' }); }
        return render();
      }
      case 'export': return downloadJson(svc.exportPack(pack.id), `homebrew-${pack.name}`);
      case 'refresh': return run(() => svc.refresh(pack.id), 'Campaña actualizada.');
      case 'new': return editItem(pack, page.querySelector('[data-new-type]').value, null);
      case 'edit': return entry && editItem(pack, entry.type, entry);
      case 'code': return entry && codeFor(pack, entry);
      case 'renew-code': return entry && codeFor(pack, entry, { renew: true });
      case 'restore': svc.restoreLocalItem(btn.dataset.ref); return render();
      case 'delete': {
        if (!entry) return undefined;
        const published = pack.kind !== 'local' && !['borrador', 'propuesto'].includes(entry.status);
        const ok = await confirmDialog({
          title: `Eliminar «${entry.item.name}»`,
          message: published || pack.kind === 'local'
            ? 'Se retirará: dejará de ofrecerse, pero los personajes que ya lo usan lo conservan. Puedes restaurarlo después.'
            : 'Se eliminará definitivamente.',
          confirmLabel: 'Eliminar', danger: true,
        });
        if (!ok) return undefined;
        if (pack.kind === 'local') { svc.removeLocalItem(entry.ref); return render(); }
        return run(() => svc.removeCampaignItem(pack.id, entry.ref), 'Hecho.');
      }
      case 'copy': {
        const input = page.querySelector(`[data-copy-src="${btn.dataset.src}"]`);
        try { await navigator.clipboard.writeText(input.value); toast('Copiado.', { type: 'success' }); } catch { input.type = 'text'; input.select(); }
        return undefined;
      }
      case 'rotate-invite': {
        const ok = await confirmDialog({ title: 'Nuevo enlace de invitación', message: 'El enlace anterior dejará de funcionar para quien aún no se haya unido, y los jugadores que lo usan tendrán que unirse de nuevo con el nuevo.', confirmLabel: 'Generar' });
        if (ok) await run(() => svc.rotateInvite(pack.id), 'Nuevo enlace generado.');
        return undefined;
      }
      case 'leave': {
        const ok = await confirmDialog({ title: 'Salir de la campaña', message: pack.role === 'dm' ? 'Se borrará tu clave de DM de este dispositivo. Si no la tienes guardada en otro sitio, no podrás volver a administrar la campaña.' : 'Podrás volver a unirte con el enlace de invitación.', confirmLabel: 'Salir', danger: true });
        if (ok) { svc.leave(pack.id); ctx.navigate('/homebrew'); }
        return undefined;
      }
      default: return undefined;
    }
  });

  page.addEventListener('change', async (e) => {
    if (e.target.matches('[data-show-retired]')) { state.showRetired = e.target.checked; render(); return; }
    const sel = e.target.closest('[data-act-change="status"]');
    if (sel) await run(() => svc.setCampaignStatus(currentPack().id, sel.dataset.ref, sel.value), `Estado: ${CONTENT_STATUS[sel.value]}.`);
  });

  page.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-rules]');
    if (!form) return;
    e.preventDefault();
    const fd = new FormData(form);
    const rules = {
      official: Object.fromEntries(OFFICIAL_TYPES.map((t) => [t, fd.get(`official-${t}`) === 'on'])),
      homebrew: Object.fromEntries(CONTENT_TYPE_KEYS.map((t) => [t, fd.get(`homebrew-${t}`)])),
      epicBoons: fd.get('epicBoons') === 'on',
      traitEffects: fd.get('traitEffects'),
    };
    await run(() => svc.updateCampaign(currentPack().id, { rules }), 'Reglas guardadas.');
  });

  const off = onRegistryChange(() => render());
  render();
  return { unmount: off };
}

export async function mountJoin(container, ctx) {
  const svc = ctx.services.homebrew;
  const page = document.createElement('section');
  page.className = 'page';
  container.append(page);
  const inv = parseInvite(window.location.hash);
  if (!inv) {
    setHtml(page, html`<div class="empty-state"><h1>Enlace no válido</h1><p>Pide a tu DM que te vuelva a enviar el enlace de invitación.</p><a class="btn btn--primary" href="/homebrew" data-link>Ir a Homebrew</a></div>`);
    return null;
  }
  // El código no debe quedarse en la barra de direcciones ni en el historial.
  history.replaceState({}, '', '/unirse');
  if (!svc.available()) {
    setHtml(page, html`<div class="empty-state"><h1>Campañas no disponibles</h1><p>Esta instalación no tiene el servidor de campañas configurado.</p></div>`);
    return null;
  }
  setHtml(page, html`<div class="empty-state"><h1>Uniéndote a la campaña…</h1></div>`);
  try {
    const m = await svc.join(inv.id, inv.code);
    toast(`Te uniste a «${m.name}» como ${roleLabel(m.role)}.`, { type: 'success' });
    ctx.navigate(`/homebrew/${m.id}`, { replace: true });
  } catch (err) {
    setHtml(page, html`<div class="empty-state"><h1>No se pudo unir</h1><p>${userMessageFor(err, 'El enlace no es válido o ha caducado.')}</p><a class="btn btn--primary" href="/homebrew" data-link>Ir a Homebrew</a></div>`);
  }
  return null;
}

