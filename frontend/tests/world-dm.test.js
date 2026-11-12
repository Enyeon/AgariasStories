// Mundo configurable por el DM: profesiones, horarios, regiones, facciones,
// eventos, comerciantes Homebrew (nuevos y sobre oficiales), contratación,
// permisos y ámbito del Homebrew.
import { describe, it, expect, afterEach } from 'vitest';
import { createCharacter } from '../src/domain/schema.js';
import { createWorld, advanceDays, triggerEvent } from '../src/domain/shop/simulation.js';
import { quoteBuy } from '../src/domain/shop/pricing.js';
import { evaluateDisposition } from '../src/domain/shop/disposition.js';
import { canNegotiate } from '../src/domain/shop/negotiation.js';
import { availability, merchantsAt, keeperLocation, discover } from '../src/domain/shop/presence.js';
import { hoursToPhases } from '../src/domain/shop/compile.js';
import { assembleWorld, merchantToEditor } from '../src/domain/shop/homebrew-world.js';
import * as hiring from '../src/domain/shop/hiring.js';
import * as talk from '../src/domain/shop/talk.js';
import { getRelation, changeReputation, cloneWorld } from '../src/domain/shop/state.js';
import { buildShopContext, characterProfile } from '../src/services/shop.js';
import { validateContent } from '../src/content/schema.js';
import { normalizeRules, permissionsFor } from '../src/content/rules.js';
import { installPack, resetRegistry } from '../src/content/registry.js';
import { coinsInCp } from '../src/domain/money.js';
import worldData from '../src/data/shop/world.json';
import factionsData from '../src/data/shop/factions.json';
import eventsData from '../src/data/shop/events.json';
import keepersData from '../src/data/shop/keepers.json';
import shopsData from '../src/data/shop/shops.json';
import rumorsData from '../src/data/shop/rumors.json';

const official = { world: worldData, factions: factionsData.factions, events: eventsData.events, keepers: keepersData.keepers, shops: shopsData.shops, rumors: rumorsData.rumors };

function hero({ race = 'Humano', gp = 300 } = {}) {
  const c = createCharacter();
  c.identity.name = 'Aria';
  c.race.key = race;
  c.equipment.coins = { cp: 0, sp: 0, gp, pp: 0 };
  return c;
}

/** Instala Homebrew del DM y construye el contexto del ámbito pedido. */
function withHomebrew(items, { kind = 'local', id = 'local-test', campaignId = null } = {}) {
  installPack({ id, name: 'Prueba', kind, role: 'dm', items: items.map(([type, cid, data]) => ({ ref: `hb:${id}:${type}:${cid}`, type, version: 1, status: 'publicado', data: validateContent(type, data).item })) });
  return buildShopContext({ campaignId });
}

afterEach(() => resetRegistry());

