// Campañas con jugadores: copia del PJ por campaña, registro automático y
// herramientas del DM (sin servidor: el servidor se simula en memoria).
import { describe, it, expect, beforeEach } from 'vitest';
import { createCharacter, createDocument } from '../src/domain/schema.js';
import { coinsInCp } from '../src/domain/money.js';
import { parseDocument } from '../src/domain/validation.js';
import { ApiError } from '../src/services/api.js';
import { createLocalStore } from '../src/services/local-store.js';
import { createCharacterService, campaignCopyId } from '../src/services/characters.js';
import { createHomebrewService } from '../src/services/homebrew.js';
import { createCampaignPlay } from '../src/services/campaign-play.js';
import {
  diffEvents, pcSummary, dmGiveItem, dmMoney, dmSetHp, dmLevelUp, dmGrantXp, itemChanges,
} from '../src/domain/campaign-play.js';

function hero({ gp = 10, levels = 1 } = {}) {
  const c = createCharacter();
  c.identity.name = 'Vex';
  c.identity.portrait = `data:image/png;base64,${'A'.repeat(5000)}`;
  c.equipment.coins.gp = gp;
  for (let i = 0; i < levels; i++) c.levels.push({ classKey: 'guerrero', hpRoll: 6 });
  return c;
}

/** Servidor de PJ de campaña en memoria (misma semántica que pc_get/pc_save). */
function fakeServer() {
  const pcs = new Map();
  const events = [];
  let failNext = null;
  return {
    pcs,
    events,
    failWith(code) { failNext = code; },
    seed(pcId, character) { pcs.set(pcId, { revision: 1, document: createDocument(character), status: 'activo', state: 'vivo', privacy: 'resumen' }); },
    /** Cambio hecho por el DM en el servidor. */
    dmChange(pcId, fn) {
      const p = pcs.get(pcId);
      const c = parseDocument(p.document).character;
      fn(c);
      p.document = createDocument(c);
      p.revision += 1;
    },
    remote: {
      async get(_camp, pcId) {
        const p = pcs.get(pcId);
        if (!p) throw new ApiError('not_found', 'x');
        return { pcId, ...structuredClone(p), updatedAt: new Date().toISOString() };
      },
      async save(_camp, pcId, { document, revision, events: evs }) {
        if (failNext) { const code = failNext; failNext = null; throw new ApiError(code, code); }
        const p = pcs.get(pcId);
        if (revision !== p.revision) throw new ApiError('conflict', 'conflict');
        p.document = structuredClone(document);
        p.revision += 1;
        events.push(...evs);
        return { revision: p.revision, updatedAt: new Date().toISOString() };
      },
    },
  };
}

async function setup() {
  const server = fakeServer();
  const characters = createCharacterService({ store: createLocalStore(), api: {}, pcRemote: server.remote });
  const original = hero({ gp: 10 });
  server.seed('pc1', original);
  const record = await characters.adoptCampaignCopy({ campaignId: 'mesa', campaignName: 'Mesa', pcId: 'pc1', revision: 1, status: 'activo' }, original);
  return { server, characters, record };
}

describe('registro automático (diffEvents)', () => {
  it('detecta nivel, experiencia, dinero y objetos', () => {
    const before = hero({ gp: 10 });
    const after = structuredClone(before);
    after.levels.push({ classKey: 'guerrero', hpRoll: 5 });
    after.experience = 300;
    after.equipment.coins.gp = 15;
    after.equipment.items.push({ name: 'Cuerda', quantity: 2, notes: '' });
    const ev = diffEvents(before, after);
    expect(ev.map((e) => e.kind)).toEqual(['nivel', 'experiencia', 'dinero', 'objeto']);
    expect(ev[0].visibility).toBe('publico');
    expect(ev[2]).toMatchObject({ visibility: 'privado', data: { delta: 500 } });
    expect(ev[3].text).toContain('2× Cuerda');
  });

  it('sin cambios no anota nada; skip evita duplicar lo que anota la Tienda', () => {
    const a = hero();
    expect(diffEvents(a, structuredClone(a))).toEqual([]);
    const b = structuredClone(a);
    b.equipment.coins.gp = 0;
    b.equipment.items.push({ name: 'Antorcha', quantity: 1, notes: '' });
    expect(diffEvents(a, b, { skip: ['dinero', 'objeto'] })).toEqual([]);
  });

  it('itemChanges cuenta por nombre y cantidad', () => {
    const a = hero();
    a.equipment.items.push({ name: 'Flecha', quantity: 20, notes: '' });
    const b = structuredClone(a);
    b.equipment.items[0].quantity = 15;
    expect(itemChanges(a, b)).toEqual({ added: [], removed: [['Flecha', 5]] });
  });
});

