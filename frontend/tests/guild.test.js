// Gremio de aventureros (Lord 100): un Gremio por piso, misiones, licencias y servicios.
import { describe, it, expect } from 'vitest';
import { buildShopContext } from '../src/services/shop.js';
import { createWorld, reconcileWorld } from '../src/domain/shop/simulation.js';
import * as floors from '../src/domain/shop/floors.js';
import * as guild from '../src/domain/shop/guild.js';
import { guildProfile, lord100Content } from '../src/content/lord100.js';
import { createCharacter } from '../src/domain/schema.js';
import { coinsInCp } from '../src/domain/money.js';

const ctx = buildShopContext({ world: 'lord100' });
const agarias = buildShopContext({ world: 'agarias' });

function at(floor) {
  const w = createWorld(ctx, { seed: 'gremio', warmupDays: 0 });
  return reconcileWorld(floors.setFloor(w, ctx, floor).world, ctx);
}
function hero(name, gp, level = 1) {
  const c = createCharacter();
  c.identity.name = name;
  c.equipment.coins.gp = gp;
  c.levels = Array.from({ length: level }, () => ({ classKey: 'guerrero', hpRoll: 10, improvement: null, featureChoices: {} }));
  return c;
}
const g1 = () => guild.guildOnFloor(ctx, 1);

describe('Un Gremio en cada piso', () => {
  it('los 99 pisos tienen su Gremio, con tamaño según el piso', () => {
    const guilds = lord100Content().mercader.filter((m) => m.item.profession === 'gremio');
    expect(guilds).toHaveLength(99);
    for (let f = 1; f <= 99; f++) expect(guild.guildOnFloor(ctx, f)?.floor).toBe(f);
    expect(guildProfile(1).prestige).toBe(3);
    expect(guildProfile(6).prestige).toBe(2);
    expect(guildProfile(7).prestige).toBe(1);
    // Los rangos habituales suben con la Torre: F abajo, SSS arriba.
    expect(guildProfile(2).rankMin).toBe(0);
    expect(guildProfile(95).rankMax).toBe(8);
    expect(guildProfile(95).rankMin).toBeGreaterThan(guildProfile(2).rankMax);
  });

  it('no existe fuera de la Torre ni da acceso a pisos superiores', () => {
    expect(agarias.guild).toBeNull();
    const w = at(1);
    expect(floors.currentFloor(w)).toBe(1);
    // El Gremio del piso 3 no está abierto mientras la Torre siga en el piso 1.
    expect(floors.locationUnlocked(w, ctx, guild.guildOnFloor(ctx, 3).profile.location)).toBe(false);
  });
});