describe('Mundo del DM · datos oficiales', () => {
  const ctx = buildShopContext();

  it('todo está bien enlazado y existe una tabernera con catálogo por profesión', () => {
    expect(ctx.problems).toEqual([]);
    const world = createWorld(ctx, { seed: 'taberna' });
    const stock = Object.keys(world.shops.jabali.stock).map((id) => ctx.item(id));
    expect(stock.some((i) => i.tags?.includes('bebida'))).toBe(true);
    expect(stock.some((i) => i.sub === 'ingrediente')).toBe(true);
    expect(stock.some((i) => i.sub === 'comida')).toBe(true);
    expect(ctx.keepers.get('rolda').flags).toEqual(expect.arrayContaining(['drinks', 'gossip']));
  });

  it('los horarios por hora se traducen a franjas (también los que cruzan la medianoche)', () => {
    expect(hoursToPhases('08:00-20:00', ctx.phases)).toEqual(['manana', 'tarde', 'anochecer']);
    expect(hoursToPhases('12:00-02:00', ctx.phases)).toEqual(['tarde', 'anochecer', 'noche']);
    const world = createWorld(ctx, { seed: 'horas' });
    const thrain = ctx.keepers.get('thrain');
    const night = { ...world, phase: 3, day: 1 };
    expect(availability(night, ctx, thrain).reason).toMatch(/08:00 a 20:00/);
  });

  it('la región influye: peligro, escasez y razas predominantes', () => {
    const world = createWorld(ctx, { seed: 'region' });
    const weapon = Object.keys(world.shops.intendencia.stock).find((id) => ctx.item(id).category === 'armas');
    const q = quoteBuy(world, ctx, { shopId: 'intendencia', itemId: weapon });
    expect(q.factors.some((f) => /peligrosa/.test(f.label))).toBe(true);
    const dwarf = evaluateDisposition(world, ctx, { keeper: ctx.keepers.get('thrain'), charId: 'c1', profile: characterProfile(hero({ race: 'Enano de las Colinas' })) });
    expect(dwarf.reasons.some((r) => r.source === 'region' && r.value > 0)).toBe(true);
  });

  it('la reputación con la facción se configura por comerciante', () => {
    const world = createWorld(ctx, { seed: 'rep' });
    const enemies = cloneWorld(world);
    enemies.standing = { c1: { 'guardia-norte': -50, 'gremio-mercaderes': -80 } };
    const c = characterProfile(hero());
    // Hilde (umbral de enemigo −40, rechaza enemigos) no comercia; Marla (gremio, por defecto) desconfía pero vende.
    expect(evaluateDisposition(enemies, ctx, { keeper: ctx.keepers.get('hilde'), charId: 'c1', profile: c }).refuses).toMatch(/enemigo/);
    const marla = evaluateDisposition(enemies, ctx, { keeper: ctx.keepers.get('marla'), charId: 'c1', profile: c });
    expect(marla.refuses).toBeNull();
    expect(marla.reputation.enemy).toBe(true);
    const allies = cloneWorld(world);
    allies.standing = { c1: { 'guardia-norte': 60 } };
    const item = Object.keys(world.shops.intendencia.stock).find((id) => ctx.item(id).category === 'armas' && ctx.item(id).price >= 1000);
    const ally = quoteBuy(allies, ctx, { shopId: 'intendencia', itemId: item, charId: 'c1', profile: c });
    expect(ally.factors.some((f) => f.key === 'faccion' && f.pct < 0)).toBe(true);
  });

  it('las reglas de negociación del comerciante se respetan', () => {
    const world = createWorld(ctx, { seed: 'neg' });
    const item = Object.keys(world.shops.intendencia.stock).find((id) => ctx.item(id).price >= 2000) ?? Object.keys(world.shops.intendencia.stock)[0];
    const res = canNegotiate(world, ctx, { charId: 'c1', shopId: 'intendencia', itemId: item, side: 'buy', qty: 5 });
    expect(res.reason).toBe('fixed');
  });
});