describe('resumen público del PJ', () => {
  it('no lleva retrato (el servidor limita su tamaño) y sí PG y nivel', () => {
    const s = pcSummary(hero({ levels: 3 }));
    expect(s.portrait).toBeUndefined();
    expect(s).toMatchObject({ name: 'Vex', level: 3 });
    expect(s.maxHp).toBeGreaterThan(0);
    expect(JSON.stringify(s).length).toBeLessThan(4000);
  });
});

describe('herramientas rápidas del DM', () => {
  it('dar y quitar dinero conserva el valor y no deja saldo negativo', () => {
    const c = hero({ gp: 10 });
    const give = dmMoney(c, 250, 'botín');
    expect(coinsInCp(give.character.equipment.coins)).toBe(1250);
    expect(give.events[0]).toMatchObject({ kind: 'recompensa', visibility: 'privado' });
    expect(give.events[0].text).toContain('botín');
    const take = dmMoney(give.character, -1250);
    expect(coinsInCp(take.character.equipment.coins)).toBe(0);
    expect(dmMoney(c, -5000).error).toMatch(/No tiene tanto/);
    expect(coinsInCp(c.equipment.coins)).toBe(1000); // puro: no cambia el original
  });

  it('dar objeto suma a uno igual en vez de duplicarlo', () => {
    const c = hero();
    const once = dmGiveItem(c, { name: 'Poción de curación', quantity: 1 });
    const twice = dmGiveItem(once.character, { name: 'poción de curación', quantity: 2 });
    expect(twice.character.equipment.items).toHaveLength(1);
    expect(twice.character.equipment.items[0].quantity).toBe(3);
    expect(dmGiveItem(c, { name: '  ' }).error).toBeTruthy();
  });

  it('PG: daño, curación hasta el máximo y valor fijo', () => {
    const c = hero({ levels: 2 });
    const hurt = dmSetHp(c, -5, { relative: true });
    const max = pcSummary(c).maxHp;
    expect(hurt.character.combat.currentHp).toBe(max - 5);
    expect(dmSetHp(hurt.character, 999, { relative: true }).character.combat.currentHp).toBe(max);
    expect(dmSetHp(c, 0).character.combat.currentHp).toBe(0);
  });

  it('subir nivel da la experiencia justa; dar PX suma', () => {
    const c = hero({ levels: 2 });
    expect(dmLevelUp(c).character.experience).toBe(900);
    expect(dmLevelUp(createCharacter()).error).toBeTruthy();
    expect(dmGrantXp(c, 150).character.experience).toBe(150);
  });
});

