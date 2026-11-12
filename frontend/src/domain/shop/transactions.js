// Compras y ventas de la Tienda.
//
// Recalculan el precio con el mismo modelo que la interfaz (o el trato
// negociado vigente) y validan stock, monedas y caja. Devuelven el mundo del
// mercado y el PERSONAJE nuevos: el dinero sale de `equipment.coins` y el
// objeto entra en el inventario de la ficha. Quien llama guarda ambos.

import { pay, receiveCoins, coinsInCp, formatCp } from '../money.js';
import { quoteBuy, quoteSell } from './pricing.js';
import { cloneWorld, haggleKey, pushLedger } from './state.js';
import { shopClosure } from './simulation.js';
import { grantItem, takeItem, ownedUnits } from './inventory.js';

/** Desglose del total: unidades al precio del trato + resto a precio de lista. */
export function priceBreakdown(quote, qty) {
  const dealQty = quote.deal ? Math.min(qty, quote.deal.qty) : 0;
  const dealUnit = quote.deal?.unit ?? 0;
  const restQty = qty - dealQty;
  return { dealQty, dealUnit, restQty, listUnit: quote.listUnit, total: dealQty * dealUnit + restQty * quote.listUnit };
}

function ledgerEntry(world, { charId, charName, shopId, item, side, qty, breakdown }) {
  return {
    id: `${world.day}-${world.ledger.length}-${Math.random().toString(36).slice(2, 8)}`,
    day: world.day,
    at: new Date().toISOString(),
    charId,
    charName: charName ?? '',
    shopId,
    itemId: item.id,
    name: item.name,
    side,
    qty,
    total: breakdown.total,
    negotiated: breakdown.dealQty > 0,
    saved: breakdown.dealQty ? Math.abs(breakdown.listUnit - breakdown.dealUnit) * breakdown.dealQty : 0,
  };
}

function check(world, ctx, { shopId, qty, character }) {
  const amount = Math.trunc(Number(qty));
  if (!Number.isInteger(amount) || amount < 1) return { error: 'Cantidad inválida.' };
  if (!character) return { error: 'Elige un personaje.' };
  const closure = shopClosure(world, ctx, shopId);
  if (closure) return { error: `${closure.name}: la tienda está cerrada hoy.` };
  return { amount };
}

export function buy(world, ctx, { charId = null, charName, shopId, itemId, qty = 1, character }) {
  const ok = check(world, ctx, { shopId, qty, character });
  if (ok.error) return ok;
  const quote = quoteBuy(world, ctx, { shopId, itemId, charId });
  if (!quote) return { error: 'Este objeto no se vende aquí.' };
  if (quote.available < ok.amount) return { error: quote.available ? `Solo quedan ${quote.available}.` : 'Está agotado.' };

  const breakdown = priceBreakdown(quote, ok.amount);
  const payment = pay(character.equipment.coins, breakdown.total);
  if (!payment.ok) return { error: `No te alcanza: faltan ${formatCp(breakdown.total - coinsInCp(character.equipment.coins))}.`, reason: 'funds' };

  const item = ctx.item(itemId);
  let next = structuredClone(character);
  next.equipment.coins = payment.coins;
  next = grantItem(next, item, ok.amount);

  const w = cloneWorld(world);
  const shop = w.shops[shopId];
  if (!shop.stock[itemId].unlimited) shop.stock[itemId].qty -= ok.amount;
  shop.cash = (shop.cash ?? 0) + breakdown.total;
  if (breakdown.dealQty) w.deals[haggleKey(charId, shopId, itemId, 'buy')].qty -= breakdown.dealQty;
  const ledger = ledgerEntry(w, { charId, charName, shopId, item, side: 'buy', qty: ok.amount, breakdown });
  pushLedger(w, ledger);
  return { world: w, character: next, ledger };
}

export function sell(world, ctx, { charId = null, charName, shopId, itemId, qty = 1, character }) {
  const ok = check(world, ctx, { shopId, qty, character });
  if (ok.error) return ok;
  const item = ctx.item(itemId);
  if (!item) return { error: 'La tienda no conoce ese objeto.' };
  if (ownedUnits(character, item) < ok.amount) return { error: item.bundle ? `Necesitas lotes completos de ${item.bundle}.` : 'No tienes tantas unidades.' };
  const quote = quoteSell(world, ctx, { shopId, itemId, charId });
  if (!quote.unit) return { error: 'No le interesa comprar eso.' };
  const breakdown = priceBreakdown(quote, ok.amount);
  if ((world.shops[shopId]?.cash ?? 0) < breakdown.total) {
    return { error: `Hoy no tiene tanto en caja (tiene ${formatCp(world.shops[shopId].cash)}).`, reason: 'cash' };
  }

  const taken = takeItem(character, item, ok.amount);
  if (taken.error) return taken;
  const next = taken.character;
  next.equipment.coins = receiveCoins(next.equipment.coins, breakdown.total);

  const w = cloneWorld(world);
  const shop = w.shops[shopId];
  const entry = shop.stock[itemId];
  if (entry) {
    if (!entry.unlimited) entry.qty += ok.amount;
  } else {
    shop.stock[itemId] = { qty: ok.amount, target: 0, consigned: true, incoming: null, since: w.day };
  }
  shop.cash -= breakdown.total;
  if (breakdown.dealQty) w.deals[haggleKey(charId, shopId, itemId, 'sell')].qty -= breakdown.dealQty;
  const ledger = ledgerEntry(w, { charId, charName, shopId, item, side: 'sell', qty: ok.amount, breakdown });
  pushLedger(w, ledger);
  return { world: w, character: next, ledger };
}
