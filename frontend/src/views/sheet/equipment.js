// Pestaña «Equipo»: armas, armadura, monedas, inventario y tesoros.

import { html, raw } from '../../ui/dom.js';
import { COINS } from '../../domain/constants.js';
import { createItem, createWeapon } from '../../domain/schema.js';
import { sectionCard, actionButton, bindAttrs, textArea, numberField, textField } from './common.js';
import { CURRENCIES, coinValues, convertCoins, currencyOf, formatBag, formatCp } from '../../domain/money.js';
import { confirmDialog, toast } from '../../ui/feedback.js';
import { ATTUNE_LIMIT, INVENTORY_FILTERS, inventoryTotals, toggleItemFlag, useItem } from '../../domain/inventory.js';

function weaponsTable(ctx) {
  const weapons = ctx.character.equipment.weapons;
  return sectionCard({
    title: 'Armas y ataques',
    actions: actionButton(ctx, { action: 'add-weapon', label: '＋ Añadir arma', variant: 'btn--ghost btn--sm' }),
    body: html`${weapons.length ? html`<div class="table-wrap"><table class="table table--edit">
        <thead><tr><th>Arma</th><th class="num">Bonif. ataque</th><th>Daño / tipo</th><th><span class="visually-hidden">Acciones</span></th></tr></thead>
        <tbody>${weapons.map((w, i) => html`<tr>
          <td data-label="Arma"><input class="input" type="text" maxlength="120" value="${w.name}" placeholder="Espada larga" aria-label="Nombre del arma ${i + 1}" ${bindAttrs(`equipment.weapons.${i}.name`, 'text', ctx.readOnly)}></td>
          <td data-label="Bonif." class="num"><input class="input input--num" type="text" maxlength="20" value="${w.attackBonus}" placeholder="+5" aria-label="Bonificador de ataque ${i + 1}" ${bindAttrs(`equipment.weapons.${i}.attackBonus`, 'text', ctx.readOnly)}></td>
          <td data-label="Daño"><input class="input" type="text" maxlength="120" value="${w.damage}" placeholder="1d8+3 cortante" aria-label="Daño del arma ${i + 1}" ${bindAttrs(`equipment.weapons.${i}.damage`, 'text', ctx.readOnly)}></td>
          <td class="num">${ctx.readOnly ? '' : html`<button type="button" class="icon-btn icon-btn--danger" data-action="remove-weapon" data-index="${i}" aria-label="Quitar arma ${w.name || i + 1}">×</button>`}</td>
        </tr>`)}</tbody>
      </table></div>` : html`<p class="muted">Sin armas.</p>`}
      ${textArea(ctx, { label: 'Otros ataques, conjuros de combate y notas', path: 'equipment.attacksNotes', rows: 5 })}`,
  });
}

function armorAndCoins(ctx) {
  return html`<div class="grid-2">
    ${sectionCard({
      title: 'Armadura',
      body: html`<div class="form-grid">
        ${textField(ctx, { label: 'Armadura / escudo', path: 'combat.armor', placeholder: 'Cota de mallas + escudo' })}
        ${numberField(ctx, { label: 'Clase de armadura (CA)', path: 'combat.armorClass', min: 0, max: 99 })}
      </div>`,
    })}
    ${coinsCard(ctx)}
  </div>`;
}

/** Monedas con su sistema (D&D o Lord 100) y el total; se pueden pasar al otro sistema sin perder valor. */
function coinsCard(ctx) {
  const bag = ctx.character.equipment.coins;
  const system = currencyOf(bag);
  const other = system === 'dnd' ? 'lord100' : 'dnd';
  const v = coinValues(system);
  return sectionCard({
    title: 'Monedas',
    subtitle: `${CURRENCIES[system].label} · 10 pc = 1 pp · ${v.gp / v.sp} pp = 1 po · ${v.pp / v.gp} po = 1 ppt`,
    actions: html`${ctx.canGive ? actionButton(ctx, { action: 'give-coins', label: '🤝 Dar', variant: 'btn--ghost btn--sm', title: 'Dar monedas a otro PJ de la campaña' }) : ''}${actionButton(ctx, { action: 'convert-coins', label: `Pasar a ${CURRENCIES[other].label}`, variant: 'btn--ghost btn--sm' })}`,
    body: html`<div class="coins">${COINS.map((coin) => numberField(ctx, { label: coin.label, path: `equipment.coins.${coin.key}`, min: 0, max: 99999999, hint: coin.title }))}</div>`,
  });
}

