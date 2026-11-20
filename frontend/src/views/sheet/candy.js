// Tarjeta «Caramelos» (AgSt 1.35): crear caramelos de atributo, comerlos y
// llevar el drenaje de la enfermedad de las estadísticas. Ver domain/candy.js.

import { html, raw, setHtml } from '../../ui/dom.js';
import { openDialog, toast } from '../../ui/feedback.js';
import { ABILITIES, ABILITY_LABEL } from '../../domain/constants.js';
import { sectionCard } from './common.js';
import {
  createCandy, recoverCeded, eatCandy, endCandy, drainTick, cureDrain, candyName,
} from '../../domain/candy.js';

const candyItems = (c) => (c.equipment.items ?? []).map((it, i) => [it, i]).filter(([it]) => it.candy && it.quantity > 0);

export function hasCandyCard(ctx) {
  const st = ctx.character.candy;
  return ctx.sheet.candyMaker || st?.ceded?.length || st?.active?.length || st?.drain || candyItems(ctx.character).length > 0;
}

export function candyCard(ctx) {
  if (!hasCandyCard(ctx)) return '';
  const c = ctx.character;
  const st = c.candy ?? { ceded: [], active: [], drain: null };
  const ro = ctx.readOnly;
  const limit = ctx.sheet.proficiency;
  const items = candyItems(c);
  const btn = (action, label, attrs = '') => (ro ? '' : html`<button type="button" class="btn btn--ghost btn--sm" data-action="${action}" ${raw(attrs)}>${label}</button>`);
  return sectionCard({
    title: '🍬 Caramelos',
    subtitle: 'Enfermedad de las estadísticas: el creador cede 1 punto de un atributo; quien se come el caramelo gana +1 durante 1 hora. Desde el segundo caramelo en 24 horas, la vida de quien los come se drena.',
    className: 'candy-card',
    body: html`
      ${ctx.sheet.candyMaker ? html`<div class="candy-block">
        <h4 class="candy-block__title">Atributos cedidos <span class="badge">${st.ceded.length} / ${limit}</span></h4>
        ${st.ceded.length ? html`<ul class="candy-list" role="list">${st.ceded.map((x) => html`<li>
          <span>−1 ${ABILITY_LABEL[x.attr]}</span>
          ${btn('candy-recover', 'Recuperar', `data-id="${x.id}" title="El caramelo se comió hace más de 1 hora o se perdió"`)}
        </li>`)}</ul>` : html`<p class="muted">No has cedido ningún punto.</p>`}
        ${ro ? '' : html`<div class="row">
          <label class="visually-hidden" for="candy-attr">Atributo del caramelo</label>
          <select id="candy-attr" class="select" data-candy-attr>${ABILITIES.map((a) => html`<option value="${a.key}">${a.label}</option>`)}</select>
          <button type="button" class="btn btn--primary btn--sm" data-action="candy-create" ${st.ceded.length >= limit ? raw('disabled') : ''}>Crear caramelo</button>
        </div>
        <p class="field__hint">Crearlo lleva 10 minutos. El caramelo aparece en tu inventario y puedes dárselo a otro personaje.</p>`}
      </div>` : ''}
      ${items.length ? html`<div class="candy-block">
        <h4 class="candy-block__title">En tu inventario</h4>
        <ul class="candy-list" role="list">${items.map(([it, i]) => html`<li>
          <span>${it.name} <span class="muted">×${it.quantity}</span></span>
          ${btn('candy-eat', 'Comer', `data-index="${i}"`)}
        </li>`)}</ul>
      </div>` : ''}
      ${st.active.length ? html`<div class="candy-block">
        <h4 class="candy-block__title">Efecto activo (1 hora)</h4>
        <ul class="candy-list" role="list">${st.active.map((x) => html`<li>
          <span>+1 ${ABILITY_LABEL[x.attr]}</span>
          ${btn('candy-end', 'Pasó la hora', `data-id="${x.id}"`)}
        </li>`)}</ul>
      </div>` : ''}
      ${st.drain ? html`<div class="callout callout--danger candy-drain" role="status">
        <p><strong>Drenaje activo:</strong> pierdes ${st.drain.rate} PG máximo${st.drain.rate > 1 ? 's' : ''} cada 10 minutos. Llevas <strong>−${st.drain.amount}</strong>. Nunca baja de 1 PG máximo.</p>
        <p class="muted">Sólo lo detiene la cura de la enfermedad o la magia divina o sagrada (un conjuro de curación de Clérigo o Paladín de nivel 2 o más, como <em>Restablecimiento menor</em>, o un efecto Sagrado). Al detenerlo recuperas lo drenado.</p>
        ${ro ? '' : html`<div class="row">
          ${btn('candy-tick', 'Pasan 10 minutos')}
          ${btn('candy-cure', 'Curar el drenaje')}
        </div>`}
      </div>` : ''}`,
  });
}

