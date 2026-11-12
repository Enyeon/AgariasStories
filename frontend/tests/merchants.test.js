// Comerciantes como PNJ: disposición, presencia, memoria, conversación,
// facciones, economía regional y eventos.
import { describe, it, expect } from 'vitest';
import { createCharacter } from '../src/domain/schema.js';
import { createWorld, advanceDays, advancePhase, triggerEvent, endEvent } from '../src/domain/shop/simulation.js';
import { quoteBuy } from '../src/domain/shop/pricing.js';
import { buy } from '../src/domain/shop/transactions.js';
import { ownedUnits } from '../src/domain/shop/inventory.js';
import { evaluateDisposition, tierOf } from '../src/domain/shop/disposition.js';
import { raceFamilies } from '../src/domain/shop/profile.js';
import { availability, errantPosition, travel, playerLocation, visibleMap, merchantsAt } from '../src/domain/shop/presence.js';
import { migrateWorld, getRelation } from '../src/domain/shop/state.js';
import * as talk from '../src/domain/shop/talk.js';
import { startNegotiation } from '../src/domain/shop/negotiation.js';
import { buildShopContext, characterProfile } from '../src/services/shop.js';
import { coinsInCp } from '../src/domain/money.js';
import racesData from '../src/data/shop/races.json';
import { createDocument } from '../src/domain/schema.js';
import { parseDocument } from '../src/domain/validation.js';
import { fingerprint } from '../src/services/characters.js';
import { setOrigin, toggleFaction } from '../src/domain/affiliations.js';
import { validateContent } from '../src/content/schema.js';
import { homebrewMerchants } from '../src/domain/shop/sources.js';
import { createShopContext } from '../src/domain/shop/context.js';

const ctx = buildShopContext();

function hero({ race = 'Humano', classKey = null, background = null, gp = 200, factions = [], origin = null } = {}) {
  const c = createCharacter();
  c.identity.name = 'Aria';
  c.race.key = race;
  if (classKey) c.levels = [{ classKey, hpRoll: 10, improvement: null, featureChoices: {} }];
  if (background) c.background = { ...c.background, source: 'official', key: background };
  if (factions.length || origin) c.affiliations = { origin, factions: factions.map((id) => ({ id })) };
  c.equipment.coins = { cp: 0, sp: 0, gp, pp: 0 };
  return c;
}
const keeper = (id) => ctx.keepers.get(id);
const disp = (world, id, character, charId = 'c1') => evaluateDisposition(world, ctx, { keeper: keeper(id), charId, profile: characterProfile(character) });
const skills = (c, mods = {}) => ({ ...c, skills: { persuasion: 0, deception: 0, insight: 0, investigation: 0, performance: 0, sleight: 0, ...mods } });

describe('Comerciantes · datos', () => {
  it('todas las referencias (ubicaciones, facciones, arquetipos) son válidas', () => {
    expect(ctx.problems).toEqual([]);
    expect(ctx.keepers.size).toBeGreaterThanOrEqual(13);
    for (const shop of ctx.shopList) expect(ctx.keepers.has(shop.keeperId)).toBe(true);
  });

  it('las familias de razas distinguen semielfos, drow y enanos', () => {
    const f = (name) => raceFamilies(name, racesData.families);
    expect(f('Enano de las Colinas')).toContain('enano');
    expect(f('Medio Elfo')).toEqual(['semielfo']);
    expect(f('Elfo (Draw)')).toEqual(expect.arrayContaining(['elfo', 'drow']));
    expect(f('Medio Orco')).toEqual(['semiorco']);
    expect(f('Tiflin (Asmodeo)')).toEqual(['tiefling']);
  });
});