describe('Mundo del DM · Homebrew', () => {
  it('Región «Thaabdur» → facción → herrero enano orgulloso, contratable, con horario', () => {
    const ctx = withHomebrew([
      ['region', 'thaabdur', { name: 'Thaabdur', type: 'Minera', danger: 2, races: ['enano'], scarce: ['#tela'], resources: ['#metal'], locations: [{ name: 'Forja Mayor', icon: '⚒️' }], rumors: [{ text: 'Abrieron una mina nueva al norte.', topic: 'lugares' }] }],
      ['faccion', 'gremio', { name: 'Gremio Mercante', ideology: 'Comercio justo', regions: ['hb-thaabdur'], goods: ['armas'] }],
      ['mercader', 'durgan', {
        name: 'Durgan Martillo', location: 'hb-thaabdur-forja-mayor', race: 'enano', faction: 'hb-gremio', profession: 'herrero', archetypes: ['orgulloso'], hours: '08:00-20:00',
        attitudes: [{ kind: 'race', target: 'enano', value: 20, label: 'Hermano de piedra' }, { kind: 'race', target: 'goblinoide', value: -30, label: 'Odia a los goblins', hidden: 'si', effect: 'refuse' }],
        hire: { enabled: true, minTier: 'amistoso', fee: 10, wage: 0.5, mobile: false }, negotiation: { enabled: true, maxDiscount: 10 },
        knows: ['lugares'], rumors: [{ text: 'La veta norte está maldita.', topic: 'lugares', truth: 'exagerado' }],
      }],
    ]);
    expect(ctx.problems).toEqual([]);
    const keeper = ctx.keepers.get('hb:local-test:mercader:durgan');
    expect(keeper).toMatchObject({ faction: 'hb-gremio', profession: 'herrero', presence: { location: 'hb-thaabdur-forja-mayor' } });
    expect(keeper.schedule.phases).toEqual(['manana', 'tarde', 'anochecer']);
    const world = createWorld(ctx, { seed: 'thaabdur' });
    const shopId = 'hb:local-test:mercader:durgan/tienda';
    expect(Object.keys(world.shops[shopId].stock).length).toBeGreaterThan(0); // catálogo de herrero
    // Economía regional (metal más barato) y afinidad/prejuicio por raza.
    const metal = Object.keys(world.shops[shopId].stock).find((id) => ctx.item(id).tags?.includes('metal'));
    expect(quoteBuy(world, ctx, { shopId, itemId: metal }).factors.some((f) => /Recurso de la región/.test(f.label))).toBe(true);
    const dwarf = evaluateDisposition(world, ctx, { keeper, charId: 'c1', profile: characterProfile(hero({ race: 'Enano de las Colinas' })) });
    const goblin = evaluateDisposition(world, ctx, { keeper, charId: 'c1', profile: characterProfile(hero({ race: 'Goblin' })) });
    expect(dwarf.score).toBeGreaterThan(goblin.score);
    expect(goblin.refuses).toBeTruthy();
    // Rumores propios y de la región.
    expect(talk.rumorPool(world, ctx, keeper, getRelation(world, 'c1', keeper.id)).map((r) => r.text)).toEqual(expect.arrayContaining(['La veta norte está maldita.', 'Abrieron una mina nueva al norte.']));
    // Contratable, pero no se muda.
    expect(hiring.hireTerms(world, ctx, { keeper, charId: 'c1', profile: characterProfile(hero({ race: 'Enano de las Colinas' })) })).toMatchObject({ available: true, mobile: false, fee: 1000, wage: 50 });
  });

  it('el DM modifica un comerciante oficial sin perder la relación con los personajes', () => {
    const base = buildShopContext();
    const gorvan = base.keepers.get('gorvan');
    const data = merchantToEditor(keepersData.keepers.find((k) => k.id === 'gorvan'), shopsData.shops.find((s) => s.id === 'yunque'));
    data.race = 'humano';
    data.attitudes.push({ kind: 'race', target: 'goblinoide', value: -25, label: 'No soporta a los goblins', hidden: false, effect: 'none', item: '' });
    data.removeItems = [{ item: 'herr-herrero' }];
    data.prices = [{ item: 'yunque-portatil', price: 1 }];
    data.priceMod = 10;
    const { item, errors } = validateContent('mercader', data);
    expect(errors).toEqual([]);
    const ctx = withHomebrew([['mercader', 'gorvan2', item]]);
    expect(ctx.problems).toEqual([]);
    const mod = ctx.keepers.get('gorvan');
    expect(mod.race).toBe('humano');
    expect(mod.kinds).toContain('modificado');
    expect(mod.attitudes.length).toBe(gorvan.attitudes.length + 1);
    expect(ctx.shopOf('gorvan').id).toBe('yunque');
    let world = createWorld(base, { seed: 'gorvan' });
    changeReputation(world, 'c1', 'gorvan', 15, { dailyCap: 15 });
    world = advanceDays(world, ctx, 1).world;
    expect(getRelation(world, 'c1', 'gorvan').rep).toBe(15);
    expect(world.shops.yunque.stock['herr-herrero']).toBeUndefined();
    const someItem = Object.keys(world.shops.yunque.stock)[0];
    expect(quoteBuy(world, ctx, { shopId: 'yunque', itemId: someItem }).factors.some((f) => f.key === 'casa')).toBe(true);
  });

  it('eventos del DM: sólo afectan a sus regiones y se pueden lanzar a mano', () => {
    const ctx = withHomebrew([['evento', 'sequia', { name: 'Sequía', manual: true, regions: ['valle'], modifiers: [{ product: 'consumibles/comida', pct: 40, label: 'La sequía encarece la comida' }] }]]);
    expect(ctx.problems).toEqual([]);
    let world = createWorld(ctx, { seed: 'sequia' });
    world = triggerEvent(world, ctx, 'hb-sequia', 5).world;
    const food = (shopId) => Object.keys(world.shops[shopId].stock).find((id) => ctx.item(id).sub === 'comida');
    const valle = quoteBuy(world, ctx, { shopId: 'jabali', itemId: food('jabali') });
    expect(valle.factors.some((f) => /sequía/i.test(f.label))).toBe(true);
    const marca = quoteBuy(world, ctx, { shopId: 'intendencia', itemId: food('intendencia') });
    expect(marca.factors.some((f) => /sequía/i.test(f.label))).toBe(false);
  });

  it('un comerciante secreto sólo aparece para quien lo descubre', () => {
    const ctx = withHomebrew([['mercader', 'sombra', { name: 'La Sombra', location: 'callejon-ratas', secret: true, profession: 'perista' }]]);
    const world = createWorld(ctx, { seed: 'sombra' });
    const ids = (w) => merchantsAt(w, ctx, 'callejon-ratas', 'c1').map((m) => m.keeper.id);
    expect(ids(world)).not.toContain('hb:local-test:mercader:sombra');
    const w2 = cloneWorld(world);
    discover(w2, 'c1', { keeper: 'hb:local-test:mercader:sombra' });
    expect(ids(w2)).toContain('hb:local-test:mercader:sombra');
  });

  it('en una campaña sólo cuenta el Homebrew de la campaña (no el local de un jugador)', () => {
    installPack({ id: 'local-x', name: 'Local', kind: 'local', items: [{ ref: 'hb:local-x:mercader:intruso', type: 'mercader', version: 1, status: 'publicado', data: validateContent('mercader', { name: 'Intruso', location: 'plaza-mayor', profession: 'general' }).item }] });
    const campaign = withHomebrew([['mercader', 'oficial', { name: 'Del DM', location: 'plaza-mayor', profession: 'general' }]], { kind: 'campaign', id: 'camp1', campaignId: 'camp1' });
    expect(campaign.keepers.has('hb:local-x:mercader:intruso')).toBe(false);
    expect(campaign.keepers.has('hb:camp1:mercader:oficial')).toBe(true);
    expect(buildShopContext().keepers.has('hb:local-x:mercader:intruso')).toBe(true);
  });

  it('el mundo de la Tienda es exclusivo del DM', () => {
    const rules = normalizeRules({ homebrew: { mercader: 'propuestas', region: 'propuestas', dote: 'propuestas' } });
    expect(rules.homebrew.mercader).toBe('dm');
    expect(rules.homebrew.region).toBe('dm');
    expect(rules.homebrew.dote).toBe('propuestas');
    installPack({ id: 'campX', name: 'C', kind: 'campaign', role: 'jugador', rules, items: [] });
    const perms = permissionsFor({ campaign: { id: 'campX' } });
    expect(perms.homebrew.mercader).toBe(false);
    expect(perms.homebrew.dote).toBe(true);
  });

  it('assembleWorld sin Homebrew deja los datos oficiales intactos', () => {
    const out = assembleWorld(official, {});
    expect(out.keepers).toEqual(official.keepers);
    expect(out.world.regions.map((r) => r.id)).toEqual(worldData.regions.map((r) => r.id));
  });
});

