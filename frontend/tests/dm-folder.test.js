// Carpeta del DM: tiendas propias por campaña, separadas de lo oficial.
import { describe, it, expect, afterEach } from 'vitest';
import { createCharacter } from '../src/domain/schema.js';
import { createCharacterService } from '../src/services/characters.js';
import { createLocalStore } from '../src/services/local-store.js';
import { createShopService, buildShopContext } from '../src/services/shop.js';
import { createMarketRepository } from '../src/services/shop-market.js';
import { validateContent } from '../src/content/schema.js';
import { installPack, resetRegistry } from '../src/content/registry.js';
import shopsData from '../src/data/shop/shops.json';

afterEach(() => resetRegistry());

const entry = (pack, id, data) => ({ ref: `hb:${pack}:mercader:${id}`, type: 'mercader', version: 1, status: 'publicado', data: validateContent('mercader', data).item });

function fakeRpc() {
  const dbs = {};
  return {
    dbs,
    async get(id, key) { const db = (dbs[id] ??= { world: null, revision: 0 }); return { world: db.world, revision: db.revision, role: key === 'dm' ? 'dm' : 'jugador' }; },
    async save(id, key, world, rev) { const db = (dbs[id] ??= { world: null, revision: 0 }); if ((rev ?? -1) !== db.revision) throw new Error('conflict'); db.world = structuredClone(world); db.revision += 1; return { revision: db.revision }; },
  };
}

/** Homebrew falso: dos campañas donde el usuario es DM + una de jugador, y un paquete local. */
function fakeHomebrew() {
  const memberships = [
    { id: 'agarias', name: 'Mundo de Agarias', role: 'dm', key: 'dm' },
    { id: 'otra', name: 'Otra Campaña', role: 'dm', key: 'dm' },
    { id: 'ajena', name: 'Mesa de Lía', role: 'jugador', key: 'inv' },
  ];
  const saved = [];
  installPack({ id: 'agarias', name: 'Mundo de Agarias', kind: 'campaign', role: 'dm', items: [
    entry('agarias', 'snadrea', { name: 'Iria Snadrea', shopName: 'Tienda de Snadrea', location: 'plaza-mayor', profession: 'general' }),
    entry('agarias', 'gorvan2', { name: 'Gorvan', base: 'gorvan', location: 'barrio-fraguas' }),
  ] });
  installPack({ id: 'otra', name: 'Otra Campaña', kind: 'campaign', role: 'dm', items: [] });
  installPack({ id: 'local-dm', name: 'Local', kind: 'local', items: [] });
  return {
    saved,
    memberships: () => memberships,
    membership: (id) => memberships.find((m) => m.id === id) ?? null,
    localPack: () => ({ id: 'local-dm', name: 'Local', items: [] }),
    async saveCampaignItem(id, { type, data, contentId }) {
      const { item, errors } = validateContent(type, data);
      if (!item) return { errors };
      const cid = contentId ?? `n${saved.length + 1}`;
      saved.push({ id, type, item, cid });
      installPack({ id, name: id, kind: 'campaign', role: 'dm', items: saved.filter((s) => s.id === id).map((s) => ({ ref: `hb:${id}:${s.type}:${s.cid}`, type: s.type, version: 1, status: 'publicado', data: s.item })) });
      return { errors: [], ref: `hb:${id}:${type}:${cid}` };
    },
    async removeCampaignItem() { return {}; },
    saveLocalItem() { return { errors: [] }; },
  };
}

async function dmShop() {
  const characters = createCharacterService({ store: createLocalStore(), api: {} });
  const c = createCharacter();
  c.identity.name = 'Aria';
  await characters.create(c);
  const homebrew = fakeHomebrew();
  const api = fakeRpc();
  const shop = await createShopService({ characters, homebrew, market: createMarketRepository({ api }), remoteEnabled: true }).init();
  return { shop, homebrew, api };
}