describe('Comerciantes · disposición', () => {
  const world = createWorld(ctx, { seed: 'disp' });

  it('los prejuicios son de cada comerciante, no de la raza: dos enanos tratan distinto a un elfo', () => {
    const elf = hero({ race: 'Alto Elfo' });
    const thrain = disp(world, 'thrain', elf);
    const gorvan = disp(world, 'gorvan', elf);
    const marla = disp(world, 'marla', elf);
    expect(thrain.score).toBeLessThan(gorvan.score);
    expect(gorvan.score).toBeLessThan(marla.score);
    // El prejuicio de Thrain está oculto: el jugador sólo ve que «algo le incomoda».
    const reason = thrain.reasons.find((r) => r.source === 'actitud');
    expect(reason.hidden).toBe(true);
    const summary = talk.merchantSummary(world, ctx, { keeperId: 'thrain', charId: 'c1', profile: characterProfile(elf) });
    expect(summary.reasons.find((r) => r.source === 'actitud').label).toBe('Algo en ti le incomoda');
  });

  it('la afinidad de raza da mejor trato y desbloquea productos', () => {
    const dwarf = hero({ race: 'Enano de las Montañas' });
    const d = disp(world, 'thrain', dwarf);
    expect(d.score).toBeGreaterThan(20);
    expect(d.unlocks.has('armadura-placas')).toBe(true);
    const human = disp(world, 'thrain', hero());
    expect(human.unlocks.has('armadura-placas')).toBe(false);
    const q = (character) => quoteBuy(world, ctx, { shopId: 'karak', itemId: 'armadura-placas', charId: 'c1', profile: characterProfile(character) });
    expect(q(dwarf).locked).toBeNull();
    expect(q(hero()).locked).toBeTruthy();
  });

  it('el trasfondo sólo cuenta cuando se lo cuentas', () => {
    const soldier = hero({ background: 'soldado' });
    const before = disp(world, 'hilde', soldier);
    const told = talk.tell(world, ctx, { charId: 'c1', keeperId: 'hilde', profile: characterProfile(soldier), topic: 'background' });
    expect(told.error).toBeUndefined();
    const after = evaluateDisposition(told.world, ctx, { keeper: keeper('hilde'), charId: 'c1', profile: characterProfile(soldier) });
    expect(after.score).toBeGreaterThan(before.score + 10);
    expect(told.result.lines.some((l) => l.who === 'keeper')).toBe(true);
  });

  it('una facción rival hace que se niegue a comerciar', () => {
    const guard = hero({ factions: ['guardia-norte'] });
    const told = talk.tell(world, ctx, { charId: 'c1', keeperId: 'vex', profile: characterProfile(guard), topic: 'faction:guardia-norte' });
    const d = evaluateDisposition(told.world, ctx, { keeper: keeper('vex'), charId: 'c1', profile: characterProfile(guard) });
    expect(d.refuses).toBeTruthy();
    const res = buy(told.world, ctx, { charId: 'c1', shopId: 'callejon', itemId: Object.keys(told.world.shops.callejon.stock)[0], qty: 1, character: guard, profile: characterProfile(guard) });
    expect(res.reason).toBe('refused');
  });

  it('la reputación con la facción del comerciante cambia el precio', () => {
    const c = hero();
    const itemId = Object.keys(world.shops.intendencia.stock).filter((id) => !world.shops.intendencia.stock[id].requires).sort((a, b) => ctx.item(b).price - ctx.item(a).price)[0];
    const base = quoteBuy(world, ctx, { shopId: 'intendencia', itemId, charId: 'c1', profile: characterProfile(c) }).listUnit;
    const good = talk.setStanding(world, ctx, { charId: 'c1', factionId: 'guardia-norte', value: 80 }).world;
    const better = quoteBuy(good, ctx, { shopId: 'intendencia', itemId, charId: 'c1', profile: characterProfile(c) }).listUnit;
    expect(better).toBeLessThan(base);
  });

  it('niveles de relación de Hostil a Amigo', () => {
    expect(tierOf(-80).id).toBe('hostil');
    expect(tierOf(-30).id).toBe('desconfiado');
    expect(tierOf(0).id).toBe('neutral');
    expect(tierOf(30).id).toBe('amistoso');
    expect(tierOf(60).id).toBe('favorable');
    expect(tierOf(90).id).toBe('amigo');
  });

  it('una comerciante inicialmente hostil puede convertirse en aliada', () => {
    const c = hero();
    expect(disp(world, 'grishka', c).tier.id).toMatch(/hostil|desconfiado/);
    const helped = talk.dmRemember(world, ctx, { charId: 'c1', keeperId: 'grishka', type: 'helped', note: 'Recuperó su pico' }).world;
    expect(disp(helped, 'grishka', c).score).toBeGreaterThan(disp(world, 'grishka', c).score + 30);
  });
});

