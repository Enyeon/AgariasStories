// Pestañas condicionales: «Criaturas de Sangre» y «DM».

import { html, raw, richText } from '../../ui/dom.js';
import { data, getEpicBoon } from '../../data/index.js';
import { ABILITY_LABEL, MAX_LEVEL } from '../../domain/constants.js';
import { featAbilityOptions } from '../../domain/rules.js';
import { addEpicBoon, canAddEpicBoon, removeEpicBoon } from '../../domain/progression.js';
import { sectionCard, out } from './common.js';
import { toast, confirmDialog, openDialog } from '../../ui/feedback.js';

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

export function renderDm(ctx) {
  const c = ctx.character;
  return html`<div class="stack">
    ${sectionCard({
      title: 'Permisos del DM',
      body: html`<label class="check check--lg">
          <input type="checkbox" ${raw(`data-bind="settings.allowEpicBoons" data-type="bool"${ctx.readOnly ? ' disabled' : ''}`)} ${c.settings.allowEpicBoons ? raw('checked') : ''}>
          <span><strong>Mi DM permite bendiciones épicas</strong><br><small>Habilita las bendiciones de nivel 20 y puntuaciones de atributo de hasta 30.</small></span>
        </label>`,
    })}
    ${c.settings.allowEpicBoons ? boonsSection(ctx) : ''}
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
