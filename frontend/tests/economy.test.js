// Sistema monetario (D&D / Lord 100), hospedaje, muebles, cambista, servicios
// y tiendas por piso.
import { describe, it, expect, afterEach } from 'vitest';
import {
  coinsInCp, convertCoins, pay, receiveCoins, formatCp, formatBag, setDisplayCurrency, CURRENCIES,
} from '../src/domain/money.js';
import { buildShopContext } from '../src/services/shop.js';
import { createWorld, reconcileWorld, advanceDays } from '../src/domain/shop/simulation.js';
import { migrateWorld } from '../src/domain/shop/state.js';
import { packWorld } from '../src/domain/shop/pack.js';
import * as floors from '../src/domain/shop/floors.js';
import * as lodging from '../src/domain/shop/lodging.js';
import * as furniture from '../src/domain/shop/furniture.js';
import * as bank from '../src/domain/shop/bank.js';
import * as services from '../src/domain/shop/services.js';
import { lord100Content } from '../src/content/lord100.js';
import { createCharacter } from '../src/domain/schema.js';
import { normalizeCharacter } from '../src/domain/validation.js';
import { mergeCharacters } from '../src/domain/merge.js';
import { applyBackgroundEquipment, setBackground, setBackgroundEquipmentChoice } from '../src/domain/background.js';

afterEach(() => setDisplayCurrency('dnd'));

const hero = (coins) => {
  const c = createCharacter();
  c.identity.name = 'Aria';
  c.equipment.coins = { ...c.equipment.coins, ...coins };
  return c;
};

describe('Sistema monetario', () => {
  it('D&D no cambia: 10 pc = 1 pp, 10 pp = 1 po, 10 po = 1 ppt', () => {
    expect(CURRENCIES.dnd.values).toEqual({ cp: 1, sp: 10, gp: 100, pp: 1000 });
    expect(coinsInCp({ cp: 1, sp: 1, gp: 1, pp: 1 })).toBe(1111);
    expect(formatCp(1450)).toBe('14 po 5 pp');
  });

  it('Lord 100: 10 pc = 1 pp, 100 pp = 1 po, 100 po = 1 ppt', () => {
    expect(CURRENCIES.lord100.values).toEqual({ cp: 1, sp: 10, gp: 1000, pp: 100000 });
    expect(coinsInCp({ cp: 1, sp: 1, gp: 1, pp: 1, system: 'lord100' })).toBe(101011);
    expect(formatCp(1450, { system: 'lord100' })).toBe('1 po 45 pp');
    expect(formatCp(250000, { system: 'lord100' })).toBe('2 ppt 50 po');
  });

  it('convertir no pierde ni crea dinero, en los dos sentidos', () => {
    const bag = { cp: 7, sp: 3, gp: 25, pp: 2, system: 'dnd' };
    const total = coinsInCp(bag);
    const l = convertCoins(bag, 'lord100');
    expect(l.coins.system).toBe('lord100');
    expect(coinsInCp(l.coins)).toBe(total);
    expect(l.coins.cp).toBe(7); // el cobre se conserva y la plata no baja
    expect(l.coins.sp).toBeGreaterThanOrEqual(3);
    expect(l.coins).toMatchObject({ gp: 4, sp: 53, pp: 0 }); // 25 po + 2 ppt de D&D = 4 po y 50 pp de Lord 100
    const back = convertCoins(l.coins, 'dnd');
    expect(coinsInCp(back.coins)).toBe(total);
    expect(formatBag(l.coins)).toBe('4 po 53 pp 7 pc');
  });

  it('pagar y recibir usan el sistema de la bolsa', () => {
    const bag = { cp: 0, sp: 0, gp: 1, pp: 0, system: 'lord100' }; // 1000 pc
    const r = pay(bag, 150);
    expect(r.ok).toBe(true);
    expect(coinsInCp(r.coins)).toBe(850);
    expect(r.coins.system).toBe('lord100');
    expect(coinsInCp(receiveCoins(r.coins, 1150))).toBe(2000);
  });

  it('la ficha guarda el sistema; las antiguas son de D&D', () => {
    const old = createCharacter();
    delete old.equipment.coins.system;
    expect(normalizeCharacter(old).character.equipment.coins.system).toBe('dnd');
    const l = createCharacter();
    l.equipment.coins.system = 'lord100';
    expect(normalizeCharacter(l).character.equipment.coins.system).toBe('lord100');
  });

  it('el equipo de trasfondo (en monedas de D&D) suma su valor en Lord 100', () => {
    let c = setBackground(createCharacter(), { source: 'official', key: 'forastero' });
    c.equipment.coins = convertCoins(c.equipment.coins, 'lord100').coins;
    c = setBackgroundEquipmentChoice(c, 'A');
    const res = applyBackgroundEquipment(c, 'A');
    expect(res.errors).toEqual([]);
    const out = res.character;
    expect(coinsInCp(out.equipment.coins)).toBe(5000); // 50 po de D&D
  });

  it('la campaña elige el sistema: automático según la progresión por pisos', () => {
    const ctx = buildShopContext({ world: 'lord100' });
    let w = createWorld(ctx, { seed: 'm', warmupDays: 0 });
    expect(floors.worldCurrency(w)).toBe('lord100');
    w = floors.setProgressEnabled(w, false).world;
    expect(floors.worldCurrency(w)).toBe('dnd');
    w = floors.setCurrencyMode(w, 'lord100').world;
    expect(floors.worldCurrency(w)).toBe('lord100');
    expect(floors.setCurrencyMode(w, 'oro').error).toBeTruthy();
    const ag = buildShopContext({ world: 'agarias' });
    expect(floors.worldCurrency(createWorld(ag, { seed: 'a', warmupDays: 0 }))).toBe('dnd');
  });

  it('fusionar fichas con sistemas distintos no duplica dinero', () => {
    const base = hero({ gp: 5 });
    const mine = structuredClone(base);
    mine.equipment.coins.gp = 7; // +2 po (200 pc) en esta pestaña
    const theirs = structuredClone(base);
    theirs.equipment.coins = convertCoins(theirs.equipment.coins, 'lord100').coins; // la Tienda convirtió
    const m = mergeCharacters(base, mine, theirs);
    expect(m.equipment.coins.system).toBe('lord100');
    expect(coinsInCp(m.equipment.coins)).toBe(700);
  });
});