describe('copia del PJ en la campaña', () => {
  let ctx;
  beforeEach(async () => { ctx = await setup(); });

  it('se guarda como un personaje más, con su campaña', async () => {
    const opened = await ctx.characters.open(campaignCopyId('mesa', 'pc1'));
    expect(opened.record.pc).toMatchObject({ campaignId: 'mesa', pcId: 'pc1', revision: 1 });
    expect((await ctx.characters.list()).map((r) => r.id)).toContain('cp_mesa_pc1');
  });

  it('guardar sube la ficha y anota lo que cambió', async () => {
    const { record, character } = await ctx.characters.open(ctx.record.id);
    character.equipment.coins.gp = 30;
    const saved = await ctx.characters.save(record, character);
    expect(saved.pc.revision).toBe(2);
    expect(ctx.server.events.map((e) => e.kind)).toEqual(['dinero']);
    const remote = parseDocument(ctx.server.pcs.get('pc1').document).character;
    expect(remote.equipment.coins.gp).toBe(30);
  });

  it('la Tienda anota la compra y no se repiten dinero/objetos', async () => {
    const { record, character } = await ctx.characters.open(ctx.record.id);
    character.equipment.coins.gp = 5;
    character.equipment.items.push({ name: 'Cuerda', quantity: 1, notes: '' });
    await ctx.characters.save(record, character, { events: [{ kind: 'compra', text: 'Compra Cuerda por 5 po.', visibility: 'privado' }] });
    expect(ctx.server.events.map((e) => e.kind)).toEqual(['compra']);
  });

  it('si el DM cambió la ficha a la vez, se combinan las dos versiones', async () => {
    const { record, character } = await ctx.characters.open(ctx.record.id);
    // El DM le da 100 po en la campaña…
    ctx.server.dmChange('pc1', (c) => { c.equipment.coins.gp += 100; });
    // …mientras el jugador compra una cuerda por 5 po en su dispositivo.
    character.equipment.coins.gp -= 5;
    character.equipment.items.push({ name: 'Cuerda', quantity: 1, notes: '' });
    const saved = await ctx.characters.save(record, character);
    expect(saved.remoteMerged).toBe(true);
    const merged = (await ctx.characters.open(saved.id)).character;
    expect(merged.equipment.coins.gp).toBe(105);
    expect(merged.equipment.items.map((i) => i.name)).toEqual(['Cuerda']);
    expect(ctx.server.pcs.get('pc1').revision).toBe(3);
  });

  it('sin conexión queda guardado aquí y se sube después', async () => {
    const { record, character } = await ctx.characters.open(ctx.record.id);
    character.equipment.coins.gp = 50;
    ctx.server.failWith('network');
    const offline = await ctx.characters.save(record, character);
    expect(offline.pc.dirty).toBe(true);
    expect(ctx.server.pcs.get('pc1').revision).toBe(1);
    const again = await ctx.characters.refreshCopy(offline.id);
    expect(again.pc.dirty).toBe(false);
    expect(ctx.server.events.map((e) => e.kind)).toEqual(['dinero']);
  });

  it('PJ desvinculado: se guarda aquí pero avisa', async () => {
    const { record, character } = await ctx.characters.open(ctx.record.id);
    character.identity.name = 'Vex la Roja';
    ctx.server.failWith('forbidden');
    const err = await ctx.characters.save(record, character).catch((e) => e);
    expect(err.userMessage).toMatch(/ya no está vinculado/);
    expect((await ctx.characters.open(ctx.record.id)).character.identity.name).toBe('Vex la Roja');
  });

  it('refreshCopy trae lo que cambió el DM', async () => {
    ctx.server.dmChange('pc1', (c) => { c.combat.currentHp = 1; });
    const res = await ctx.characters.refreshCopy(ctx.record.id);
    expect(res.changed).toBe(true);
    expect((await ctx.characters.open(ctx.record.id)).character.combat.currentHp).toBe(1);
  });

  it('el personaje original no cambia', async () => {
    const original = await ctx.characters.create(hero({ gp: 7 }));
    const { record, character } = await ctx.characters.open(ctx.record.id);
    character.equipment.coins.gp = 999;
    await ctx.characters.save(record, character);
    expect((await ctx.characters.open(original.id)).character.equipment.coins.gp).toBe(7);
  });
});

describe('unirse con clave personal', () => {
  function fakeApi() {
    const s = { status: 'pendiente', open: false };
    return {
      s,
      join: async (id, code, name, role) => ({ id, name: 'Mesa', memberId: 'm1', key: 'personal-key-123456', role, status: 'pendiente' }),
      get: async (id, key) => {
        if (key === 'invite-code-1234567' && s.open) return { id, name: 'Mesa', role: 'jugador', rules: {}, items: [] };
        if (key === 'personal-key-123456' && s.status === 'activo') return { id, name: 'Mesa', role: 'jugador', rules: {}, items: [] };
        throw new ApiError('forbidden', 'x');
      },
      me: async () => ({ role: 'jugador', status: s.status, memberId: 'm1', campaignName: 'Mesa' }),
    };
  }

  beforeEach(() => localStorage.clear());

  it('queda pendiente sin acceso y entra cuando el DM aprueba', async () => {
    const api = fakeApi();
    const svc = createHomebrewService({ api });
    const m = await svc.requestJoin('mesa', 'invite-code-1234567', 'Ana', 'jugador');
    expect(m).toMatchObject({ status: 'pendiente', key: null, personalKey: 'personal-key-123456' });
    expect(svc.memberships()).toEqual([]); // nada de Tienda ni Homebrew aún
    expect(svc.ownerKey('mesa')).toBe('personal-key-123456'); // pero sí puede proponer su PJ
    api.s.status = 'activo';
    const next = await svc.checkStatus('mesa');
    expect(next).toMatchObject({ status: 'activo', key: 'personal-key-123456' });
    expect(next.personalKey).toBeUndefined();
    expect(svc.memberships()).toHaveLength(1);
  });

  it('campaña antigua con el código abierto: juega mientras espera', async () => {
    const api = fakeApi();
    api.s.open = true;
    const svc = createHomebrewService({ api });
    const m = await svc.requestJoin('mesa', 'invite-code-1234567', 'Ana', 'jugador');
    expect(m).toMatchObject({ legacy: true, key: 'invite-code-1234567', status: 'pendiente' });
    expect(svc.memberships()).toHaveLength(1);
  });

  it('rechazado: queda marcado sin acceso', async () => {
    const api = fakeApi();
    const svc = createHomebrewService({ api });
    await svc.requestJoin('mesa', 'invite-code-1234567', 'Ana', 'jugador');
    api.me = async () => { throw new ApiError('forbidden', 'x'); };
    expect((await svc.checkStatus('mesa')).status).toBe('expulsado');
  });
});