function eatDialog(item) {
  const max = Math.max(1, Number(item.quantity) || 1);
  return openDialog({
    title: `Comer: ${item.name}`,
    size: 'sm',
    render(body, close) {
      setHtml(body, html`<form class="stack" data-form>
        <fieldset class="choice-group"><legend>¿Cómo?</legend>
          <label class="row"><input type="radio" name="mode" value="primero" checked> Es el primero en 24 horas (sin drenaje)</label>
          <label class="row"><input type="radio" name="mode" value="otro"> Ya comí otro en las últimas 24 horas (drena 1 PG máx. cada 10 min)</label>
          ${max >= 2 ? html`<label class="row"><input type="radio" name="mode" value="golpe"> Dos o más de golpe (drena 3 cada 10 min)</label>
          <label class="field"><span class="field__label">Cuántos de golpe</span><input class="input input--num" type="number" name="count" min="2" max="${max}" value="2"></label>` : ''}
        </fieldset>
        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button>
          <button type="submit" class="btn btn--primary">Comer</button>
        </div>
      </form>`);
      body.querySelector('form').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const mode = f.get('mode');
        close(mode === 'golpe' ? { count: Math.min(max, Math.max(2, Number(f.get('count')) || 2)) } : { count: 1, earlierToday: mode === 'otro' });
      });
    },
  });
}

const apply = (ed, res, message) => {
  if (res.error) return toast(res.error, { type: 'warning' });
  if (res.event) ed.events?.push?.(res.event);
  return ed.replace(res.character, { keepScroll: true, message });
};

export const candyActions = {
  'candy-create': (ed) => {
    const attr = document.querySelector('[data-candy-attr]')?.value;
    apply(ed, createCandy(ed.character, attr, { limit: ed.sheet.proficiency }), `${candyName(attr)} creado: está en tu inventario.`);
  },
  'candy-recover': (ed, el) => apply(ed, recoverCeded(ed.character, el.dataset.id), 'Has recuperado el punto cedido.'),
  'candy-eat': async (ed, el) => {
    const index = Number(el.dataset.index);
    const item = ed.character.equipment.items[index];
    if (!item?.candy) return;
    const opts = await eatDialog(item);
    if (!opts) return;
    const res = eatCandy(ed.character, index, opts);
    apply(ed, res, res.drainRate ? `+1 ${ABILITY_LABEL[item.candy]} durante 1 hora. Drenaje activo: ${res.drainRate} PG máx. cada 10 minutos.` : `+1 ${ABILITY_LABEL[item.candy]} durante 1 hora.`);
  },
  'candy-end': (ed, el) => apply(ed, endCandy(ed.character, el.dataset.id), 'El efecto del caramelo terminó.'),
  'candy-tick': (ed) => apply(ed, drainTick(ed.character)),
  'candy-cure': (ed) => apply(ed, cureDrain(ed.character), 'Drenaje detenido: recuperas los PG máximos drenados.'),
};