describe('Formato compacto del mercado', () => {
  it('empaqueta y despliega sin perder nada; la Torre entera cabe en el servidor', () => {
    const ctx = buildShopContext({ world: 'lord100' });
    let w = createWorld(ctx, { seed: 'p', warmupDays: 0 });
    w = reconcileWorld(floors.setFloor(w, ctx, 99).world, ctx);
    w = advanceDays(w, ctx, 20).world;
    const packed = JSON.stringify(packWorld(w));
    expect(packed.length).toBeLessThan(1_000_000);
    expect(packed.length).toBeLessThan(JSON.stringify(w).length * 0.7);
    expect(migrateWorld(JSON.parse(packed))).toEqual(migrateWorld(JSON.parse(JSON.stringify(w))));
  });
});

describe('Tiendas por piso (Lord 100)', () => {
  const ctx = buildShopContext({ world: 'lord100' });
  const merchants = lord100Content().mercader.map((m) => m.item);
  const onFloor = (f) => merchants.filter((m) => m.floor === f);

  it('esenciales en TODOS los pisos: posada, comercio general y Gremio', () => {
    for (let f = 1; f <= 99; f++) {
      const profs = onFloor(f).map((m) => m.profession);
      expect(profs, `piso ${f}`).toContain('general');
      expect(profs, `piso ${f}`).toContain('tabernero');
      expect(profs, `piso ${f}`).toContain('gremio');
    }
  });

  it('los negocios variables dependen de la zona y no cambian los que ya había', () => {
    const all = merchants.map((m) => m.profession);
    for (const p of ['templo', 'cambista', 'flechero', 'carpintero', 'escriba', 'lutier', 'mueblero', 'agricola', 'exotico', 'lujo', 'regional']) expect(all).toContain(p);
    // Un puerto puede tener cambista; una pradera, no.
    const tower = lord100Content();
    expect(tower.mercader.some((m) => m.item.profession === 'cambista' && /pradera/.test(m.ref))).toBe(false);
    // Las referencias antiguas siguen existiendo (las tiendas de campañas en curso no desaparecen).
    expect(tower.mercader.some((m) => m.ref.endsWith('l100-1-pradera-general-0'))).toBe(true);
  });

  it('en pisos altos los artesanos ofrecen más calidad', () => {
    const herreros = merchants.filter((m) => m.profession === 'herrero');
    expect(herreros.find((m) => m.floor < 40).qualities).not.toContain('obra');
    expect(herreros.find((m) => m.floor >= 75)?.qualities ?? ['obra']).toContain('obra');
  });

  it('Agarias tiene ahora alquimista, templo, cambista, flechero, carpintero, escriba, lutier y mueblería', () => {
    const ag = buildShopContext({ world: 'agarias' });
    const profs = ag.shopList.map((s) => ag.keeperOf(s.id)?.profession);
    for (const p of ['alquimista', 'templo', 'cambista', 'flechero', 'carpintero', 'escriba', 'lutier', 'mueblero']) expect(profs).toContain(p);
    expect(ag.problems).toEqual([]);
    expect(ctx.problems).toEqual([]);
  });
});