describe('Carpeta del DM', () => {
  it('lista una carpeta por campaña donde es DM (y el dispositivo), con tiendas propias y oficiales modificadas por separado', async () => {
    const { shop } = await dmShop();
    const folders = shop.dmFolders();
    expect(folders.map((f) => f.name)).toEqual(['Mundo de Agarias', 'Otra Campaña', 'Este dispositivo (sin campaña)']);
    const agarias = folders[0];
    expect(agarias.shops.map((s) => s.shopName)).toEqual(['Tienda de Snadrea']);
    expect(agarias.modified.map((s) => s.base)).toEqual(['Gorvan Yunquehierro']);
    expect(folders[1].shops).toEqual([]);
  });

  it('el DM entra al mercado de su campaña sin personaje y ve sus tiendas; lo oficial sigue intacto', async () => {
    const { shop } = await dmShop();
    expect(shop.state.scope.kind).toBe('local');
    expect([...shop.ctx.shops.values()].some((s) => s.name === 'Tienda de Snadrea')).toBe(false);
    await shop.enterCampaignAsDm('agarias');
    expect(shop.state.scope).toMatchObject({ kind: 'campaign', id: 'agarias' });
    expect(shop.state.characterId).toBeNull();
    expect(shop.state.dmCampaign).toBe('agarias');
    expect(shop.canControlTime).toBe(true);
    expect([...shop.ctx.shops.values()].some((s) => s.name === 'Tienda de Snadrea')).toBe(true);
    // Otra campaña no la ve.
    expect([...buildShopContext({ campaignId: 'otra' }).shops.values()].some((s) => s.name === 'Tienda de Snadrea')).toBe(false);
    // No puede entrar como DM a una campaña donde es jugador.
    await shop.enterCampaignAsDm('ajena');
    expect(shop.state.dmCampaign).toBeNull();
  });

  it('guarda una tienda en otra carpeta sin tocar el mundo abierto', async () => {
    const { shop, homebrew } = await dmShop();
    await shop.enterCampaignAsDm('agarias');
    const res = await shop.saveWorld('mercader', { name: 'Ana', shopName: 'Tienda de la ciudad inicial', location: 'plaza-mayor', profession: 'general' }, null, 'otra');
    expect(res.error).toBeUndefined();
    expect(homebrew.saved.at(-1).id).toBe('otra');
    expect(shop.dmFolders().find((f) => f.id === 'otra').shops.map((s) => s.shopName)).toEqual(['Tienda de la ciudad inicial']);
    expect(shop.state.scope.id).toBe('agarias');
    expect((await shop.saveWorld('mercader', { name: 'X', location: 'plaza-mayor', profession: 'general' }, null, 'ajena')).error).toMatch(/DM/);
  });

  it('una copia de una tienda oficial es NUEVA: parte de su catálogo y no sustituye a la original', async () => {
    const { shop } = await dmShop();
    const copy = shop.officialCopy('gorvan');
    expect(copy).toMatchObject({ base: null, copyOf: 'gorvan', catalogMode: 'original' });
    const { item } = validateContent('mercader', copy);
    expect(item.copyOf).toBe('gorvan');
    installPack({ id: 'otra', name: 'Otra', kind: 'campaign', role: 'dm', items: [{ ref: 'hb:otra:mercader:c1', type: 'mercader', version: 1, status: 'publicado', data: item }] });
    const ctx = buildShopContext({ campaignId: 'otra' });
    const yunque = shopsData.shops.find((s) => s.id === 'yunque');
    const mine = [...ctx.shops.values()].find((s) => s.name === `${yunque.name} (copia)`);
    expect(mine).toBeTruthy();
    expect(mine.id).not.toBe('yunque');
    expect(mine.assortment).toEqual(yunque.assortment);
    expect(ctx.shops.get('yunque').keeperId).toBe('gorvan');
  });

  it('elegir un personaje sale del modo DM', async () => {
    const { shop } = await dmShop();
    await shop.enterCampaignAsDm('agarias');
    await shop.selectCharacter(shop.state.characters[0].id);
    expect(shop.state.dmCampaign).toBeNull();
    expect(shop.state.scope.kind).toBe('local');
  });
});
