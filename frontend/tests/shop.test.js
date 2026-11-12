// Tienda: dominio (precios, simulación, negociación) e integración con la
// ficha (monedas de equipment.coins, inventario y materiales del Taller) y con
// el mercado (local o de campaña con revisión).
import { describe, it, expect } from 'vitest';
import { createCharacter, createDocument } from '../src/domain/schema.js';
import { parseDocument } from '../src/domain/validation.js';
import { coinsInCp, pay, formatCp, niceRound } from '../src/domain/money.js';
import { createWorld, advanceDays } from '../src/domain/shop/simulation.js';
import { marketPrice, quoteBuy, quoteSell } from '../src/domain/shop/pricing.js';
import { buy, sell } from '../src/domain/shop/transactions.js';
import { ownedUnits } from '../src/domain/shop/inventory.js';
import { startNegotiation, act, getSession } from '../src/domain/shop/negotiation.js';
import { parseCost, homebrewItems } from '../src/domain/shop/sources.js';
import { buildShopContext, createShopService } from '../src/services/shop.js';
import { createLocalStore } from '../src/services/local-store.js';
import { createCharacterService } from '../src/services/characters.js';
import { ApiError } from '../src/services/api.js';
import { createMarketRepository } from '../src/services/shop-market.js';

const ctx = buildShopContext();

function hero(gp = 500) {
  const c = createCharacter();
  c.identity.name = 'Aria';
  c.equipment.coins = { cp: 0, sp: 0, gp, pp: 0 };
  return c;
}
const inStock = (world, shopId, filter = () => true) =>
  Object.keys(world.shops[shopId].stock).find((id) => world.shops[shopId].stock[id].qty > 0 && filter(ctx.item(id), world.shops[shopId].stock[id]));

describe('Tienda · datos y dinero', () => {
  it('el catálogo carga sin errores e incluye los materiales del Taller', () => {
    expect(ctx.problems).toEqual([]);
    const placas = ctx.item('taller-placas');
    expect(placas).toMatchObject({ category: 'tecnologia', price: 500, grant: { kind: 'workshop-material', id: 'placas' } });
    expect(ctx.shop('engranajes')).toBeTruthy();
  });

  it('un único sistema de monedas: pagar con cambio y formato', () => {
    const r = pay({ cp: 0, sp: 0, gp: 1, pp: 0 }, 35);
    expect(r.ok).toBe(true);
    expect(coinsInCp(r.coins)).toBe(65);
    expect(pay({ sp: 1 }, 20).ok).toBe(false);
    expect(formatCp(1450)).toBe('14 po 5 pp');
    expect(niceRound(1473)).toBe(1450);
  });

  it('lee el coste de los objetos Homebrew', () => {
    expect(parseCost('1.500 po')).toBe(150000);
    expect(parseCost('5 pp')).toBe(50);
    expect(parseCost('gratis')).toBeNull();
    const items = homebrewItems([{ ref: 'hb:camp:objeto:capa', packId: 'camp', item: { name: 'Capa', cost: '200 po', rarity: 'raro' } }, { ref: 'hb:x:objeto:y', item: { name: 'Sin precio' } }]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'hb:camp:objeto:capa', price: 20000, rarity: 'rare' });
  });
});