describe('Comerciantes · presencia y horarios', () => {
  const world = createWorld(ctx, { seed: 'presencia' });

  it('cada comerciante está en su sitio y atiende en su horario', () => {
    expect(availability(world, ctx, keeper('gorvan'))).toMatchObject({ location: 'barrio-fraguas', open: true });
    const night = { ...world, phase: 3 };
    expect(availability(night, ctx, keeper('gorvan')).open).toBe(false);
    expect(availability(night, ctx, keeper('vex')).open).toBe(true);
    expect(availability(world, ctx, keeper('vex')).open).toBe(false);
  });

  it('para comerciar hay que ir a su ubicación', () => {
    const c = hero();
    const itemId = Object.keys(world.shops.yunque.stock).find((id) => world.shops.yunque.stock[id].qty > 0 && !world.shops.yunque.stock[id].requires);
    expect(playerLocation(world, ctx, 'c1')).toBe('plaza-mayor');
    const far = buy(world, ctx, { charId: 'c1', shopId: 'yunque', itemId, qty: 1, character: c, here: playerLocation(world, ctx, 'c1') });
    expect(far.reason).toBe('absent');
    const moved = travel(world, ctx, { charId: 'c1', locationId: 'barrio-fraguas' }).world;
    const near = buy(moved, ctx, { charId: 'c1', shopId: 'yunque', itemId, qty: 1, character: c, here: playerLocation(moved, ctx, 'c1') });
    expect(near.error).toBeUndefined();
    expect(ownedUnits(near.character, ctx.item(itemId))).toBe(1);
  });

  it('el errante viaja entre regiones de forma determinista y a veces no está', () => {
    const zahra = keeper('zahra');
    const places = new Set();
    let away = 0;
    for (let d = 1; d <= 40; d++) {
      const pos = errantPosition('presencia', zahra, d);
      expect(errantPosition('presencia', zahra, d)).toEqual(pos);
      if (pos.location) places.add(pos.location);
      else away++;
    }
    expect(places.size).toBeGreaterThanOrEqual(3);
    expect(away).toBeGreaterThan(0);
  });

  it('los lugares ocultos no aparecen hasta descubrirlos', () => {
    const names = (w) => visibleMap(w, ctx, 'c1').flatMap((r) => r.locations.map((l) => l.id));
    expect(names(world)).not.toContain('sotano-jabali');
    expect(travel(world, ctx, { charId: 'c1', locationId: 'sotano-jabali' }).error).toBeTruthy();
  });

  it('la comerciante de feria sólo viene con su evento', () => {
    const fixed = { ...world, events: [] };
    expect(merchantsAt(fixed, ctx, 'plaza-mayor', 'c1').map((m) => m.keeper.id)).not.toContain('bertilda');
    const fest = triggerEvent(fixed, ctx, 'festival-cosecha', 5).world;
    expect(merchantsAt(fest, ctx, 'plaza-mayor', 'c1').map((m) => m.keeper.id)).toContain('bertilda');
    expect(endEvent(fest, ctx, 'festival-cosecha').world.events.some((e) => e.id === 'festival-cosecha')).toBe(false);
  });

  it('las franjas avanzan y tras la noche empieza otro día', () => {
    let w = { ...world, phase: 2 };
    w = advancePhase(w, ctx).world;
    expect(w.phase).toBe(3);
    const next = advancePhase(w, ctx);
    expect(next.newDay).toBe(true);
    expect(next.world.day).toBe(world.day + 1);
    expect(next.world.phase).toBe(0);
  });
});