describe('Tablón de misiones', () => {
  it('genera misiones del Gremio por semana, con rango, requisitos, recompensa y condiciones', () => {
    const w = at(1);
    const list = guild.board(w, ctx, g1(), { charId: 'a' });
    expect(list).toHaveLength(g1().prestige.board);
    for (const q of list) {
      expect(['F', 'E', 'D']).toContain(q.rank);
      expect(q.reward).toBeGreaterThan(0);
      expect(q.title).not.toMatch(/\{|\}/);
      expect(q.conditions.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(guild.board(w, ctx, g1()))).toBe(JSON.stringify(guild.board(w, ctx, g1())));
    expect(w.guild).toBeUndefined(); // no ocupa espacio hasta que alguien acepta
  });

  it('aceptar exige licencia del rango (las F no)', () => {
    let w = at(1);
    const list = guild.board(w, ctx, g1(), { charId: 'a' });
    const f = list.find((q) => q.rank === 'F');
    const hard = list.find((q) => q.rank !== 'F');
    if (f) {
      const r = guild.acceptQuest(w, ctx, { shopId: g1().shopId, questId: f.id, charId: 'a', charName: 'Aria' });
      expect(r.error).toBeUndefined();
      w = r.world;
      expect(w.guild.quests[0].takers[0].name).toBe('Aria');
    }
    if (hard) {
      expect(guild.acceptQuest(w, ctx, { shopId: g1().shopId, questId: hard.id, charId: 'b', charName: 'Bo' }).error).toMatch(/licencia/);
      w = guild.setLicenseRank(w, ctx, { charId: 'b', rankId: 'SSS' }).world;
      expect(guild.acceptQuest(w, ctx, { shopId: g1().shopId, questId: hard.id, charId: 'b', charName: 'Bo' }).error).toBeUndefined();
    }
  });

  it('misión PJ: depósito + comisión, otro la acepta, se completa y cada uno cobra', () => {
    let w = at(1);
    const poster = hero('Aria', 100);
    const pub = guild.publishQuest(w, ctx, { shopId: g1().shopId, charId: 'a', charName: 'Aria', character: poster, form: { title: 'Escolta a la Pradera', kind: 'escoltar', rank: 'F', reward: 4000, maxTakers: 2 } });
    expect(pub.error).toBeUndefined();
    const fee = Math.ceil(4000 * g1().prestige.commission);
    expect(coinsInCp(pub.character.equipment.coins)).toBe(10000 - 4000 - fee);
    w = pub.world;
    const id = pub.quest.id;
    expect(guild.acceptQuest(w, ctx, { shopId: g1().shopId, questId: id, charId: 'a', charName: 'Aria' }).error).toMatch(/propia/);
    expect(guild.publishQuest(w, ctx, { shopId: g1().shopId, charId: 'a', charName: 'Aria', character: poster, form: { title: 'Barata', rank: 'C', reward: 10 } }).error).toMatch(/mínimo/);
    w = guild.acceptQuest(w, ctx, { shopId: g1().shopId, questId: id, charId: 'b', charName: 'Bo' }).world;
    w = guild.acceptQuest(w, ctx, { shopId: g1().shopId, questId: id, charId: 'c', charName: 'Cy' }).world;
    expect(guild.acceptQuest(w, ctx, { shopId: g1().shopId, questId: id, charId: 'd', charName: 'Di' }).error).toMatch(/más aventureros/);
    // Sólo quien la publicó (o el DM) la cierra; no se puede retirar con gente dentro.
    expect(guild.resolveQuest(w, ctx, { questId: id, outcome: 'completada', charId: 'b' }).error).toBeTruthy();
    expect(guild.cancelQuest(w, ctx, { questId: id, charId: 'a', character: poster }).error).toMatch(/aventureros/);
    w = guild.resolveQuest(w, ctx, { questId: id, outcome: 'completada', charId: 'a' }).world;
    const bo = guild.claimQuest(w, ctx, { questId: id, charId: 'b', charName: 'Bo', character: hero('Bo', 0) });
    expect(coinsInCp(bo.character.equipment.coins)).toBe(2000);
    w = bo.world;
    expect(guild.claimQuest(w, ctx, { questId: id, charId: 'b', character: hero('Bo', 0) }).error).toMatch(/nada que cobrar/);
    expect(guild.licenseOf(w, 'b')).toMatchObject({ completed: 1, points: 1 });
  });

  it('retirar una misión sin aventureros devuelve el depósito (no la comisión)', () => {
    const poster = hero('Aria', 100);
    const pub = guild.publishQuest(at(1), ctx, { shopId: g1().shopId, charId: 'a', charName: 'Aria', character: poster, form: { title: 'Nadie viene', rank: 'F', reward: 2000 } });
    const r = guild.cancelQuest(pub.world, ctx, { questId: pub.quest.id, charId: 'a', character: pub.character });
    expect(coinsInCp(r.character.equipment.coins)).toBe(10000 - Math.ceil(2000 * g1().prestige.commission));
    expect(r.world.guild.quests[0].status).toBe('cancelada');
  });

  it('las misiones del Gremio sólo las da por cumplidas el DM', () => {
    let w = at(1);
    const q = guild.board(w, ctx, g1()).find((x) => x.rank === 'F') ?? guild.board(w, ctx, g1())[0];
    w = guild.setLicenseRank(w, ctx, { charId: 'a', rankId: 'SSS' }).world;
    w = guild.acceptQuest(w, ctx, { shopId: g1().shopId, questId: q.id, charId: 'a', charName: 'Aria' }).world;
    expect(guild.resolveQuest(w, ctx, { questId: q.id, outcome: 'completada', charId: 'a' }).error).toMatch(/DM/);
    w = guild.resolveQuest(w, ctx, { questId: q.id, outcome: 'completada', isDm: true }).world;
    const res = guild.claimQuest(w, ctx, { questId: q.id, charId: 'a', character: hero('Aria', 0) });
    expect(coinsInCp(res.character.equipment.coins)).toBe(q.reward);
  });
});

describe('Licencias', () => {
  it('el examen pide nivel, se aprueba o suspende y respeta la espera', () => {
    const w = at(1);
    expect(guild.evaluationEligibility(w, ctx, { charId: 'a', rankId: 'C', level: 3 }).reason).toMatch(/nivel 5/);
    expect(guild.evaluationEligibility(w, ctx, { charId: 'a', rankId: 'C', level: 5 }).ok).toBe(true);
    const exam = guild.evaluationFor(w, ctx, { charId: 'a', rankId: 'F' });
    expect(exam.questions).toHaveLength(2);
    expect(exam.questions[0]).not.toHaveProperty('best');
    expect(exam.tests).toHaveLength(2);
    const best = exam.questions.map((q) => ctx.guild.data.evaluation.questions.find((x) => x.text === q.text).best);
    const pass = guild.takeEvaluation(w, ctx, { shopId: g1().shopId, charId: 'a', charName: 'Aria', character: hero('Aria', 10), rankId: 'F', answers: best, approach: 0, rolls: [20, 20, 20], level: 1 });
    expect(pass.result.passed).toBe(true);
    expect(guild.licenseOf(pass.world, 'a').rank).toBe('F');
    expect(coinsInCp(pass.character.equipment.coins)).toBe(1000 - exam.fee);
    const fail = guild.takeEvaluation(w, ctx, { shopId: g1().shopId, charId: 'b', charName: 'Bo', character: hero('Bo', 10), rankId: 'F', answers: best.map((b) => (b + 1) % 3), rolls: [1, 1, 1], level: 1 });
    expect(fail.result.passed).toBe(false);
    expect(guild.evaluationEligibility(fail.world, ctx, { charId: 'b', rankId: 'F', level: 1 }).reason).toMatch(/repetir/);
  });

  it('ascender va de uno en uno y pide misiones completadas', () => {
    let w = guild.setLicenseRank(at(1), ctx, { charId: 'a', rankId: 'F' }).world;
    expect(guild.evaluationEligibility(w, ctx, { charId: 'a', rankId: 'D', level: 10 }).reason).toMatch(/uno en uno/);
    expect(guild.evaluationEligibility(w, ctx, { charId: 'a', rankId: 'E', level: 10 }).reason).toMatch(/2 misiones/);
    w.guild.licenses.a.byRank = { F: 2 };
    expect(guild.evaluationEligibility(w, ctx, { charId: 'a', rankId: 'E', level: 10 }).ok).toBe(true);
  });
});

describe('Servicios', () => {
  it('cada piso ofrece profesionales distintos y se contratan pagando por adelantado', () => {
    const w = at(1);
    const offers = guild.serviceOffers(w, ctx, g1());
    expect(offers.length).toBeGreaterThanOrEqual(3);
    expect(offers.map((o) => o.serviceId)).toEqual(expect.arrayContaining(['mercenario', 'curandero', 'guia']));
    for (const o of offers) expect(o.label).not.toMatch(/\{/);
    const deep = guild.serviceOffers(w, ctx, guild.guildOnFloor(ctx, 60));
    expect(Math.min(...deep.map((o) => o.price))).toBeGreaterThan(Math.min(...offers.map((o) => o.price)));
    const guia = offers.find((o) => o.serviceId === 'guia');
    const r = guild.hireService(w, ctx, { shopId: g1().shopId, offerId: guia.id, units: 3, charId: 'a', charName: 'Aria', character: hero('Aria', 100) });
    expect(r.error).toBeUndefined();
    expect(coinsInCp(r.character.equipment.coins)).toBe(10000 - guia.price * 3);
    expect(guild.hiresOf(r.world, 'a')[0]).toMatchObject({ units: 3, active: true, until: w.day + 2 });
  });
});