const FLAG_META = {
  equipped: { on: '⚔ Equipado', off: '⚔ Equipar', title: 'Lo llevas puesto o en la mano' },
  attuned: { on: '✨ Sintonizado', off: '✨ Sintonizar', title: `Sintonía con un objeto mágico (máximo ${ATTUNE_LIMIT})` },
  consumable: { on: '🧪 Consumible', off: '🧪 Consumible', title: 'Se gasta al usarlo' },
};

function flagButton(ctx, it, i, flag) {
  const meta = FLAG_META[flag];
  const on = Boolean(it[flag]);
  if (ctx.readOnly) return on ? html`<span class="badge badge--accent">${meta.on}</span>` : '';
  return html`<button type="button" class="chip-btn ${on ? 'is-on' : ''}" data-action="item-flag" data-flag="${flag}" data-index="${i}" aria-pressed="${on}" title="${meta.title}">${on ? meta.on : meta.off}</button>`;
}

/** Inventario en tarjetas (cómodo en móvil): equipar, sintonizar, usar, dar y carga. */
function itemsList(ctx) {
  const items = ctx.character.equipment.items;
  const totals = inventoryTotals(ctx.character);
  const filter = INVENTORY_FILTERS[ctx.ui.invFilter] ? ctx.ui.invFilter : 'todo';
  const shown = items.map((it, i) => [it, i]).filter(([it]) => INVENTORY_FILTERS[filter].test(it));
  const loadLabel = { normal: '', pesada: ' · carga pesada', excedida: ' · ⚠ sobrecargado' }[totals.load];
  return sectionCard({
    title: 'Inventario',
    className: 'inventory',
    subtitle: [
      items.length ? `${items.length} objeto(s)` : '',
      `⚖ ${totals.weight} / ${totals.capacity} lb${loadLabel}`,
      `✨ ${totals.attuned}/${ATTUNE_LIMIT} sintonizados`,
    ].filter(Boolean).join(' · '),
    actions: html`<span class="row">${!ctx.readOnly && ctx.recordId ? html`<a class="btn btn--primary btn--sm" href="/tienda/${ctx.recordId}" data-link>🛒 Tienda</a>` : ''}${actionButton(ctx, { action: 'add-item', label: '＋ Añadir objeto', variant: 'btn--ghost btn--sm' })}</span>`,
    body: html`
      ${items.length ? html`<div class="inv-filters" role="group" aria-label="Filtrar inventario">${Object.entries(INVENTORY_FILTERS).map(([k, f]) => html`<button type="button" class="chip-btn ${filter === k ? 'is-on' : ''}" data-action="inv-filter" data-filter="${k}" aria-pressed="${filter === k}">${f.label}</button>`)}</div>` : ''}
      ${shown.length ? html`<ul class="inv-list" role="list">${shown.map(([it, i]) => html`<li class="inv-item ${it.equipped ? 'is-equipped' : ''} ${it.attuned ? 'is-attuned' : ''}">
        <div class="inv-item__main">
          <label class="visually-hidden" for="inv-n-${i}">Objeto ${i + 1}</label>
          <input id="inv-n-${i}" class="input inv-item__name" type="text" maxlength="120" value="${it.name}" placeholder="Cuerda de cáñamo" ${bindAttrs(`equipment.items.${i}.name`, 'text', ctx.readOnly)}>
          <label class="inv-item__qty"><span class="visually-hidden">Cantidad</span><span aria-hidden="true">×</span>
            <input class="input input--num" type="number" inputmode="numeric" min="0" max="99999" value="${it.quantity}" aria-label="Cantidad de ${it.name || `objeto ${i + 1}`}" ${bindAttrs(`equipment.items.${i}.quantity`, 'int', ctx.readOnly)} data-min="0" data-max="99999"></label>
        </div>
        <div class="inv-item__meta">
          <input class="input input--sm" type="text" maxlength="2000" value="${it.notes}" placeholder="Notas" aria-label="Notas de ${it.name || `objeto ${i + 1}`}" ${bindAttrs(`equipment.items.${i}.notes`, 'text', ctx.readOnly)}>
          <label class="inv-item__weight" title="Peso por unidad (libras)"><input class="input input--sm input--num" type="text" inputmode="decimal" maxlength="7" value="${it.weight ?? ''}" placeholder="—" aria-label="Peso por unidad de ${it.name || `objeto ${i + 1}`} (lb)" ${bindAttrs(`equipment.items.${i}.weight`, 'optnum', ctx.readOnly)} data-min="0" data-max="9999"><span>lb</span></label>
        </div>
        <div class="inv-item__actions">
          ${flagButton(ctx, it, i, 'equipped')}${flagButton(ctx, it, i, 'attuned')}${flagButton(ctx, it, i, 'consumable')}
          ${ctx.readOnly ? '' : html`<span class="inv-item__spacer"></span>
            ${it.consumable ? html`<button type="button" class="btn btn--ghost btn--sm" data-action="use-item" data-index="${i}" ${it.quantity > 0 ? '' : raw('disabled')}>Usar</button>` : ''}
            ${ctx.canGive ? html`<button type="button" class="btn btn--ghost btn--sm" data-action="give-item" data-index="${i}" ${it.quantity > 0 && it.name.trim() ? '' : raw('disabled')}>🤝 Dar</button>` : ''}
            <button type="button" class="icon-btn icon-btn--danger" data-action="remove-item" data-index="${i}" aria-label="Quitar ${it.name || `objeto ${i + 1}`}">×</button>`}
        </div>
      </li>`)}</ul>`
        : html`<p class="muted">${items.length ? 'Nada con este filtro.' : 'El inventario está vacío.'}</p>`}
      ${totals.unknown ? html`<p class="field__hint">${totals.unknown} objeto(s) sin peso: escríbelo (lb por unidad) para calcular bien la carga. Lo comprado en la Tienda ya lo trae.</p>` : ''}`,
  });
}