describe('Comerciantes · economía regional', () => {
  it('el metal es más barato en los montes que en la costa', () => {
    const world = createWorld(ctx, { seed: 'region' });
    const itemId = Object.keys(world.shops.karak.stock).find((id) => ctx.item(id).tags.includes('metal'));
    const karak = quoteBuy(world, ctx, { shopId: 'karak', itemId, charId: null });
    expect(karak.factors.find((f) => f.key === 'region:montes').pct).toBeLessThan(0);
    const fuerte = quoteBuy(world, ctx, { shopId: 'intendencia', itemId: Object.keys(world.shops.intendencia.stock).find((id) => ctx.item(id).category === 'armas'), charId: null });
    expect(fuerte.factors.find((f) => f.key === 'region:marca').pct).toBeGreaterThan(0);
  });
});

describe('Comerciantes · conversación y memoria', () => {
  const base = createWorld(ctx, { seed: 'charla' });
  const world = { ...base, phase: 2 }; // anochecer: Marla atiende y acepta invitaciones

  it('invitar a una jarra cuesta dinero y mejora la relación; pagar primero la mejora más', () => {
    const c = skills(hero());
    // Subimos la relación con Marla para que invite ella.
    const friendly = talk.dmRemember(world, ctx, { charId: 'c1', keeperId: 'marla', type: 'helped' }).world;
    const offers = talk.merchantSummary(friendly, ctx, { keeperId: 'marla', charId: 'c1', profile: characterProfile(c) }).offers;
    const invited = offers.some((o) => o.id === 'drink-invite');
    const plain = talk.drink(friendly, ctx, { charId: 'c1', keeperId: 'marla', profile: characterProfile(c), character: c, accept: invited });
    const payFirst = talk.drink(friendly, ctx, { charId: 'c1', keeperId: 'marla', profile: characterProfile(c), character: c, accept: invited, payFirst: invited });
    expect(plain.error).toBeUndefined();
    expect(payFirst.result.after).toBeGreaterThanOrEqual(plain.result.after);
    if (invited) expect(getRelation(payFirst.world, 'c1', 'marla').memory['paid-round'].n).toBe(1);
    expect(coinsInCp(payFirst.character.equipment.coins)).toBe(coinsInCp(c.equipment.coins) - talk.DRINK_COST);
    expect(talk.drink(payFirst.world, ctx, { charId: 'c1', keeperId: 'marla', profile: characterProfile(c), character: c }).error).toBeTruthy();
  });

  it('los regalos que le gustan valen más', () => {
    const c = skills(hero());
    c.equipment.items = [{ name: 'Cerveza', quantity: 2, ref: 'cerveza' }, { name: 'Libro', quantity: 1, ref: 'libro' }];
    const thrainWorld = travel(world, ctx, { charId: 'c1', locationId: 'karak-dum' }).world;
    const beer = talk.gift(thrainWorld, ctx, { charId: 'c1', keeperId: 'thrain', profile: characterProfile(c), character: c, itemId: 'cerveza' });
    expect(beer.error).toBeUndefined();
    expect(beer.result.appeal).toBeGreaterThan(1.5);
    expect(ownedUnits(beer.character, ctx.item('cerveza'))).toBe(1);
    expect(getRelation(beer.world, 'c1', 'thrain').memory.gift.n).toBe(1);
  });

  it('mentir: si te pillan, lo recuerda; si cuela, te trata según la mentira', () => {
    const c = skills(hero(), { deception: 10 });
    const ok = talk.lie(world, ctx, { charId: 'c1', keeperId: 'vex', profile: characterProfile(c), character: c, topic: 'faction', value: 'mano-gris', roll: 15 });
    expect(getRelation(ok.world, 'c1', 'vex').claims.factions).toContain('mano-gris');
    expect(ok.result.after).toBeGreaterThan(ok.result.before);
    const bad = talk.lie(world, ctx, { charId: 'c1', keeperId: 'vex', profile: characterProfile(skills(hero())), character: skills(hero()), topic: 'faction', value: 'mano-gris', roll: 1 });
    expect(getRelation(bad.world, 'c1', 'vex').memory.lied.n).toBe(1);
    expect(bad.result.after).toBeLessThan(bad.result.before);
  });

  it('los rumores dependen de la confianza; el codicioso los vende', () => {
    const c = skills(hero());
    const gossip = talk.askRumor(world, ctx, { charId: 'c1', keeperId: 'marla', profile: characterProfile(c), character: c });
    expect(gossip.error).toBeUndefined();
    expect(talk.journalOf(gossip.world, ctx, 'c1').length).toBe(1);
    // Vex no se fía de un desconocido, pero vende lo que sabe.
    const night = { ...world, phase: 3 };
    const refused = talk.askRumor(night, ctx, { charId: 'c1', keeperId: 'vex', profile: characterProfile(c), character: c });
    expect(refused.result.canPay).toBe(true);
    const paid = talk.askRumor(refused.world, ctx, { charId: 'c1', keeperId: 'vex', profile: characterProfile(c), character: c, pay: true });
    expect(paid.error).toBeUndefined();
    expect(coinsInCp(paid.character.equipment.coins)).toBeLessThan(coinsInCp(c.equipment.coins));
    // El rumor del sótano descubre una ubicación oculta.
    const j = talk.journalOf(paid.world, ctx, 'c1');
    if (j.some((x) => x.rumorId === 'sotano-jabali')) {
      expect(visibleMap(paid.world, ctx, 'c1').flatMap((r) => r.locations.map((l) => l.id))).toContain('sotano-jabali');
    }
  });

  it('favores: aceptar, entregar y recibir la recompensa; el plazo vencido rompe la promesa', () => {
    const c = skills(hero());
    c.equipment.items = [{ name: 'Tinta', quantity: 2, ref: 'tinta' }];
    const w = { ...world, phase: 1 };
    const acc = talk.acceptFavor(w, ctx, { charId: 'c1', keeperId: 'ilvaris', profile: characterProfile(c), character: c, favorId: 'ilvaris-tinta' });
    expect(acc.error).toBeUndefined();
    const done = talk.deliverFavor(acc.world, ctx, { charId: 'c1', keeperId: 'ilvaris', profile: characterProfile(c), character: c, favorId: 'ilvaris-tinta' });
    expect(done.error).toBeUndefined();
    expect(getRelation(done.world, 'c1', 'ilvaris').favors['ilvaris-tinta'].status).toBe('done');
    expect(coinsInCp(done.character.equipment.coins)).toBe(coinsInCp(c.equipment.coins) + 500);
    expect(done.result.after).toBeGreaterThan(done.result.before);

    const late = advanceDays(acc.world, ctx, 12).world;
    const rel = getRelation(late, 'c1', 'ilvaris');
    expect(rel.favors['ilvaris-tinta'].status).toBe('failed');
    expect(rel.memory['promise-broken'].n).toBe(1);
  });

  it('robar: si te pillan, no te vende durante una semana', () => {
    const c = skills(hero());
    const w = { ...world, phase: 1 };
    const itemId = Object.keys(w.shops.linterna.stock).find((id) => ctx.item(id).price < 500 && w.shops.linterna.stock[id].qty > 0 && !w.shops.linterna.stock[id].unlimited);
    const caught = talk.steal(w, ctx, { charId: 'c1', keeperId: 'marla', profile: characterProfile(c), character: c, itemId, roll: 1 });
    expect(getRelation(caught.world, 'c1', 'marla').memory.stole.n).toBe(1);
    const d = evaluateDisposition(caught.world, ctx, { keeper: keeper('marla'), charId: 'c1', profile: characterProfile(c) });
    expect(d.refuses).toMatch(/robando/);
    const clean = talk.steal(w, ctx, { charId: 'c1', keeperId: 'marla', profile: characterProfile(c), character: c, itemId, roll: 20 });
    expect(ownedUnits(clean.character, ctx.item(itemId))).toBe(1);
    expect(talk.merchantSummary(clean.world, ctx, { keeperId: 'marla', charId: 'c1', profile: characterProfile(c) }).relation.memory['stole-unnoticed'].n).toBe(1);
  });

  it('los secretos se descubren investigando y pueden revelar su identidad', () => {
    const c = skills(hero(), { investigation: 10 });
    let w = { ...world, phase: 3 };
    w = { ...w, discovered: { c1: { locations: ['sotano-jabali'], keepers: [] } } };
    w = travel(w, ctx, { charId: 'c1', locationId: 'sotano-jabali' }).world;
    const before = talk.merchantSummary(w, ctx, { keeperId: 'coleccionista', charId: 'c1', profile: characterProfile(c) });
    expect(before.keeper.name).toBe('El Coleccionista');
    const res = talk.secret(w, ctx, { charId: 'c1', keeperId: 'coleccionista', profile: characterProfile(c), character: c, secretId: 'aurelio-identidad', roll: 18, here: 'sotano-jabali' });
    expect(res.error).toBeUndefined();
    const after = talk.merchantSummary(res.world, ctx, { keeperId: 'coleccionista', charId: 'c1', profile: characterProfile(c) });
    expect(after.keeper.name).toBe('Lord Aurelio Venn');
  });

  it('leer al comerciante descubre sus prejuicios ocultos', () => {
    const elf = skills(hero({ race: 'Alto Elfo' }), { insight: 10 });
    const w = travel(world, ctx, { charId: 'c1', locationId: 'karak-dum' }).world;
    const res = talk.read({ ...w, phase: 1 }, ctx, { charId: 'c1', keeperId: 'thrain', profile: characterProfile(elf), character: elf, roll: 19 });
    expect(res.result.learned.length).toBeGreaterThan(0);
    const s = talk.merchantSummary(res.world, ctx, { keeperId: 'thrain', charId: 'c1', profile: characterProfile(elf) });
    expect(s.reasons.find((r) => r.source === 'actitud').masked).toBeFalsy();
  });
});

