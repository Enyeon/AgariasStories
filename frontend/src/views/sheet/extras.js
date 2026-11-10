// Pestañas condicionales: «Criaturas de Sangre» y «DM».

import { html, raw, richText } from '../../ui/dom.js';
import { data, getEpicBoon } from '../../data/index.js';
import { ABILITY_LABEL, MAX_LEVEL } from '../../domain/constants.js';
import { featAbilityOptions } from '../../domain/rules.js';
import { addEpicBoon, canAddEpicBoon, removeEpicBoon } from '../../domain/progression.js';
import { sectionCard, out } from './common.js';
import { toast, confirmDialog, openDialog } from '../../ui/feedback.js';
import { contentStatus } from '../../content/snapshots.js';
import { getPack } from '../../content/registry.js';
import { CONTENT_TYPES } from '../../content/schema.js';

export function renderBloodCreatures(ctx) {
  const hp = ctx.sheet.hp.max;
  return html`<div class="stack">
    <div class="callout"><p>La <strong>Orden del Invocador de Sangre</strong> usa la Sangre Arcana para materializar criaturas. Su vida se calcula a partir de tus PG máximos (${out('hpMax', hp)}).</p></div>
    <div class="creature-grid">
      ${Object.entries(data.bloodCreatures).map(([id, c]) => html`<article class="card creature">
        <header class="creature__header"><h3>${c.name}</h3><span class="badge badge--danger" title="${c.hpPercent}% de tus PG máximos">❤ ${out(`creatureHp.${c.hpPercent}`, Math.floor((hp * c.hpPercent) / 100))} PG</span></header>
        <dl class="creature__stats">
          <div><dt>Daño</dt><dd>${c.damage}</dd></div>
          <div><dt>Ataque${c.attackName ? `: ${c.attackName}` : ''}</dt><dd>${c.attack}</dd></div>
          <div><dt>Amplificación</dt><dd>${c.amplification}</dd></div>
          ${c.quirk && c.quirk !== '——' ? html`<div><dt>Peculiaridad</dt><dd>${c.quirk}</dd></div>` : ''}
          ${c.requirement && c.requirement !== '——' ? html`<div><dt>Requisito</dt><dd>${c.requirement}</dd></div>` : ''}
        </dl>
        <span class="visually-hidden">${id}</span>
      </article>`)}
    </div>
  </div>`;
}

function boonsSection(ctx) {
  const c = ctx.character;
  const gate = canAddEpicBoon(c);
  return sectionCard({
    title: 'Bendiciones épicas',
    subtitle: `Disponibles a nivel ${MAX_LEVEL} con permiso del DM. Elevan el máximo de atributos a 30.`,
    actions: ctx.readOnly ? '' : html`<button type="button" class="btn btn--gold" data-action="add-boon" ${gate.ok ? '' : raw('disabled')} title="${gate.reason}">＋ Añadir bendición</button>`,
    body: html`${c.epicBoons.length ? html`<ul class="boon-list" role="list">${c.epicBoons.map((b, i) => html`<li class="boon">
        <span><strong>${b.name}</strong>${b.ability ? html` · ${ABILITY_LABEL[b.ability]} +1` : ''}</span>
        ${ctx.readOnly ? '' : html`<button type="button" class="icon-btn icon-btn--danger" data-action="remove-boon" data-index="${i}" aria-label="Quitar ${b.name}">×</button>`}
      </li>`)}</ul>` : html`<p class="muted">${gate.ok ? 'Aún no hay bendiciones.' : gate.reason}</p>`}`,
  });
}

const STATE_TEXT = {
  ok: null,
  actualizado: 'El DM publicó una versión nueva; la ficha ya la usa.',
  oculto: 'El DM lo ocultó: ya no se ofrece a nadie más, pero tu personaje lo conserva.',
  retirado: 'El DM lo retiró de la campaña; tu personaje lo conserva tal como estaba.',
  instantanea: 'No está disponible en este dispositivo: se usa la copia guardada en la ficha.',
  desconocido: 'No se encuentra ni en la campaña ni en la copia guardada.',
};

function campaignCard(ctx) {
  const c = ctx.character;
  const perms = ctx.permissions;
  const memberships = ctx.campaigns ?? [];
  if (c.campaign) {
    return sectionCard({
      title: `Campaña: ${c.campaign.name || c.campaign.id}`,
      subtitle: perms.campaign
        ? `Tu papel: ${perms.role === 'dm' ? 'DM' : 'jugador'}. Las reglas de la campaña deciden qué contenido puedes elegir.`
        : 'No perteneces a esta campaña en este dispositivo: se usan las copias guardadas en la ficha y no se aplican sus reglas.',
      actions: ctx.readOnly ? '' : html`<button type="button" class="btn btn--ghost btn--sm" data-action="campaign-unlink">Desvincular</button>`,
      body: perms.rules ? html`<ul class="summary-list">
        <li><span>Bendiciones épicas</span><strong>${perms.epicBoons ? 'Permitidas' : 'No permitidas'}</strong></li>
        <li><span>Rasgos con efectos</span><strong>${perms.traitEffects ? 'Los puedes añadir tú' : 'Sólo los asigna el DM'}</strong></li>
        ${['clase', 'raza', 'trasfondo', 'dote'].map((t) => html`<li><span>${{ clase: 'Clases', raza: 'Razas', trasfondo: 'Trasfondos', dote: 'Dotes' }[t]} oficiales</span><strong>${perms.official[t] ? 'Permitidas' : 'No permitidas'}</strong></li>`)}
      </ul>` : '',
    });
  }
  return sectionCard({
    title: 'Campaña',
    subtitle: 'Vincula el personaje a una campaña para usar su Homebrew y sus reglas.',
    body: ctx.readOnly ? html`<p class="muted">Sin campaña.</p>` : memberships.length ? html`<div class="row">
        <label class="visually-hidden" for="campaign-select">Campaña</label>
        <select id="campaign-select" class="select" data-campaign-select>${memberships.map((m) => html`<option value="${m.id}">${m.name} (${m.role === 'dm' ? 'DM' : 'jugador'})</option>`)}</select>
        <button type="button" class="btn btn--primary" data-action="campaign-link">Vincular</button>
      </div>` : html`<p class="muted">No perteneces a ninguna campaña. Crea una o únete con el enlace de tu DM en <a href="/homebrew" data-link>Homebrew</a>.</p>`,
  });
}