export function renderEquipment(ctx) {
  return html`<div class="stack">
    ${weaponsTable(ctx)}
    ${armorAndCoins(ctx)}
    ${itemsList(ctx)}
    ${sectionCard({ title: 'Tesoros', body: textArea(ctx, { label: 'Tesoros', path: 'equipment.treasure', rows: 6, hideLabel: true, placeholder: 'Gemas, objetos mágicos, recompensas…' }) })}
  </div>`;
}

export const equipmentActions = {
  'add-weapon': (ed) => ed.update((c) => { c.equipment.weapons.push(createWeapon()); }, { structural: true, focusLast: '[data-bind$=".name"][data-bind^="equipment.weapons"]' }),
  'remove-weapon': (ed, el) => ed.update((c) => { c.equipment.weapons.splice(Number(el.dataset.index), 1); }, { structural: true }),
  'add-item': (ed) => ed.update((c) => { c.equipment.items.push(createItem()); }, { structural: true, focusLast: '[data-bind$=".name"][data-bind^="equipment.items"]' }),
  'remove-item': (ed, el) => ed.update((c) => { c.equipment.items.splice(Number(el.dataset.index), 1); }, { structural: true }),
  'item-flag': (ed, el) => {
    const res = toggleItemFlag(ed.character, Number(el.dataset.index), el.dataset.flag);
    if (res.error) return toast(res.error, { type: 'warning' });
    return ed.replace(res.character);
  },
  'use-item': (ed, el) => {
    const res = useItem(ed.character, Number(el.dataset.index));
    if (res.error) return toast(res.error, { type: 'warning' });
    ed.events.push(res.event);
    return ed.replace(res.character, { message: `${res.event.text} ${res.left ? `Te quedan ${res.left}.` : 'Era el último.'}` });
  },
  'inv-filter': (ed, el) => { ed.ui.invFilter = el.dataset.filter; ed.rerender({ keepScroll: true }); },
  'give-item': (ed, el) => ed.inventory?.giveItem(Number(el.dataset.index)),
  'give-coins': (ed) => ed.inventory?.giveCoins(),
  // Cambia el sistema de las monedas mostrando antes cómo quedan (mismo valor total).
  'convert-coins': async (ed) => {
    const bag = ed.character.equipment.coins;
    const to = currencyOf(bag) === 'dnd' ? 'lord100' : 'dnd';
    const res = convertCoins(bag, to);
    const ok = await confirmDialog({
      title: `Pasar a ${CURRENCIES[to].label}`,
      message: `Tus monedas quedarían así: ${formatBag(bag)} → ${formatBag(res.coins)}. El valor total es el mismo (${formatCp(res.total, { system: to })}). Normalmente lo hace la Tienda al entrar en una campaña con otro sistema.`,
      confirmLabel: 'Convertir',
    });
    if (ok) ed.update((c) => { c.equipment.coins = convertCoins(c.equipment.coins, to).coins; }, { structural: true });
  },
};