describe('Comerciantes · negociación influida', () => {
  it('un comerciante hostil no regatea; el trato fluye en la apertura', () => {
    const world = createWorld(ctx, { seed: 'neg' });
    const elf = hero({ race: 'Alto Elfo' });
    const dwarf = hero({ race: 'Enano de las Colinas' });
    const itemId = Object.keys(world.shops.karak.stock).find((id) => world.shops.karak.stock[id].qty > 1 && ctx.item(id).price >= 1000 && !world.shops.karak.stock[id].requires);
    const s1 = startNegotiation(world, ctx, { charId: 'c1', shopId: 'karak', itemId, side: 'buy', qty: 1, profile: characterProfile(elf) });
    const s2 = startNegotiation(world, ctx, { charId: 'c1', shopId: 'karak', itemId, side: 'buy', qty: 1, profile: characterProfile(dwarf) });
    expect(s2.session.mood).toBeGreaterThan(s1.session.mood);
    expect(s2.session.list).toBeLessThan(s1.session.list);
    const orc = hero({ race: 'Orco' });
    expect(startNegotiation(world, ctx, { charId: 'c1', shopId: 'karak', itemId, side: 'buy', qty: 1, profile: characterProfile(orc) }).reason).toBe('refuses');
  });
});

describe('Comerciantes · compatibilidad', () => {
  it('origen y facciones: opcional, validado y sin cambiar la huella de fichas antiguas', () => {
    const c = createCharacter();
    const before = fingerprint(c);
    const empty = parseDocument(createDocument({ ...c, affiliations: { origin: '', factions: [] } })).character;
    expect(empty.affiliations).toBeUndefined();
    expect(fingerprint(empty)).toBe(before);
    setOrigin(c, 'montes');
    toggleFaction(c, 'clan-yunque', true);
    toggleFaction(c, 'clan-yunque', true);
    const back = parseDocument(createDocument({ ...c, affiliations: { ...c.affiliations, factions: [...c.affiliations.factions, { id: 'MAL ID' }] } })).character;
    expect(back.affiliations).toEqual({ origin: 'montes', factions: [{ id: 'clan-yunque' }] });
    toggleFaction(c, 'clan-yunque', false);
    setOrigin(c, '');
    expect(c.affiliations).toBeUndefined();
  });

  it('un mundo v1 se migra a v2 sin perder nada', () => {
    const world = createWorld(ctx, { seed: 'v1' });
    const v1 = { ...world, version: 1 };
    delete v1.phase; delete v1.positions; delete v1.discovered; delete v1.standing; delete v1.journal; delete v1.settings;
    v1.relations = { c1: { gorvan: { rep: 20, known: { likes: [], dislikes: [], traits: [] }, gainedDay: 0, gainedToday: 0, noHaggleUntil: 0, deals: 2 } } };
    const m = migrateWorld(v1);
    expect(m.version).toBe(2);
    expect(m.phase).toBe(0);
    expect(getRelation(m, 'c1', 'gorvan')).toMatchObject({ rep: 20, deals: 2, memory: {} });
  });
});