describe('Contratación', () => {
  const ctx = buildShopContext();

  it('contratar, trasladar, llevar las cuentas, liquidar y despedir', () => {
    const c = hero();
    let world = createWorld(ctx, { seed: 'contrato' });
    world = talk.dmRemember(world, ctx, { charId: 'c1', keeperId: 'marla', type: 'helped' }).world;
    world = talk.dmRemember(world, ctx, { charId: 'c1', keeperId: 'marla', type: 'helped' }).world;
    const profile = characterProfile(c);
    const res = hiring.hire(world, ctx, { charId: 'c1', keeperId: 'marla', profile, character: c, location: 'puerta-este' });
    expect(res.error).toBeUndefined();
    expect(coinsInCp(res.character.equipment.coins)).toBe(coinsInCp(c.equipment.coins) - 2000);
    world = res.world;
    expect(keeperLocation(world, ctx, ctx.keepers.get('marla'))).toBe('puerta-este');
    expect(hiring.hireTerms(world, ctx, { keeper: ctx.keepers.get('marla'), charId: 'c2', profile }).reason).toMatch(/otra persona/);
    world = advanceDays(world, ctx, 5).world;
    const contract = hiring.contractOf(world, 'marla');
    expect(contract.log.length).toBe(5);
    expect(contract.balance).not.toBe(0);
    expect(hiring.dismiss(world, ctx, { charId: 'c1', keeperId: 'marla' }).error).toBeTruthy();
    const settled = hiring.settle(world, ctx, { charId: 'c1', keeperId: 'marla', character: res.character });
    expect(settled.error).toBeUndefined();
    expect(coinsInCp(settled.character.equipment.coins) - coinsInCp(res.character.equipment.coins)).toBe(contract.balance);
    const out = hiring.dismiss(settled.world, ctx, { charId: 'c1', keeperId: 'marla' });
    expect(out.error).toBeUndefined();
    expect(keeperLocation(out.world, ctx, ctx.keepers.get('marla'))).toBe('plaza-mayor');
  });

  it('el contrato puede añadir productos al catálogo, y no se contrata a quien no quiere', () => {
    const c = hero();
    let world = createWorld(ctx, { seed: 'productos' });
    world = talk.dmRemember(world, ctx, { charId: 'c1', keeperId: 'pim', type: 'helped' }).world;
    world = talk.dmRemember(world, ctx, { charId: 'c1', keeperId: 'pim', type: 'helped' }).world;
    world = hiring.hire(world, ctx, { charId: 'c1', keeperId: 'pim', profile: characterProfile(c), character: c }).world;
    world = hiring.setProducts(world, ctx, { charId: 'c1', keeperId: 'pim', products: ['#especia'] }).world;
    world = advanceDays(world, ctx, 1).world;
    expect(Object.keys(world.shops.engranajes.stock).some((id) => ctx.item(id).tags?.includes('especia'))).toBe(true);
    expect(hiring.hireTerms(world, ctx, { keeper: ctx.keepers.get('gorvan'), charId: 'c1', profile: characterProfile(c) }).available).toBe(false);
  });

  it('si no se le paga, acaba renunciando y lo recuerda', () => {
    const c = hero();
    let world = createWorld(ctx, { seed: 'impago' });
    world = cloneWorld(world);
    world.relations.c1 = { grishka: { ...getRelation(world, 'c1', 'grishka'), rep: 100 } };
    world = talk.dmRemember(world, ctx, { charId: 'c1', keeperId: 'grishka', type: 'saved-relative' }).world;
    const res = hiring.hire(world, ctx, { charId: 'c1', keeperId: 'grishka', profile: characterProfile(c), character: c, location: 'plaza-mayor' });
    expect(res.error).toBeUndefined();
    world = res.world;
    world.contracts.grishka.wage = 50000; // un salario que su puesto no cubre
    for (let i = 0; i < 5 && hiring.contractOf(world, 'grishka'); i++) world = advanceDays(world, ctx, 20).world;
    expect(hiring.contractOf(world, 'grishka')).toBeNull();
    expect(getRelation(world, 'c1', 'grishka').memory['promise-broken'].n).toBeGreaterThan(0);
  });
});
