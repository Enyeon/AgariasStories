// Página «Homebrew»: contenido propio (reutilizable) y el de cada campaña.
//
//   /homebrew             resumen: mi Homebrew + el Homebrew de mis campañas
//   /homebrew/<paquete>   contenido de un paquete (local o campaña) y, si eres
//                         DM, las reglas de contenido de la campaña
//
// Crear campañas, invitar, aprobar jugadores y jugar está en «Campañas»
// (views/campaigns.js).

import { html, raw, setHtml } from '../ui/dom.js';
import { toast, confirmDialog, choiceDialog, openDialog, reportError, userMessageFor } from '../ui/feedback.js';
import { listEntries, onRegistryChange, getPack } from '../content/registry.js';
import { CONTENT_TYPES, CONTENT_TYPE_KEYS, CONTENT_STATUS } from '../content/schema.js';
import { HOMEBREW_MODES, OFFICIAL_TYPES, normalizeRules } from '../content/rules.js';
import { setWorldEditingPack, locationOptions } from '../content/world-options.js';
import {
  CAMPAIGN_SYSTEMS, CAMPAIGN_KINDS, CAMPAIGN_STYLES, CAMPAIGN_TONES, CAMPAIGN_MODALITIES, CAMPAIGN_STATUS, CAMPAIGN_WORLDS, normalizeCampaignDetails, campaignSummary,
} from '../domain/campaign.js';
import { downloadJson, readJsonFile } from '../services/file-transfer.js';
import { openContentEditor } from './components/content-editor.js';
import { generateUnlockCode, hashUnlockCode } from '../domain/extensions.js';
import { getClass } from '../data/index.js';
import { linkState, changedFields, pendingUpdates, findLinked } from '../content/library.js';

const STATUS_BADGE = { borrador: '', propuesto: 'badge--accent', publicado: 'badge--success', oculto: 'badge--warning', retirado: 'badge--danger', instantanea: '' };

export function roleLabel(role) {
  return role === 'dm' ? 'DM' : role === 'observador' ? 'Observador' : 'Jugador';
}

// ── Resumen ──────────────────────────────────────────────────────────────

function overview(svc) {
  const local = svc.localPack();
  const localCount = listEntries(null, { packId: local.id }).length;
  const usage = svc.libraryUsage();
  const pending = pendingUpdates(usage);
  const usedIn = new Set([...usage.values()].flat().map((u) => u.campaignId)).size;
  const ms = svc.memberships();
  const online = svc.available();
  return html`
    <header class="page-header">
      <div><h1>Homebrew</h1><p>Crea tus propias clases, razas, hechizos, dotes, criaturas… y compártelas con tu mesa.</p></div>
    </header>
    <div class="grid-2">
      <section class="card">
        <header class="card__header"><div><h2 class="card__title">📚 Mi biblioteca</h2><p class="card__subtitle">Tu Homebrew reutilizable, en este dispositivo. Úsalo en todas tus campañas sin duplicarlo: cada campaña fija una versión y te avisamos cuando hay una nueva.</p></div></header>
        <p class="row"><span class="badge">${localCount} ${localCount === 1 ? 'elemento' : 'elementos'}</span>${usedIn ? html`<span class="badge badge--accent">En ${usedIn} ${usedIn === 1 ? 'campaña' : 'campañas'}</span>` : ''}
          ${pending ? html`<span class="badge badge--warning">⟳ ${pending} ${pending === 1 ? 'actualización pendiente' : 'actualizaciones pendientes'}</span>` : ''}</p>
        <div class="row">
          <a class="btn btn--primary" href="/homebrew/${local.id}" data-link>Abrir biblioteca</a>
          <button type="button" class="btn btn--ghost" data-act="import">⤒ Importar paquete</button>
        </div>
      </section>
      <section class="card">
        <header class="card__header"><div><h2 class="card__title">Homebrew de tus campañas</h2><p class="card__subtitle">El DM decide qué contenido se permite y publica su Homebrew; los jugadores lo usan en sus fichas.</p></div></header>
        ${online ? '' : html`<p class="callout callout--warning">Las campañas necesitan el servidor en línea (Supabase), que aún no está configurado en esta instalación. Mientras tanto, usa «Mi Homebrew» y comparte el archivo exportado.</p>`}
        ${ms.length ? html`<ul class="campaign-list">${ms.map((m) => html`<li>
            <a href="/homebrew/${m.id}" data-link><strong>${m.name}</strong></a>
            <a class="btn btn--ghost btn--sm" href="/campanas/${m.id}" data-link title="Jugadores, PJ y registro">🏰 Jugar</a>
            <span class="badge ${m.role === 'dm' ? 'badge--gold' : ''}">${roleLabel(m.role)}</span>
            ${campaignSummary(getPack(m.id)?.details) ? html`<span class="muted campaign-list__summary">${campaignSummary(getPack(m.id)?.details)}</span>` : ''}
          </li>`)}</ul>` : html`<p class="muted">Todavía no participas en ninguna campaña.</p>`}
        <div class="row">
          <a class="btn btn--primary" href="/campanas" data-link>🏰 Ir a Campañas</a>
        </div>
      </section>
    </div>`;
}