describe('Comerciantes · Homebrew', () => {
  it('un comerciante Homebrew se valida y se convierte en vendedor + tienda sin código nuevo', () => {
    const { item, errors } = validateContent('mercader', {
      name: 'Odette Lunaria', location: 'puerto-salitre', race: 'elfo', archetypes: ['amable', 'inventado'], sells: ['equipo', 'xx'], buys: ['equipo'],
      attitudes: [{ kind: 'race', target: 'Enano', value: '-20', label: 'No soporta a los enanos', hidden: 'si' }, { kind: 'nope', target: 'x', value: 5 }],
      rumors: ['El faro está encantado.'], knows: ['lugares'], traits: { greed: 8 },
    });
    expect(errors).toEqual([]);
    expect(item.archetypes).toEqual(['amable']);
    expect(item.sells).toEqual(['equipo']);
    expect(item.attitudes).toEqual([{ kind: 'race', target: 'Enano', value: -20, label: 'No soporta a los enanos', hidden: true, effect: 'none', item: null }]);
    expect(validateContent('mercader', { name: 'Sin sitio', sells: ['equipo'] }).errors.length).toBe(1);

    const ref = 'hb:local:mercader:odette';
    const extra = homebrewMerchants([{ ref, item }], { regionOf: () => 'costa' });
    expect(extra.keepers[0]).toMatchObject({ id: ref, presence: { location: 'puerto-salitre' }, knows: { regions: ['costa'] } });
    expect(extra.keepers[0].attitudes[0].when).toEqual({ race: 'enano' });
    const full = buildShopContext();
    const c2 = createShopContext({
      catalog: full.catalog, shops: [...full.shopList, ...extra.shops], keepers: [...full.keepers.values()].map((k) => ({ ...k, traits: k.baseTraits ?? k.traits })).concat(extra.keepers),
      events: [...full.events.values()], world: { regions: [...full.regions.values()], phases: full.phases, start: full.startLocation }, factions: [...full.factions.values()],
      archetypes: [...full.archetypes.values()], raceFamilies: full.raceFamilies, rumors: [...full.rumors.values(), ...extra.rumors], dialogue: full.dialogue, topics: [...full.topics.values()],
    });
    expect(c2.problems).toEqual([]);
    const world = createWorld(c2, { seed: 'hb' });
    expect(Object.keys(world.shops[`${ref}/tienda`].stock).length).toBeGreaterThan(0);
    expect(merchantsAt(world, c2, 'puerto-salitre', 'c1').map((m) => m.keeper.id)).toContain(ref);
    const dwarf = evaluateDisposition(world, c2, { keeper: c2.keepers.get(ref), charId: 'c1', profile: characterProfile(hero({ race: 'Enano de las Colinas' })) });
    expect(dwarf.reasons.some((r) => r.hidden && r.value === -20)).toBe(true);
  });
});