describe('Hospedaje', () => {
  const ctx = buildShopContext({ world: 'agarias' });
  const w0 = () => createWorld(ctx, { seed: 'posada', warmupDays: 0 });

  it('cada posada tiene sus habitaciones, precios y reglas; la más barata cuesta 1 pp', () => {
    const shops = ctx.shopList.filter((s) => lodging.hasLodging(ctx, s.id));
    expect(shops.length).toBeGreaterThan(0);
    expect(lodging.hasLodging(ctx, 'feria')).toBe(false); // puesto de feria: no alquila
    const info = lodging.innOf(w0(), ctx, shops[0].id);
    expect(info.rooms.length).toBeGreaterThanOrEqual(3);
    for (const r of info.rooms) expect(r.comforts.length).toBeGreaterThan(0);
    const basica = info.rooms.find((r) => r.id === 'basica');
    if (basica) expect(basica.price).toBeGreaterThanOrEqual(10);
    // En Lord 100 un piso alto cobra más que uno bajo.
    const l = buildShopContext({ world: 'lord100' });
    const innOn = (f) => l.shopList.find((s) => l.keeperOf(s.id)?.profession === 'tabernero' && l.keeperOf(s.id)?.floor === f);
    const lw = createWorld(l, { seed: 'x', warmupDays: 0 });
    const price = (f) => lodging.innOf(lw, l, innOn(f).id).rooms.find((r) => r.id === 'estandar').price;
    expect(price(90)).toBeGreaterThan(price(2) * 0.9 * 1.5);
  });

  it('alquilar descuenta el total, registra la estancia y caduca con el calendario', () => {
    const shopId = ctx.shopList.find((s) => lodging.hasLodging(ctx, s.id)).id;
    const w = w0();
    const info = lodging.innOf(w, ctx, shopId);
    const room = info.rooms[0];
    const c = hero({ gp: 50 });
    const r = lodging.rentRoom(w, ctx, { shopId, roomId: room.id, days: 3, charId: 'a', charName: 'Aria', character: c });
    expect(r.error).toBeUndefined();
    expect(coinsInCp(r.character.equipment.coins)).toBe(5000 - room.price * 3);
    expect(lodging.stayOf(r.world, 'a')).toMatchObject({ daysLeft: 3, until: w.day + 2, expired: false });
    const later = advanceDays(r.world, ctx, 3).world;
    expect(lodging.stayOf(later, 'a').expired).toBe(true);
    // Renovar cuando venció: el nuevo plazo empieza hoy.
    const ren = lodging.rentRoom(later, ctx, { shopId, roomId: room.id, days: 2, charId: 'a', character: r.character });
    expect(lodging.stayOf(ren.world, 'a')).toMatchObject({ daysLeft: 2, until: later.day + 1 });
    // Sin dinero no se renueva.
    expect(lodging.rentRoom(ren.world, ctx, { shopId, roomId: room.id, days: 30, charId: 'a', character: hero({}) }).error).toMatch(/alcanza/);
  });

  it('irse antes devuelve según la regla de la posada', () => {
    const shopId = ctx.shopList.find((s) => lodging.hasLodging(ctx, s.id)).id;
    const w = w0();
    const info = lodging.innOf(w, ctx, shopId);
    const room = info.rooms[0];
    const r = lodging.rentRoom(w, ctx, { shopId, roomId: room.id, days: 5, charId: 'a', character: hero({ gp: 50 }) });
    const out = lodging.leaveRoom(r.world, ctx, { charId: 'a', character: r.character });
    expect(out.refund).toBe(Math.floor(4 * room.price * info.refund));
    expect(lodging.stayOf(out.world, 'a')).toBeNull();
  });
});