// ── Detalle de un paquete ────────────────────────────────────────────────

/** Ficha de la campaña: la ven todos los miembros; sólo el DM la edita. */
export function campaignCard(pack) {
  const d = pack.details ?? {};
  const dm = pack.role === 'dm';
  const empty = !Object.keys(d).length;
  const row = (label, value) => (value ? html`<li><span>${label}</span><strong>${value}</strong></li>` : '');
  const start = d.startLocation ? (locationOptions()[d.startLocation] ?? d.startLocation) : '';
  return html`<section class="card campaign-card">
    <header class="card__header">
      <div><h2 class="card__title">📖 Ficha de la campaña</h2><p class="card__subtitle">${campaignSummary(d) || (dm ? 'Cuéntales a tus jugadores de qué va la campaña.' : 'El DM todavía no ha rellenado la ficha.')}</p></div>
      ${dm ? html`<button type="button" class="btn ${empty ? 'btn--primary' : 'btn--ghost'} btn--sm" data-act="edit-details">${empty ? '✏️ Rellenar ficha' : '✏️ Editar ficha'}</button>` : ''}
    </header>
    ${d.synopsis ? html`<p class="campaign-card__synopsis">${d.synopsis}</p>` : ''}
    ${empty ? '' : html`<ul class="summary-list">
      ${row('Dungeon Master', d.dmName)}
      ${row('Ambientación', d.setting)}
      ${row('Mundo de la Tienda', d.world ? CAMPAIGN_WORLDS[d.world] : '')}
      ${row('Sistema', CAMPAIGN_SYSTEMS[d.system])}
      ${row('Estilo de juego', (d.styles ?? []).map((x) => CAMPAIGN_STYLES[x]).join(', '))}
      ${row('Tono', CAMPAIGN_TONES[d.tone])}
      ${row('Modalidad', [CAMPAIGN_MODALITIES[d.modality], d.platform].filter(Boolean).join(' · '))}
      ${row('Sesiones', d.schedule)}
      ${row('Lugar de inicio', start)}
      ${row('Líneas (no aparece nunca)', (d.safety?.lines ?? []).join(', '))}
      ${row('Velos (ocurre fuera de escena)', (d.safety?.veils ?? []).join(', '))}
    </ul>`}
    ${d.houseRules ? html`<details class="disclosure"><summary>Reglas de la casa</summary><div class="disclosure__body"><p class="pre-line">${d.houseRules}</p></div></details>` : ''}
  </section>`;
}

