// Auditoría del dinero: en cada operación de la Tienda, lo que sale de la bolsa
// del jugador entra en la caja de la tienda (o en el depósito del Gremio / el
// banco) y viceversa. Nada se pierde ni se crea. En los dos sistemas monetarios.
import { describe, it, expect } from 'vitest';
import { buildShopContext } from '../src/services/shop.js';
import { createWorld } from '../src/domain/shop/simulation.js';
import { coinsInCp, convertCoins } from '../src/domain/money.js';
import { createCharacter } from '../src/domain/schema.js';
import { buy, sell } from '../src/domain/shop/transactions.js';
import { quoteBuy } from '../src/domain/shop/pricing.js';
import * as talk from '../src/domain/shop/talk.js';
import * as hiring from '../src/domain/shop/hiring.js';
import * as lodging from '../src/domain/shop/lodging.js';
import * as services from '../src/domain/shop/services.js';
import * as bank from '../src/domain/shop/bank.js';
import * as guild from '../src/domain/shop/guild.js';
import * as floors from '../src/domain/shop/floors.js';
import { changeReputation } from '../src/domain/shop/state.js';

const agarias = buildShopContext({ world: 'agarias' });
const tower = buildShopContext({ world: 'lord100' });

function hero(system, gp = 500) {
  const c = createCharacter();
  c.identity.name = 'Aria';
  c.equipment.coins.gp = gp;
  if (system === 'lord100') c.equipment.coins = convertCoins(c.equipment.coins, 'lord100').coins;
  return c;
}

/** Todo el dinero en juego: bolsa + cajas de las tiendas + depósitos del Gremio + banco. */
function wealth(world, character) {
  const cash = Object.values(world.shops ?? {}).reduce((t, s) => t + (s.cash ?? 0), 0);
  const escrow = (world.guild?.quests ?? []).reduce((t, q) => {
    if (q.source !== 'pj') return t;
    if (q.status === 'completada') return t + q.takers.filter((x) => !x.claimed).reduce((n, x) => n + (x.share ?? 0), 0) + (q.reward - q.takers.reduce((n, x) => n + (x.share ?? 0), 0));
    if (q.refund) return t + (q.refund.claimed ? 0 : q.refund.amount);
    return t + q.reward;
  }, 0);
  const banked = Object.values(world.bank ?? {}).reduce((t, b) => t + b.balance, 0);
  return coinsInCp(character.equipment.coins) + cash + escrow + banked;
}

function expectConserved(before, after, label) {
  expect(wealth(after.world, after.character), label).toBe(wealth(before.world, before.character));
}