function contentCard(ctx) {
  const items = contentStatus(ctx.character);
  if (!items.length) return '';
  return sectionCard({
    title: 'Contenido Homebrew que usa este personaje',
    body: html`<ul class="summary-list">${items.map((i) => html`<li>
      <span>${i.name} <small class="muted">${CONTENT_TYPES[i.type]?.label ?? ''}${i.pack ? ` · ${i.pack}` : ''}</small></span>
      <strong>${STATE_TEXT[i.state] ? html`<span class="badge ${i.state === 'retirado' || i.state === 'desconocido' ? 'badge--danger' : 'badge--warning'}" title="${STATE_TEXT[i.state]}">${{ actualizado: 'Actualizado', oculto: 'Oculto', retirado: 'Retirado', instantanea: 'Copia guardada', desconocido: 'No disponible' }[i.state]}</span>` : html`<span class="badge badge--success">Al día</span>`}</strong>
    </li>`)}</ul>`,
  });
}

export function renderDm(ctx) {
  const c = ctx.character;
  const perms = ctx.permissions;
  return html`<div class="stack">
    ${campaignCard(ctx)}
    ${c.campaign ? '' : sectionCard({
      title: 'Permisos del DM',
      subtitle: 'Sin campaña vinculada, este permiso lo marcas tú según lo que acuerdes con tu DM.',
      body: html`<label class="check check--lg">
          <input type="checkbox" ${raw(`data-bind="settings.allowEpicBoons" data-type="bool"${ctx.readOnly ? ' disabled' : ''}`)} ${c.settings.allowEpicBoons ? raw('checked') : ''}>
          <span><strong>Mi DM permite bendiciones épicas</strong><br><small>Habilita las bendiciones de nivel 20 y puntuaciones de atributo de hasta 30.</small></span>
        </label>`,
    })}
    ${contentCard(ctx)}
    ${perms.epicBoons ? boonsSection(ctx) : ''}
  </div>`;
}

function openBoonPicker(character) {
  return openDialog({
    title: 'Bendición épica',
    size: 'lg',
    render(body, close) {
      let selected = null;
      let ability = null;
      const render = () => {
        const def = getEpicBoon(selected);
        const options = featAbilityOptions(def);
        body.innerHTML = html`<div class="stack">
          <div class="chips">${Object.keys(data.epicBoons).map((n) => html`<label class="chip"><input type="radio" name="boon" value="${n}" ${n === selected ? raw('checked') : ''}>${n}</label>`)}</div>
          ${def ? html`${options.length ? html`<fieldset class="choice-group"><legend>Atributo (+1)</legend><div class="chips">${options.map((k) => html`<label class="chip"><input type="radio" name="boon-ability" value="${k}" ${k === ability ? raw('checked') : ''}>${ABILITY_LABEL[k]}</label>`)}</div></fieldset>` : ''}
            <div class="rich">${richText(def.habilidad)}</div>` : html`<p class="muted">Elige una bendición.</p>`}
          <div class="dialog__footer"><button class="btn btn--ghost" data-dialog-close>Cancelar</button><button class="btn btn--gold" data-ok ${def ? '' : raw('disabled')}>Añadir</button></div>
        </div>`.value;
      };
      body.addEventListener('change', (e) => {
        if (e.target.name === 'boon') { selected = e.target.value; ability = null; render(); }
        if (e.target.name === 'boon-ability') ability = e.target.value;
      });
      body.addEventListener('click', (e) => {
        if (e.target.closest('[data-ok]')) close({ name: selected, ability });
      });
      render();
    },
  });
}

export const extrasActions = {
  'campaign-link': (ed) => {
    const id = ed.root.querySelector('[data-campaign-select]')?.value;
    const pack = id ? getPack(id) : null;
    if (!pack) return;
    ed.update((c) => { c.campaign = { id: pack.id, name: pack.name }; }, { keepScroll: true });
    toast(`Vinculado a «${pack.name}».`, { type: 'success' });
  },
  async 'campaign-unlink'(ed) {
    const ok = await confirmDialog({ title: 'Desvincular de la campaña', message: 'El personaje conserva el contenido que ya usa (como copia), pero dejarán de aplicarse las reglas de la campaña.', confirmLabel: 'Desvincular' });
    if (ok) ed.update((c) => { c.campaign = null; }, { keepScroll: true });
  },
  async 'add-boon'(ed) {
    const choice = await openBoonPicker(ed.character);
    if (!choice) return;
    const res = addEpicBoon(ed.character, choice);
    if (res.errors.length) return toast(res.errors.join(' '), { type: 'error' });
    ed.replace(res.character, { message: `Bendición añadida: ${choice.name}` });
  },
  async 'remove-boon'(ed, el) {
    const ok = await confirmDialog({ title: 'Quitar bendición', message: 'Se quitará la bendición y su aumento de atributo.', confirmLabel: 'Quitar', danger: true });
    if (ok) ed.replace(removeEpicBoon(ed.character, Number(el.dataset.index)));
  },
};