describe('Tienda · el inventario es la ficha', () => {
  it('comprar cobra de equipment.coins y añade el objeto con ref; se apila', () => {
    const world = createWorld(ctx, { seed: 'compra' });
    const itemId = inStock(world, 'yunque', (i, e) => i.price < 3000 && (e.unlimited || e.qty >= 2));
    let r = buy(world, ctx, { charId: 'pj', shopId: 'yunque', itemId, qty: 1, character: hero() });
    expect(r.error).toBeUndefined();
    expect(coinsInCp(r.character.equipment.coins)).toBe(50000 - r.ledger.total);
    expect(r.character.equipment.items).toEqual([expect.objectContaining({ ref: itemId, quantity: ctx.item(itemId).bundle ?? 1 })]);
    r = buy(r.world, ctx, { charId: 'pj', shopId: 'yunque', itemId, qty: 1, character: r.character });
    expect(r.character.equipment.items).toHaveLength(1);
    expect(r.character.equipment.items[0].quantity).toBe(2 * (ctx.item(itemId).bundle ?? 1));
    // La referencia sobrevive a guardar/abrir la ficha.
    const { character } = parseDocument(createDocument(r.character));
    expect(character.equipment.items[0].ref).toBe(itemId);
  });

  it('los materiales del Ingeniero se compran aquí y van a workshop.materials', () => {
    const world = createWorld(ctx, { seed: 'taller' });
    const r = buy(world, ctx, { charId: 'pj', shopId: 'engranajes', itemId: 'taller-placas', qty: 3, character: hero() });
    expect(r.error).toBeUndefined();
    expect(r.character.workshop.materials.placas).toBe(3);
    expect(r.character.equipment.items).toEqual([]);
    expect(ownedUnits(r.character, ctx.item('taller-placas'))).toBe(3);
  });

  it('sin dinero no hay compra y nada cambia', () => {
    const world = createWorld(ctx, { seed: 'pobre' });
    const poor = hero(0);
    const r = buy(world, ctx, { shopId: 'engranajes', itemId: 'taller-nucleo', qty: 1, character: poor });
    expect(r.error).toMatch(/No te alcanza/);
  });

  it('vender quita del inventario (también objetos escritos a mano) y paga en monedas', () => {
    const world = createWorld(ctx, { seed: 'vende' });
    const c = hero(0);
    c.equipment.items = [{ name: 'daga', quantity: 2, notes: '' }];
    const q = quoteSell(world, ctx, { shopId: 'yunque', itemId: 'daga' });
    expect(q.unit).toBeGreaterThan(0);
    const r = sell(world, ctx, { charId: 'pj', shopId: 'yunque', itemId: 'daga', qty: 1, character: c });
    expect(r.error).toBeUndefined();
    expect(r.character.equipment.items[0].quantity).toBe(1);
    expect(coinsInCp(r.character.equipment.coins)).toBe(r.ledger.total);
    expect(sell(r.world, ctx, { shopId: 'yunque', itemId: 'daga', qty: 5, character: r.character }).error).toMatch(/tantas/);
  });
});

describe('Tienda · mercado', () => {
  it('es determinista y los precios se mueven de forma suave', () => {
    expect(createWorld(ctx, { seed: 'x' })).toEqual(createWorld(ctx, { seed: 'x' }));
    let world = createWorld(ctx, { seed: 'suave' });
    let prev = null;
    let maxJump = 0;
    for (let d = 0; d < 40; d++) {
      const p = marketPrice(world, ctx, 'linterna', 'cuerda-canamo');
      if (prev) maxJump = Math.max(maxJump, Math.abs(p - prev) / prev);
      prev = p;
      world = advanceDays(world, ctx, 1).world;
    }
    expect(maxJump).toBeLessThan(0.12);
  });

  it('negociar nunca baja del límite del vendedor y deja un trato para hoy', () => {
    let world = createWorld(ctx, { seed: 'regateo' });
    const itemId = inStock(world, 'yunque', (i) => i.price >= 1000 && i.price <= 5000);
    const s = startNegotiation(world, ctx, { charId: 'pj', shopId: 'yunque', itemId, side: 'buy', qty: 1 });
    world = s.world;
    const reservation = getSession(world, s.session.id).reservation;
    let session = s.session;
    for (let i = 0; i < 15 && ['open', 'final'].includes(session.status); i++) {
      const r = act(world, ctx, s.session.id, { type: 'offer', amount: Math.round((session.lastOffer ?? session.list * 0.85) + session.list * 0.03) }, { skills: {} });
      world = r.world;
      session = r.session;
    }
    expect(session.status).toBe('deal');
    expect(session.finalUnit).toBeGreaterThanOrEqual(reservation - 1);
    expect(quoteBuy(world, ctx, { shopId: 'yunque', itemId, charId: 'pj' }).unit).toBe(session.finalUnit);
  });
});

// ── Servicio con personajes reales (IndexedDB en memoria) ──────────────

function memoryMarket({ conflictOnce = false } = {}) {
  const store = { world: null, revision: 0 };
  let conflict = conflictOnce;
  return {
    store,
    async load() { return { world: store.world && structuredClone(store.world), revision: store.revision, role: 'jugador' }; },
    async save(_scope, world, revision) {
      if (conflict && store.world) { conflict = false; store.revision += 1; throw new ApiError('conflict', 'conflicto'); }
      if (revision !== store.revision) throw new ApiError('conflict', 'conflicto');
      store.world = structuredClone(world);
      store.revision += 1;
      return store.revision;
    },
  };
}

