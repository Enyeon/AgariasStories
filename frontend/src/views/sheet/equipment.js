// Pestaña «Equipo»: armas, armadura, monedas, inventario y tesoros.

import { html } from '../../ui/dom.js';
import { COINS } from '../../domain/constants.js';
import { createItem, createWeapon } from '../../domain/schema.js';
import { sectionCard, actionButton, bindAttrs, textArea, numberField, textField } from './common.js';
import { CURRENCIES, coinValues, convertCoins, currencyOf, formatBag, formatCp } from '../../domain/money.js';
import { confirmDialog } from '../../ui/feedback.js';

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
    actions: actionButton(ctx, { action: 'convert-coins', label: `Pasar a ${CURRENCIES[other].label}`, variant: 'btn--ghost btn--sm' }),
    body: html`<div class="coins">${COINS.map((coin) => numberField(ctx, { label: coin.label, path: `equipment.coins.${coin.key}`, min: 0, max: 99999999, hint: coin.title }))}</div>`,
  });
}

function itemsList(ctx) {
  const items = ctx.character.equipment.items;
  return sectionCard({
    title: 'Inventario',
    subtitle: [items.length ? `${items.length} objeto(s)` : '', !ctx.readOnly && ctx.recordId ? 'Lo que compres en la Tienda aparece aquí.' : ''].filter(Boolean).join(' · '),
    actions: html`<span class="row">${!ctx.readOnly && ctx.recordId ? html`<a class="btn btn--primary btn--sm" href="/tienda/${ctx.recordId}" data-link>🛒 Ir a la Tienda</a>` : ''}${actionButton(ctx, { action: 'add-item', label: '＋ Añadir objeto', variant: 'btn--ghost btn--sm' })}</span>`,
    body: items.length ? html`<div class="table-wrap"><table class="table table--edit">
        <thead><tr><th>Objeto</th><th class="num">Cant.</th><th>Notas</th><th><span class="visually-hidden">Acciones</span></th></tr></thead>
        <tbody>${items.map((it, i) => html`<tr>
          <td data-label="Objeto"><input class="input" type="text" maxlength="120" value="${it.name}" placeholder="Cuerda de cáñamo" aria-label="Objeto ${i + 1}" ${bindAttrs(`equipment.items.${i}.name`, 'text', ctx.readOnly)}></td>
          <td data-label="Cant." class="num"><input class="input input--num" type="number" min="0" max="99999" value="${it.quantity}" aria-label="Cantidad del objeto ${i + 1}" ${bindAttrs(`equipment.items.${i}.quantity`, 'int', ctx.readOnly)} data-min="0" data-max="99999"></td>
          <td data-label="Notas"><input class="input" type="text" maxlength="2000" value="${it.notes}" placeholder="15 m" aria-label="Notas del objeto ${i + 1}" ${bindAttrs(`equipment.items.${i}.notes`, 'text', ctx.readOnly)}></td>
          <td class="num">${ctx.readOnly ? '' : html`<button type="button" class="icon-btn icon-btn--danger" data-action="remove-item" data-index="${i}" aria-label="Quitar ${it.name || `objeto ${i + 1}`}">×</button>`}</td>
        </tr>`)}</tbody>
      </table></div>` : html`<p class="muted">El inventario está vacío.</p>`,
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