function rulesCard(pack) {
  const rules = normalizeRules(pack.rules);
  return html`<details class="disclosure" data-key="rules">
    <summary>Reglas de la campaña</summary>
    <div class="disclosure__body">
      <form class="stack" data-rules>
        <div class="table-wrap"><table class="table rules-table">
          <thead><tr><th scope="col">Tipo</th><th scope="col">Contenido oficial</th><th scope="col">Homebrew</th></tr></thead>
          <tbody>${CONTENT_TYPE_KEYS.map((t) => html`<tr>
            <th scope="row">${CONTENT_TYPES[t].icon} ${CONTENT_TYPES[t].plural}</th>
            <td data-label="Contenido oficial">${OFFICIAL_TYPES.includes(t) ? html`<label class="check"><input type="checkbox" name="official-${t}" ${rules.official[t] ? raw('checked') : ''}> Permitido</label>` : html`<span class="muted">—</span>`}</td>
            <td data-label="Homebrew">${CONTENT_TYPES[t].dmOnly
              ? html`<span class="muted" title="El mundo de la Tienda sólo lo configura el DM">Sólo el DM (siempre)</span>`
              : html`<select class="select" name="homebrew-${t}" aria-label="Homebrew de ${CONTENT_TYPES[t].plural}">${Object.entries(HOMEBREW_MODES).map(([k, l]) => html`<option value="${k}" ${rules.homebrew[t] === k ? raw('selected') : ''}>${l}</option>`)}</select>`}</td>
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

function itemActions(svc, pack, e, ctx) {
  const isLocal = pack.kind === 'local';
  const dm = pack.role === 'dm';
  const ownProposal = !dm && e.status === 'propuesto';
  const canEdit = isLocal ? e.status !== 'retirado' : dm || ownProposal;
  const link = isLocal ? null : linkState(e, ctx.libItems);
  const secret = !isLocal && !dm && e.type === 'extension' && e.item.access === 'desbloqueo';
  return html`<div class="row row--end">
    ${isLocal && e.status !== 'retirado' && ctx.dmCampaigns.length ? html`<button type="button" class="btn btn--ghost btn--sm" data-act="use-in" data-ref="${e.ref}">📤 Usar en campaña</button>` : ''}
    ${dm && link?.state === 'nueva-version' ? html`<button type="button" class="btn btn--primary btn--sm" data-act="update-linked" data-ref="${e.ref}">⟳ Actualizar a v${link.latest}</button>` : ''}
    ${dm && link ? html`<button type="button" class="btn btn--ghost btn--sm" data-act="unlink" data-ref="${e.ref}" title="La campaña conserva su copia, pero deja de seguir a la biblioteca">Desvincular</button>` : ''}
    ${!isLocal && !link?.libraryRef && !secret && e.status !== 'retirado' ? html`<button type="button" class="btn btn--ghost btn--sm" data-act="to-library" data-ref="${e.ref}" title="Guarda una copia en tu biblioteca para usarla en otras campañas">📚 A mi biblioteca</button>` : ''}
    ${canEdit ? html`<button type="button" class="btn btn--ghost btn--sm" data-act="edit" data-ref="${e.ref}">Editar</button>` : ''}
    ${e.type === 'extension' && e.item.access === 'desbloqueo' && (isLocal || dm) ? html`<button type="button" class="btn btn--ghost btn--sm" data-act="code" data-ref="${e.ref}">🔑 Código</button><button type="button" class="btn btn--ghost btn--sm" data-act="renew-code" data-ref="${e.ref}" title="Invalida el código anterior">Nuevo código</button>` : ''}
    ${dm ? html`<select class="select select--sm" data-act-change="status" data-ref="${e.ref}" aria-label="Estado de ${e.item.name}">${Object.entries(CONTENT_STATUS).map(([k, l]) => html`<option value="${k}" ${e.status === k ? raw('selected') : ''}>${l}</option>`)}</select>` : ''}
    ${isLocal && e.status === 'retirado' ? html`<button type="button" class="btn btn--ghost btn--sm" data-act="restore" data-ref="${e.ref}">Restaurar</button>` : ''}
    ${(isLocal && e.status !== 'retirado') || dm ? html`<button type="button" class="icon-btn icon-btn--danger" data-act="delete" data-ref="${e.ref}" aria-label="Eliminar ${e.item.name}">🗑</button>` : ''}
  </div>`;
}

/** Línea de vínculo con la biblioteca (en campaña) o de usos (en la biblioteca). */
function linkLine(pack, e, ctx) {
  if (pack.kind === 'local') {
    const uses = ctx.usage.get(e.ref) ?? [];
    if (!uses.length) return '';
    return html`<span class="lib-uses">📤 ${uses.map((u, i) => html`${i ? ' · ' : ''}<a href="/homebrew/${u.campaignId}" data-link>${u.campaignName}</a> ${u.outdated
      ? html`<span class="badge badge--warning" title="La campaña usa la v${u.pinned}">v${u.pinned} → v${e.version}</span>`
      : html`<span class="badge badge--success" title="Al día">v${u.pinned} ✓</span>`}`)}</span>`;
  }
  const link = linkState(e, ctx.libItems);
  if (!link) return '';
  const text = {
    'al-dia': `📚 De tu biblioteca · v${link.pinned} (al día)`,
    'nueva-version': `📚 De tu biblioteca · usa la v${link.pinned}; hay una v${link.latest}`,
    'retirado-en-biblioteca': `📚 De tu biblioteca · v${link.pinned} (lo retiraste de la biblioteca)`,
    'otra-biblioteca': `📚 De la biblioteca del DM · v${link.pinned}`,
  }[link.state];
  return html`<span class="lib-link lib-link--${link.state}">${text}</span>`;
}

function detail(svc, pack, state) {
  const isLocal = pack.kind === 'local';
  const dm = pack.role === 'dm';
  const ctx = { libItems: svc.localPack().items, dmCampaigns: svc.dmCampaigns(), usage: isLocal ? svc.libraryUsage() : new Map() };
  const pending = isLocal ? pendingUpdates(ctx.usage) : dm ? listEntries(null, { selectable: false, packId: pack.id }).filter((e) => linkState(e, ctx.libItems)?.state === 'nueva-version').length : 0;
  const rules = normalizeRules(pack.rules);
  const creatable = isLocal || dm ? CONTENT_TYPE_KEYS : CONTENT_TYPE_KEYS.filter((t) => rules.homebrew[t] === 'propuestas');
  const all = listEntries(null, { selectable: false, packId: pack.id }).filter((e) => e.origin !== 'snapshot');
  const items = all.filter((e) => (state.type === 'todo' || e.type === state.type) && (state.showRetired || e.status !== 'retirado'));
  return html`
    <header class="page-header">
      <div>
        <p class="eyebrow"><a href="/homebrew" data-link>← Homebrew</a>${isLocal ? '' : html` · <a href="/campanas/${pack.id}" data-link>🏰 Ir a la campaña</a>`}</p>
        <h1>${isLocal ? '📚 Mi biblioteca' : pack.name}</h1>
        <p>${isLocal ? 'Tu Homebrew reutilizable, en este dispositivo. Lo que crees aquí está al instante en tus personajes y puedes usarlo en tus campañas (📤) sin duplicarlo.'
          : dm ? 'Eres el DM: decides las reglas y qué contenido ven los jugadores.' : 'Eres jugador: ves el contenido que el DM ha publicado.'}</p>
      </div>
      <div class="row">
        ${isLocal ? '' : html`<span class="badge ${dm ? 'badge--gold' : ''}">${roleLabel(pack.role)}</span>`}
        ${isLocal ? '' : html`<button type="button" class="btn btn--ghost btn--sm" data-act="refresh">↻ Actualizar</button>`}
        ${dm ? html`<button type="button" class="btn btn--primary btn--sm" data-act="from-library">📚 Añadir desde mi biblioteca</button>` : ''}
        ${isLocal ? html`<button type="button" class="btn btn--ghost btn--sm" data-act="import">⤒ Importar</button>` : ''}
        <button type="button" class="btn btn--ghost btn--sm" data-act="export" title="${isLocal ? 'Copia de la biblioteca (para otro dispositivo o persona); al importarla no se duplica nada' : 'Exportar el contenido'}">⤓ Exportar</button>
      </div>
    </header>
    ${pending ? html`<div class="callout callout--warning lib-pending"><p><strong>⟳ ${pending} ${pending === 1 ? 'elemento tiene' : 'elementos tienen'} una versión nueva en tu biblioteca.</strong> ${isLocal ? 'Las campañas siguen con la versión que tenían hasta que las actualices.' : 'La campaña sigue con la versión fijada hasta que la actualices.'}</p>
      <div class="row"><button type="button" class="btn btn--primary btn--sm" data-act="${isLocal ? 'update-all' : 'update-campaign'}">Revisar y actualizar</button></div></div>` : ''}
    ${isLocal ? '' : campaignCard(pack)}
    ${dm ? html`<div class="stack">${rulesCard(pack)}</div>` : ''}
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
            ${linkLine(pack, e, ctx)}
          </div>`}
          ${isLocal && e.status !== 'retirado' ? '' : html`<span class="badge ${STATUS_BADGE[e.status] ?? ''}">${CONTENT_STATUS[e.status] ?? e.status}</span>`}
          ${itemActions(svc, pack, e, ctx)}
        </li>`)}</ul>`
        : html`<p class="muted">${all.length ? 'Nada con este filtro.' : 'Todavía no hay contenido.'}</p>`}
    </section>
    ${isLocal ? '' : html`<div class="row"><button type="button" class="btn btn--ghost btn--danger-text" data-act="leave">Salir de la campaña en este dispositivo</button></div>`}`;
}

/** Formulario de la ficha de la campaña (sólo el DM). Devuelve true si se guardó. */
export async function editCampaignDetails(svc, pack) {
  const d = pack.details ?? {};
  setWorldEditingPack(pack.id);
  const opt = (map, value, empty = '— Sin especificar —') => html`<option value="">${empty}</option>${Object.entries(map).map(([k, l]) => html`<option value="${k}" ${value === k ? raw('selected') : ''}>${l}</option>`)}`;
  const num = (name, value, min, max) => html`<input class="input input--num" type="number" name="${name}" min="${min}" max="${max}" value="${value ?? ''}">`;
  const result = await openDialog({
    title: `Ficha de «${pack.name}»`,
    size: 'lg',
    render(body, close) {
      setHtml(body, html`<form class="stack campaign-form" data-f novalidate>
        <div class="grid-2">
          <div class="field"><label class="field__label" for="cd-name">Nombre de la campaña</label><input id="cd-name" class="input" name="name" maxlength="120" required value="${pack.name}"></div>
          <div class="field"><label class="field__label" for="cd-dm">Dungeon Master</label><input id="cd-dm" class="input" name="dmName" maxlength="60" value="${d.dmName ?? ''}" placeholder="Tu nombre o apodo"></div>
        </div>
        <div class="field"><label class="field__label" for="cd-syn">Sinopsis</label><textarea id="cd-syn" class="textarea" name="synopsis" rows="4" maxlength="3000" placeholder="De qué va la campaña, sin destripar nada.">${d.synopsis ?? ''}</textarea></div>
        <div class="grid-2">
          <div class="field"><label class="field__label" for="cd-kind">Tipo de campaña</label><select id="cd-kind" class="select" name="kind">${opt(CAMPAIGN_KINDS, d.kind)}</select></div>
          <div class="field"><label class="field__label" for="cd-status">Estado</label><select id="cd-status" class="select" name="status">${opt(CAMPAIGN_STATUS, d.status)}</select></div>
          <div class="field"><label class="field__label" for="cd-system">Sistema</label><select id="cd-system" class="select" name="system">${opt(CAMPAIGN_SYSTEMS, d.system)}</select></div>
          <div class="field"><label class="field__label" for="cd-setting">Ambientación / mundo</label><input id="cd-setting" class="input" name="setting" maxlength="120" value="${d.setting ?? ''}" placeholder="Agarias, Reinos Olvidados…"></div>
          <div class="field"><label class="field__label" for="cd-world">Mundo de la Tienda</label><select id="cd-world" class="select" name="world">${opt(CAMPAIGN_WORLDS, d.world ?? 'agarias')}</select></div>
          <div class="field"><label class="field__label" for="cd-tone">Tono</label><select id="cd-tone" class="select" name="tone">${opt(CAMPAIGN_TONES, d.tone)}</select></div>
          <div class="field"><label class="field__label" for="cd-start">Lugar de inicio (en la Tienda los personajes empiezan aquí)</label><select id="cd-start" class="select" name="startLocation">${opt(locationOptions(), d.startLocation, '— El de siempre —')}</select></div>
        </div>
        <fieldset class="choice-group"><legend>Estilo de juego (tipo de rol)</legend><div class="chips">${Object.entries(CAMPAIGN_STYLES).map(([k, l]) => html`<label class="chip"><input type="checkbox" name="styles" value="${k}" ${(d.styles ?? []).includes(k) ? raw('checked') : ''}>${l}</label>`)}</div></fieldset>
        <div class="grid-2">
          <div class="field"><span class="field__label">Jugadores (mínimo – máximo)</span><div class="row">${num('playersMin', d.players?.min, 1, 12)}<span>–</span>${num('playersMax', d.players?.max, 1, 12)}</div></div>
          <div class="field"><span class="field__label">Nivel (inicial – máximo previsto)</span><div class="row">${num('levelStart', d.levels?.start, 1, 20)}<span>–</span>${num('levelMax', d.levels?.max, 1, 20)}</div></div>
          <div class="field"><label class="field__label" for="cd-mod">Modalidad</label><select id="cd-mod" class="select" name="modality">${opt(CAMPAIGN_MODALITIES, d.modality)}</select></div>
          <div class="field"><label class="field__label" for="cd-plat">Dónde se juega</label><input id="cd-plat" class="input" name="platform" maxlength="80" value="${d.platform ?? ''}" placeholder="Discord, Foundry, en casa de…"></div>
        </div>
        <div class="field"><label class="field__label" for="cd-sch">Sesiones (día, hora, frecuencia)</label><input id="cd-sch" class="input" name="schedule" maxlength="120" value="${d.schedule ?? ''}" placeholder="Viernes 21:00, cada dos semanas"></div>
        <div class="grid-2">
          <div class="field"><label class="field__label" for="cd-lines">Líneas: temas que no aparecen nunca (uno por línea)</label><textarea id="cd-lines" class="textarea" name="lines" rows="3">${(d.safety?.lines ?? []).join('\n')}</textarea></div>
          <div class="field"><label class="field__label" for="cd-veils">Velos: ocurren fuera de escena (uno por línea)</label><textarea id="cd-veils" class="textarea" name="veils" rows="3">${(d.safety?.veils ?? []).join('\n')}</textarea></div>
        </div>
        <div class="field"><label class="field__label" for="cd-rules">Reglas de la casa</label><textarea id="cd-rules" class="textarea" name="houseRules" rows="4" maxlength="4000">${d.houseRules ?? ''}</textarea></div>
        <p class="field__hint">Todo es opcional y lo ven todos los jugadores de la campaña.</p>
        <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button class="btn btn--primary">Guardar ficha</button></div>
      </form>`);
      const form = body.querySelector('[data-f]');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const name = String(fd.get('name') ?? '').trim();
        if (!name) { form.querySelector('#cd-name').focus(); return; }
        close({
          name,
          details: {
            dmName: fd.get('dmName'), synopsis: fd.get('synopsis'), kind: fd.get('kind'), status: fd.get('status'), system: fd.get('system'),
            setting: fd.get('setting'), world: fd.get('world'), tone: fd.get('tone'), startLocation: fd.get('startLocation') || null, styles: fd.getAll('styles'),
            players: { min: fd.get('playersMin'), max: fd.get('playersMax') }, levels: { start: fd.get('levelStart'), max: fd.get('levelMax') },
            modality: fd.get('modality'), platform: fd.get('platform'), schedule: fd.get('schedule'),
            safety: { lines: String(fd.get('lines') ?? '').split('\n'), veils: String(fd.get('veils') ?? '').split('\n') },
            houseRules: fd.get('houseRules'),
          },
        });
      });
    },
  });
  if (!result) return false;
  try {
    if (result.name !== pack.name) await svc.updateCampaign(pack.id, { name: result.name });
    await svc.updateDetails(pack.id, normalizeCampaignDetails(result.details));
    toast('Ficha de la campaña guardada.', { type: 'success' });
    return true;
  } catch (err) {
    reportError(err, 'No se pudo guardar la ficha.');
    return false;
  }
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

  const editDetails = (pack) => editCampaignDetails(svc, pack).finally(render);

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
    return run(async () => {
      try {
        return await svc.saveCampaignItem(pack.id, { type, data, contentId });
      } catch (err) {
        // Servidor sin la migración de comerciantes: se explica en vez de un error genérico.
        if (CONTENT_TYPES[type]?.dmOnly && err?.code === 'invalid') {
          throw Object.assign(new Error('server_not_ready'), { userMessage: `El servidor de la campaña todavía no admite ${CONTENT_TYPES[type].plural.toLowerCase()}: hay que aplicar las migraciones de Supabase 20261113000000_comerciantes.sql y 20261114000000_mundo_dm.sql. Mientras tanto, puedes crearlo en «Mi Homebrew» (local).` });
        }
        throw err;
      }
    }, (r) => (r.status === 'propuesto' ? 'Propuesta enviada al DM.' : `«${data.name}» guardado (${CONTENT_STATUS[r.status]?.toLowerCase()}).`));
  }

  async function editItem(pack, type, entry) {
    const dm = pack.role === 'dm';
    const isLocal = pack.kind === 'local';
    // Copia vinculada a la biblioteca: lo normal es editar el original y
    // actualizar la campaña; editarla sólo aquí la desvincula.
    const link = !isLocal && dm && entry ? linkState(entry, svc.localPack().items) : null;
    if (link) {
      const choice = await choiceDialog({
        title: `Editar «${entry.item.name}»`,
        message: link.libraryRef
          ? 'Este elemento sale de tu biblioteca. Si lo editas allí, esta campaña se actualiza ahora y las demás campañas que lo usan verán el aviso de versión nueva.'
          : 'Este elemento sale de la biblioteca de otro dispositivo. Si lo editas aquí, la campaña conserva su copia pero deja de seguir a la biblioteca.',
        choices: [
          ...(link.libraryRef ? [{ label: '📚 Editar en la biblioteca (recomendado)', value: 'library', variant: 'btn--primary' }] : []),
          { label: 'Editar sólo en esta campaña (se desvincula)', value: 'here' },
          { label: 'Cancelar', value: undefined },
        ],
      });
      if (!choice) return;
      if (choice === 'library') {
        const lib = listEntries(null, { selectable: false, packId: svc.localPack().id }).find((x) => x.ref === link.libraryRef);
        const local = { ...svc.localPack(), kind: 'local', role: 'propietario' };
        const saved = await editItem(local, type, lib);
        if (saved) await run(() => svc.useInCampaign(pack.id, [link.libraryRef]), `«${lib.item.name}» actualizado en la campaña.`);
        return;
      }
      entry = { ...entry, item: { ...entry.item, linkedFrom: undefined } };
    }
    setWorldEditingPack(pack.id); // las opciones del mundo (regiones, facciones…) son las de este paquete
    const item = await openContentEditor(type, entry?.item ?? null, {
      draftKey: `${pack.id}:${type}:${entry?.ref.split(':').at(-1) ?? 'nuevo'}`,
      note: isLocal ? '' : dm ? 'Los cambios en contenido publicado llegan a los jugadores al actualizar; sus fichas avisarán de la nueva versión.' : 'Tu propuesta la revisará el DM antes de que se pueda usar.',
    });
    if (!item) return false;
    if (!isLocal) delete item.linkedFrom; // al editar en la campaña se desvincula (ver arriba)
    const contentId = entry?.ref.split(':').at(-1) ?? null;
    const { item: data, code } = type === 'extension' ? await withUnlockCode(item) : { item, code: null };
    const res = await saveItem(pack, type, data, contentId);
    if (!res) return false;
    if (isLocal) {
      const uses = (svc.libraryUsage().get(res.ref) ?? []).filter((u) => u.outdated);
      toast(res.unchanged ? 'Sin cambios.' : `«${item.name}» guardado.${uses.length ? ` Hay ${uses.length === 1 ? 'una campaña' : `${uses.length} campañas`} con la versión anterior: actualízalas cuando quieras.` : ''}`, { type: 'success' });
    }
    render();
    if (code) {
      svc.setUnlockCode(pack.id, res.ref, code);
      await showCode(data, code);
    }
    return true;
  }

  // ── Biblioteca ↔ campañas ─────────────────────────────────────────────

  const STATUS_FOR_NEW = html`<label class="field"><span class="field__label">Las copias nuevas entran como</span>
    <select class="select" name="status"><option value="publicado">Publicado (los jugadores lo ven)</option><option value="borrador">Borrador (sólo tú)</option><option value="oculto">Oculto</option></select></label>`;

  function pickDialog({ title, intro, rows, submit, withStatus = true }) {
    return openDialog({
      title,
      size: 'md',
      render(body, close) {
        setHtml(body, html`<form class="stack lib-pick" data-f>
          ${intro ? html`<p class="dialog__message">${intro}</p>` : ''}
          ${rows.length > 8 ? html`<input class="input" type="search" placeholder="Buscar…" data-filter aria-label="Buscar">` : ''}
          <div class="lib-pick__list">${rows.map((r) => html`<label class="lib-pick__row ${r.disabled ? 'is-disabled' : ''}" data-name="${r.label.toLowerCase()}">
            <input type="checkbox" name="pick" value="${r.value}" ${r.checked ? raw('checked') : ''} ${r.disabled ? raw('disabled') : ''}>
            <span><strong>${r.label}</strong><small>${r.hint}</small></span></label>`)}</div>
          ${withStatus ? STATUS_FOR_NEW : ''}
          <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button class="btn btn--primary">${submit}</button></div>
        </form>`);
        const form = body.querySelector('[data-f]');
        form.querySelector('[data-filter]')?.addEventListener('input', (e) => {
          const q = e.target.value.trim().toLowerCase();
          for (const row of form.querySelectorAll('.lib-pick__row')) row.hidden = Boolean(q) && !row.dataset.name.includes(q);
        });
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const picked = fd.getAll('pick').map(String);
          if (!picked.length) { toast('No elegiste nada.', { type: 'info' }); return; }
          close({ picked, status: String(fd.get('status') ?? 'publicado') });
        });
      },
    });
  }

  const summarize = (r) => {
    const parts = [];
    if (r.created) parts.push(`${r.created} ${r.created === 1 ? 'añadido' : 'añadidos'}`);
    if (r.updated) parts.push(`${r.updated} ${r.updated === 1 ? 'actualizado' : 'actualizados'}`);
    if (r.failed?.length) parts.push(`${r.failed.length} con error (${r.failed.map((f) => f.name ?? '').filter(Boolean).join(', ')})`);
    return parts.join(' · ') || 'Nada que hacer.';
  };

  /** Desde la biblioteca: elegir campañas para un elemento. */
  async function useIn(libEntry) {
    const rows = svc.dmCampaigns().map((c) => {
      const linked = findLinked(c.entries, libEntry.ref);
      const pinned = linked?.item.linkedFrom.version;
      return {
        value: c.id, label: c.name, checked: !linked || pinned < libEntry.version, disabled: Boolean(linked) && pinned >= libEntry.version,
        hint: !linked ? 'Nueva copia vinculada' : pinned < libEntry.version ? `Actualizar: v${pinned} → v${libEntry.version}` : `Ya la usa (v${pinned}, al día)`,
      };
    });
    const res = await pickDialog({ title: `Usar «${libEntry.item.name}» en…`, intro: 'Cada campaña guarda su copia con la versión de hoy. Si la vuelves a usar, se actualiza la misma copia (no se duplica).', rows, submit: 'Usar' });
    if (!res) return;
    await run(async () => {
      const all = { created: 0, updated: 0, failed: [] };
      for (const id of res.picked) {
        const r = await svc.useInCampaign(id, [libEntry.ref], { status: res.status });
        all.created += r.created; all.updated += r.updated; all.failed.push(...r.failed);
      }
      return all;
    }, summarize);
  }

  /** Desde una campaña: elegir elementos de la biblioteca. */
  async function fromLibrary(pack) {
    const entries = listEntries(null, { selectable: false, packId: pack.id }).filter((e) => e.origin !== 'snapshot');
    const lib = listEntries(null, { selectable: false, packId: svc.localPack().id }).filter((e) => e.status !== 'retirado');
    if (!lib.length) { toast('Tu biblioteca está vacía. Crea contenido en «Mi biblioteca» o guarda aquí elementos con «📚 A mi biblioteca».', { type: 'info' }); return; }
    const rows = lib.map((e) => {
      const linked = findLinked(entries, e.ref);
      const pinned = linked?.item.linkedFrom.version;
      return {
        value: e.ref, label: `${CONTENT_TYPES[e.type].icon} ${e.item.name}`, checked: Boolean(linked) && pinned < e.version, disabled: Boolean(linked) && pinned >= e.version,
        hint: `${CONTENT_TYPES[e.type].label} · ${!linked ? `v${e.version}` : pinned < e.version ? `en la campaña v${pinned} → v${e.version}` : `ya está (v${pinned})`}`,
      };
    });
    const res = await pickDialog({ title: `Añadir a «${pack.name}» desde tu biblioteca`, intro: 'Se añade una copia vinculada: la campaña queda en esta versión hasta que la actualices.', rows, submit: 'Añadir' });
    if (!res) return;
    await run(() => svc.useInCampaign(pack.id, res.picked, { status: res.status }), summarize);
  }

  /** Actualizar copias de campaña a la última versión de la biblioteca. */
  async function updateLinked(pack, campaignEntries) {
    const libItems = svc.localPack().items;
    const todo = campaignEntries.map((e) => ({ e, link: linkState(e, libItems) })).filter((x) => x.link?.state === 'nueva-version');
    if (!todo.length) return;
    const lines = todo.map(({ e, link }) => {
      const lib = libItems.find((i) => i.ref === link.libraryRef);
      const changes = changedFields(e.item, lib.data);
      return `• ${e.item.name}: v${link.pinned} → v${link.latest}${changes.length ? ` (cambia: ${changes.slice(0, 5).join(', ')})` : ''}`;
    });
    const ok = await confirmDialog({
      title: todo.length === 1 ? `Actualizar «${todo[0].e.item.name}»` : `Actualizar ${todo.length} elementos`,
      message: `${lines.join('\n')}\n\nLos personajes que ya lo usan verán el aviso de versión nueva en su ficha.`,
      confirmLabel: 'Actualizar',
    });
    if (!ok) return;
    await run(() => svc.useInCampaign(pack.id, todo.map((x) => x.link.libraryRef)), summarize);
  }

  async function updateAll() {
    const usage = svc.libraryUsage();
    const libItems = svc.localPack().items;
    const todo = [...usage.entries()].map(([ref, uses]) => ({ ref, uses: uses.filter((u) => u.outdated) })).filter((x) => x.uses.length);
    if (!todo.length) return;
    const lines = todo.map(({ ref, uses }) => {
      const lib = libItems.find((i) => i.ref === ref);
      return `• ${lib.data.name} (v${lib.version}): ${uses.map((u) => `${u.campaignName} v${u.pinned}`).join(', ')}`;
    });
    const ok = await confirmDialog({ title: 'Actualizar las campañas', message: `${lines.join('\n')}\n\nCada campaña pasa a la última versión de tu biblioteca.`, confirmLabel: 'Actualizar todas' });
    if (!ok) return;
    await run(async () => {
      const failed = [];
      let n = 0;
      for (const { ref } of todo) { const r = await svc.updateEverywhere(ref); n += r.campaigns; failed.push(...r.failed); }
      return { updated: n - failed.length, failed };
    }, summarize);
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
      case 'import': {
        try {
          const raw = await readJsonFile();
          if (!raw) return undefined;
          const res = svc.importPack(raw);
          const parts = [`${res.added} nuevos`];
          if (res.updated) parts.push(`${res.updated} actualizados`);
          if (res.unchanged) parts.push(`${res.unchanged} ya estaban`);
          if (res.rejected.length) parts.push(`${res.rejected.length} no válidos`);
          toast(`Biblioteca importada: ${parts.join(' · ')}.`, { type: res.rejected.length ? 'warning' : 'success' });
        } catch (err) { toast(userMessageFor(err, 'No se pudo importar el archivo.'), { type: 'error' }); }
        return render();
      }
      case 'export': return downloadJson(svc.exportPack(pack.id), pack.kind === 'local' ? 'biblioteca-homebrew' : `homebrew-${pack.name}`);
      case 'use-in': return entry && useIn(entry);
      case 'from-library': return fromLibrary(pack);
      case 'update-linked': return entry && updateLinked(pack, [entry]);
      case 'update-campaign': return updateLinked(pack, listEntries(null, { selectable: false, packId: pack.id }));
      case 'update-all': return updateAll();
      case 'unlink': {
        if (!entry) return undefined;
        const ok = await confirmDialog({ title: `Desvincular «${entry.item.name}»`, message: 'La campaña conserva su copia tal como está, pero deja de seguir a la biblioteca (no habrá avisos de versión nueva). Puedes volver a vincularlo con «Añadir desde mi biblioteca».', confirmLabel: 'Desvincular' });
        if (ok) await run(() => svc.unlinkCampaignItem(pack.id, entry.ref), 'Desvinculado.');
        return undefined;
      }
      case 'to-library': {
        if (!entry) return undefined;
        return run(() => svc.saveToLibrary(pack.id, entry.ref), (r) => (r?.errors?.length ? r.errors.join(' ') : pack.role === 'dm'
          ? `«${entry.item.name}» está en tu biblioteca y esta campaña quedó vinculada a ella.` : `«${entry.item.name}» copiado a tu biblioteca.`));
      }
      case 'refresh': return run(() => svc.refresh(pack.id), 'Campaña actualizada.');
      case 'edit-details': return pack && pack.role === 'dm' && editDetails(pack);
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
      case 'leave': {
        const ok = await confirmDialog({ title: 'Salir de la campaña', message: pack.role === 'dm' ? 'Se borrará tu clave de DM de este dispositivo. Si no la tienes guardada en otro sitio, no podrás volver a administrar la campaña.' : 'Se borrará tu clave personal de este dispositivo. Para volver necesitarás un enlace nuevo del DM (o tu enlace personal, si lo guardaste).', confirmLabel: 'Salir', danger: true });
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