describe('Muebles', () => {
  const ctx = buildShopContext({ world: 'agarias' });
  it('se guardan en el inventario y se colocan donde caben; al irse, vuelven', () => {
    const shopId = ctx.shopList.find((s) => lodging.hasLodging(ctx, s.id)).id;
    let w = createWorld(ctx, { seed: 'm', warmupDays: 0 });
    const info = lodging.innOf(w, ctx, shopId);
    const room = info.rooms.filter((r) => r.slots >= 2).at(-1) ?? info.rooms.at(-1);
    const r = lodging.rentRoom(w, ctx, { shopId, roomId: room.id, days: 2, charId: 'a', character: hero({ gp: 100 }) });
    w = r.world;
    let c = r.character;
    c.equipment.items.push({ name: 'Alfombra tejida', quantity: 1, notes: '', ref: 'alfombra-tejida' });
    expect(furniture.isFurniture(ctx.item('alfombra-tejida'))).toBe(true);
    expect(furniture.furnitureOf(w, ctx, 'a', c)[0]).toMatchObject({ stored: 1 });
    const placed = furniture.placeFurniture(w, ctx, { charId: 'a', character: c, itemId: 'alfombra-tejida', spaceId: 'lodging' });
    if (room.slots < 1) {
      expect(placed.error).toMatch(/cabe/);
      return;
    }
    expect(placed.error).toBeUndefined();
    expect(placed.character.equipment.items.some((i) => i.ref === 'alfombra-tejida')).toBe(false);
    expect(furniture.furnitureOf(placed.world, ctx, 'a', placed.character)[0].placedIn.length).toBe(1);
    const left = lodging.leaveRoom(placed.world, ctx, { charId: 'a', character: placed.character });
    expect(left.character.equipment.items.some((i) => i.ref === 'alfombra-tejida')).toBe(true);
  });

  it('funcionales y decorativos se distinguen', () => {
    expect(ctx.item('cama-sencilla').furniture.kind).toBe('funcional');
    expect(ctx.item('cuadro-paisaje').furniture.kind).toBe('decorativo');
  });
});

describe('Cambista y servicios', () => {
  const ctx = buildShopContext({ world: 'agarias' });
  const w = createWorld(ctx, { seed: 'b', warmupDays: 0 });
  it('cambia monedas con comisión y guarda dinero en el banco', () => {
    expect(bank.isExchange(ctx, 'balanzafiel')).toBe(true);
    const c = hero({ pp: 2 });
    const ex = bank.exchangeCoins(w, ctx, { shopId: 'balanzafiel', character: c, from: 'pp', to: 'gp', count: 1 });
    expect(ex.character.equipment.coins.pp).toBe(1);
    expect(coinsInCp(ex.character.equipment.coins)).toBe(2000 - 20);
    const dep = bank.deposit(w, ctx, { shopId: 'balanzafiel', charId: 'a', character: ex.character, amount: 500 });
    expect(bank.bankOf(dep.world, 'a').balance).toBe(500);
    const wd = bank.withdraw(dep.world, ctx, { shopId: 'balanzafiel', charId: 'a', character: dep.character, amount: null });
    expect(coinsInCp(wd.character.equipment.coins)).toBe(1980);
    expect(bank.bankOf(wd.world, 'a').balance).toBe(0);
  });

  it('el templo cobra sus servicios', () => {
    const list = services.servicesOf(ctx, 'templo-aurora');
    expect(list.map((s) => s.id)).toContain('curar');
    const r = services.hireShopService(w, ctx, { shopId: 'templo-aurora', serviceId: 'curar', character: hero({ gp: 60 }), charId: 'a' });
    expect(coinsInCp(r.character.equipment.coins)).toBe(1000);
    expect(services.serviceLogOf(r.world, 'a')).toHaveLength(1);
  });
});