describe('herramientas del DM contra el servidor', () => {
  it('dmApply lee, aplica y guarda con revisión; reintenta si hubo conflicto', async () => {
    const server = fakeServer();
    server.seed('pc1', hero({ gp: 10 }));
    let calls = 0;
    const api = {
      pcGet: (id, key, pcId) => server.remote.get(id, pcId),
      pcSave: async (id, key, pcId, payload) => {
        calls += 1;
        if (calls === 1) server.dmChange('pc1', (c) => { c.equipment.coins.sp = 3; }); // otro cambio a la vez
        return server.remote.save(id, pcId, payload);
      },
    };
    const homebrew = { membership: () => ({ id: 'mesa', role: 'dm', key: 'dm-key' }), ownerKey: () => 'dm-key' };
    const play = createCampaignPlay({ api, homebrew, characters: {} });
    const res = await play.dmApply('mesa', 'pc1', (c) => dmMoney(c, 100));
    expect(res.error).toBeUndefined();
    const c = parseDocument(server.pcs.get('pc1').document).character;
    expect(coinsInCp(c.equipment.coins)).toBe(1000 + 30 + 100);
    expect(server.events[0].kind).toBe('recompensa');
  });

  it('un jugador no puede usar las herramientas del DM', async () => {
    const homebrew = { membership: () => ({ id: 'mesa', role: 'jugador', key: 'k' }), ownerKey: () => 'k' };
    const play = createCampaignPlay({ api: {}, homebrew, characters: {} });
    await expect(play.dmApply('mesa', 'pc1', (c) => ({ character: c }))).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('la Tienda con un PJ de campaña', () => {
  async function shopFor(memberships) {
    const { createShopService } = await import('../src/services/shop.js');
    const server = fakeServer();
    const characters = createCharacterService({ store: createLocalStore(), api: {}, pcRemote: server.remote });
    const c = hero({ gp: 300 });
    c.campaign = { id: 'mesa', name: 'Mesa' };
    server.seed('pc1', c);
    const record = await characters.adoptCampaignCopy({ campaignId: 'mesa', campaignName: 'Mesa', pcId: 'pc1', revision: 1, status: 'activo' }, c);
    const store = { world: null, revision: 0 };
    const market = {
      async load() { return { world: store.world && structuredClone(store.world), revision: store.revision, role: 'jugador' }; },
      async save(_s, world) { store.world = structuredClone(world); store.revision += 1; return store.revision; },
    };
    const shop = await createShopService({ characters, homebrew: { memberships: () => memberships }, market, remoteEnabled: true }).init(record.id);
    return { shop, server, characters, record };
  }

  it('comprar sube la copia a la campaña y anota la compra (sin repetir dinero/objetos)', async () => {
    const { shop, server } = await shopFor([{ id: 'mesa', name: 'Mesa', role: 'jugador', key: 'k' }]);
    expect(shop.state.scope.kind).toBe('campaign');
    await shop.travel('barrio-fraguas');
    const res = await shop.buy('engranajes', 'taller-engranajes', 1);
    expect(res.error).toBeUndefined();
    expect(server.events.map((e) => e.kind)).toEqual(['compra']);
    expect(server.events[0].text).toMatch(/Compra .*por/);
    const remote = parseDocument(server.pcs.get('pc1').document).character;
    expect(remote.workshop.materials.engranajes).toBe(1);
  });

  it('fuera del mercado de su campaña no compra (p. ej. solicitud aún pendiente)', async () => {
    const { shop, server } = await shopFor([]);
    await shop.travel('barrio-fraguas');
    const res = await shop.buy('engranajes', 'taller-engranajes', 1);
    expect(res.error).toMatch(/mercado de su campaña/);
    expect(server.events).toEqual([]);
  });
});