for (const system of ['dnd', 'lord100']) {
  describe(`Dinero en las tiendas · ${system === 'dnd' ? 'Monedas de D&D' : 'Monedas de Lord 100'}`, () => {
    const ctx = agarias;
    const w0 = () => createWorld(ctx, { seed: `audit-${system}`, warmupDays: 0 });

    it('comprar y vender: la bolsa baja/sube y la caja sube/baja lo mismo', () => {
      const world = w0();
      const character = hero(system);
      const shopId = 'yunque';
      const itemId = Object.keys(world.shops[shopId].stock).find((id) => world.shops[shopId].stock[id].qty > 0 && quoteBuy(world, ctx, { shopId, itemId: id }));
      const b = buy(world, ctx, { charId: 'a', shopId, itemId, qty: 1, character });
      expect(b.error).toBeUndefined();
      expect(coinsInCp(b.character.equipment.coins)).toBeLessThan(coinsInCp(character.equipment.coins));
      expect(b.world.shops[shopId].cash).toBeGreaterThan(world.shops[shopId].cash);
      expectConserved({ world, character }, b, 'compra');
      const s = sell(b.world, ctx, { charId: 'a', shopId, itemId, qty: 1, character: b.character });
      expect(s.error).toBeUndefined();
      expect(coinsInCp(s.character.equipment.coins)).toBeGreaterThan(coinsInCp(b.character.equipment.coins));
      expectConserved(b, s, 'venta');
    });

    it('rumores pagados y rondas: lo cobra el comerciante', () => {
      const world = w0();
      const character = hero(system);
      const r = talk.drink(world, ctx, { keeperId: 'rolda', charId: 'a', character, payFirst: true });
      expect(r.error).toBeUndefined();
      expect(coinsInCp(r.character.equipment.coins)).toBeLessThan(coinsInCp(character.equipment.coins));
      expectConserved({ world, character }, r, 'ronda');
    });

    it('hospedaje: alquilar, irse antes (reembolso) y servicios', () => {
      const world = w0();
      const character = hero(system);
      const shopId = ctx.shopList.find((s) => lodging.hasLodging(ctx, s.id)).id;
      const room = lodging.innOf(world, ctx, shopId).rooms[0];
      const rent = lodging.rentRoom(world, ctx, { shopId, roomId: room.id, days: 4, charId: 'a', character });
      expect(rent.world.shops[shopId].cash - world.shops[shopId].cash).toBe(room.price * 4);
      expectConserved({ world, character }, rent, 'alquiler');
      const leave = lodging.leaveRoom(rent.world, ctx, { charId: 'a', character: rent.character });
      expectConserved(rent, leave, 'reembolso');
      const svc = services.hireShopService(leave.world, ctx, { shopId: 'templo-aurora', serviceId: 'curar', charId: 'a', character: leave.character });
      expect(svc.error).toBeUndefined();
      expectConserved(leave, svc, 'servicio');
    });

    it('cambista: el cambio y el banco no crean ni pierden dinero (la comisión va a su caja)', () => {
      const world = w0();
      const character = hero(system, 30);
      const from = system === 'dnd' ? 'gp' : 'sp';
      const ex = bank.exchangeCoins(world, ctx, { shopId: 'balanzafiel', character, from: 'gp', to: 'sp', count: 3 });
      expect(ex.error, from).toBeUndefined();
      expectConserved({ world, character }, ex, 'cambio');
      const dep = bank.deposit(ex.world, ctx, { shopId: 'balanzafiel', charId: 'a', character: ex.character, amount: 1000 });
      expectConserved(ex, dep, 'depósito');
      const wd = bank.withdraw(dep.world, ctx, { shopId: 'balanzafiel', charId: 'a', character: dep.character, amount: null });
      expectConserved(dep, wd, 'retirada');
    });

    it('contratar a un comerciante: la prima la cobra él, y al liquidar el dinero sale de su caja', () => {
      const world = w0();
      changeReputation(world, 'a', 'marla', 100, { dailyCap: 100 });
      const character = hero(system, 5000);
      const r = hiring.hire(world, ctx, { charId: 'a', keeperId: 'marla', character });
      expect(r.error).toBeUndefined();
      expectConserved({ world, character }, r, 'contrato');
      r.world.contracts.marla.balance = 700; // beneficios acumulados
      const s = hiring.settle(r.world, ctx, { charId: 'a', keeperId: 'marla', character: r.character });
      expect(s.error).toBeUndefined();
      expectConserved(r, s, 'liquidar beneficios');
      s.world.contracts.marla.balance = -300; // salarios pendientes
      const d = hiring.settle(s.world, ctx, { charId: 'a', keeperId: 'marla', character: s.character });
      expectConserved(s, d, 'pagar salarios');
    });
  });

  describe(`Gremio · ${system}`, () => {
    it('publicar, aceptar, completar y cobrar conserva el dinero', () => {
      let world = createWorld(tower, { seed: `g-${system}`, warmupDays: 0 });
      world = floors.setFloor(world, tower, 1).world;
      const g = guild.guildOnFloor(tower, 1);
      const poster = hero(system, 300);
      const pub = guild.publishQuest(world, tower, { shopId: g.shopId, charId: 'a', charName: 'Aria', character: poster, form: { title: 'Prueba', rank: 'A', reward: 20000, maxTakers: 2 } });
      expect(pub.error).toBeUndefined();
      expectConserved({ world, character: poster }, pub, 'publicar');
      let w = guild.acceptQuest(pub.world, tower, { shopId: g.shopId, questId: pub.quest.id, charId: 'b', charName: 'Bo' }).error
        ? guild.acceptQuest(guild.setLicenseRank(pub.world, tower, { charId: 'b', rankId: 'A' }).world, tower, { shopId: g.shopId, questId: pub.quest.id, charId: 'b', charName: 'Bo' }).world
        : null;
      w = guild.resolveQuest(w, tower, { questId: pub.quest.id, outcome: 'completada', charId: 'a' }).world;
      const bo = hero(system, 0);
      const claim = guild.claimQuest(w, tower, { questId: pub.quest.id, charId: 'b', charName: 'Bo', character: bo });
      expect(coinsInCp(claim.character.equipment.coins)).toBe(20000);
      expect(wealth(claim.world, claim.character)).toBe(wealth(w, bo));
    });

    it('con 246 po se puede publicar una misión de rango A con una recompensa razonable', () => {
      let world = createWorld(tower, { seed: 'a', warmupDays: 0 });
      const g = guild.guildOnFloor(tower, 1);
      const c = createCharacter();
      c.equipment.coins = { cp: 0, sp: 19, gp: 45, pp: 20, system: 'dnd' };
      if (system === 'lord100') c.equipment.coins = convertCoins(c.equipment.coins, 'lord100').coins;
      expect(guild.minReward(tower, 'A')).toBeLessThanOrEqual(5000);
      const r = guild.publishQuest(world, tower, { shopId: g.shopId, charId: 'a', character: c, form: { title: 'Dragón', rank: 'A', reward: 10000 } });
      expect(r.error).toBeUndefined();
      const low = guild.publishQuest(world, tower, { shopId: g.shopId, charId: 'a', character: c, form: { title: 'Dragón', rank: 'A', reward: 100 } });
      expect(low.error).toMatch(/mínimo.*No tiene que ver con tu dinero/);
    });
  });
}