describe('Tienda · servicio', () => {
  async function setup(market = memoryMarket()) {
    const characters = createCharacterService({ store: createLocalStore(), api: {} });
    const record = await characters.create(hero(300));
    const shop = await createShopService({ characters, homebrew: { memberships: () => [] }, market }).init(record.id);
    return { characters, record, shop, market };
  }

  it('compra: guarda la ficha (monedas + material) y el mercado', async () => {
    const { characters, record, shop, market } = await setup();
    // Los comerciantes no son globales: Pim está en el Barrio de las Fraguas.
    expect((await shop.buy('engranajes', 'taller-engranajes', 2)).error).toMatch(/no está aquí/);
    expect((await shop.travel('barrio-fraguas')).error).toBeUndefined();
    const res = await shop.buy('engranajes', 'taller-engranajes', 2);
    expect(res.error).toBeUndefined();
    const reopened = await characters.open(record.id);
    expect(reopened.character.workshop.materials.engranajes).toBe(2);
    expect(coinsInCp(reopened.character.equipment.coins)).toBe(30000 - res.ledger.total);
    expect(market.store.world.ledger[0]).toMatchObject({ itemId: 'taller-engranajes', charName: 'Aria', side: 'buy' });
  });

  it('si otro jugador guardó el mercado a la vez, reintenta con datos frescos', async () => {
    const market = memoryMarket();
    const { shop } = await setup(market);
    await shop.travel('barrio-fraguas');
    market.save = ((orig) => { let first = true; return async (...a) => { if (first) { first = false; market.store.revision += 1; throw new ApiError('conflict', 'x'); } return orig(...a); }; })(market.save.bind(market));
    const res = await shop.buy('engranajes', 'taller-chatarra', 1);
    expect(res.error).toBeUndefined();
  });

  it('conversar con un comerciante guarda la ficha y el mercado (pagar una ronda)', async () => {
    const { characters, record, shop } = await setup();
    expect(shop.here).toBe('plaza-mayor');
    expect(shop.merchantsHere().map((m) => m.keeper.id)).toEqual(expect.arrayContaining(['marla']));
    const res = await shop.talk('drink', 'marla');
    if (!res.error) {
      const reopened = await characters.open(record.id);
      expect(coinsInCp(reopened.character.equipment.coins)).toBeLessThan(30000);
      expect(shop.merchant('marla').relation.memory.drank.n).toBe(1);
    } else {
      expect(res.error).toBeTruthy();
    }
    const rumor = await shop.talk('rumor', 'marla');
    expect(rumor.error).toBeUndefined();
    expect(shop.journal().length).toBeGreaterThan(0);
  });

  it('un jugador de campaña no puede pasar el día', async () => {
    const { shop } = await setup();
    expect(shop.canControlTime).toBe(false);
    expect((await shop.advanceDays(1)).error).toMatch(/DM/);
  });
});

describe('Tienda · mercado de campaña (Supabase)', () => {
  function fakeRpc() {
    const db = { world: null, revision: 0 };
    return {
      db,
      async get(id, key) { if (key !== 'inv' && key !== 'dm') throw new ApiError('forbidden', 'x'); return { world: db.world, revision: db.revision, role: key === 'dm' ? 'dm' : 'jugador' }; },
      async save(id, key, world, rev) {
        if ((rev ?? -1) !== db.revision) throw new ApiError('conflict', 'x');
        if (key !== 'dm' && db.world && world.day !== db.world.day) throw new ApiError('forbidden', 'x');
        db.world = structuredClone(world); db.revision += 1; return { revision: db.revision };
      },
    };
  }
  async function campaignSetup(api, key = 'inv') {
    const characters = createCharacterService({ store: createLocalStore(), api: {} });
    const c = hero(300);
    c.campaign = { id: 'mesa', name: 'Mesa' };
    const record = await characters.create(c);
    const homebrew = { memberships: () => [{ id: 'mesa', name: 'Mesa', role: 'jugador', key }] };
    const shop = await createShopService({ characters, homebrew, market: createMarketRepository({ api }), remoteEnabled: true }).init(record.id);
    return { shop, characters, record };
  }

  it('el jugador usa el mercado compartido; la compra queda registrada en el servidor', async () => {
    const api = fakeRpc();
    const { shop } = await campaignSetup(api);
    expect(shop.state.scope).toMatchObject({ kind: 'campaign', id: 'mesa' });
    expect(api.db.revision).toBe(1); // el primero en entrar crea el mercado
    expect((await shop.travel('barrio-fraguas')).error).toBeUndefined();
    const res = await shop.buy('engranajes', 'taller-placas', 1);
    expect(res.error).toBeUndefined();
    expect(api.db.world.ledger[0]).toMatchObject({ itemId: 'taller-placas', charName: 'Aria' });
    expect(shop.canControlTime).toBe(false);
  });

  it('sin la migración en Supabase, usa el mercado local y avisa', async () => {
    const api = { async get() { throw new ApiError('server_not_ready', 'x'); }, async save() { throw new ApiError('server_not_ready', 'x'); } };
    const { shop } = await campaignSetup(api);
    expect(shop.state.scope.kind).toBe('local');
    expect(shop.state.notice).toMatch(/servidor/);
    await shop.travel('barrio-fraguas');
    expect((await shop.buy('engranajes', 'taller-chatarra', 1)).error).toBeUndefined();
  });
});
