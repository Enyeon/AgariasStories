// Biblioteca de Homebrew reutilizable: vínculo con las campañas, versión
// fijada, avisos de versión nueva y sin duplicados.
import { describe, it, expect, beforeEach } from 'vitest';
import { resetRegistry, listEntries } from '../src/content/registry.js';
import { validateContent } from '../src/content/schema.js';
import { linkState, changedFields, libraryUsage, pendingUpdates, findLinked } from '../src/content/library.js';
import { createHomebrewService } from '../src/services/homebrew.js';

/** Servidor de campañas en memoria con la semántica de content_upsert. */
function fakeApi() {
  const camps = new Map();
  let n = 0;
  const camp = (id) => camps.get(id);
  return {
    camps,
    create: async (name) => {
      const id = `camp${++n}x`;
      camps.set(id, { id, name, items: new Map() });
      return { id, name, dmKey: `dm-key-${id}-0000000000`, inviteCode: `invite-${id}-00000000` };
    },
    get: async (id) => {
      const c = camp(id);
      return { id, name: c.name, role: 'dm', rules: {}, items: [...c.items.values()] };
    },
    upsertContent: async (id, _key, { type, data, contentId, status }) => {
      const c = camp(id);
      const cid = contentId ?? `c${++n}abcdef`;
      const prev = c.items.get(cid);
      const nextStatus = status ?? prev?.status ?? 'borrador';
      const changed = prev && JSON.stringify(prev.data) !== JSON.stringify(data) && ['publicado', 'oculto'].includes(nextStatus);
      c.items.set(cid, { type, contentId: cid, status: nextStatus, version: (prev?.version ?? 1) + (changed ? 1 : 0), data: structuredClone(data) });
      return { contentId: cid, version: c.items.get(cid).version, status: nextStatus };
    },
  };
}

const sword = { name: 'Espada de escarcha', description: 'Fría.', source: 'Mesa' };

let api;
let svc;
beforeEach(() => {
  localStorage.clear();
  resetRegistry();
  api = fakeApi();
  svc = createHomebrewService({ api });
  svc.init();
});

const campaignItems = (id) => listEntries(null, { selectable: false, packId: id }).filter((e) => e.origin !== 'snapshot');

describe('vínculo en el contenido', () => {
  it('validateContent conserva un vínculo válido y descarta uno roto', () => {
    expect(validateContent('objeto', { ...sword, linkedFrom: { id: 'abc123', version: 3, pack: 'local-x' } }).item.linkedFrom)
      .toEqual({ id: 'abc123', version: 3, pack: 'local-x' });
    expect(validateContent('objeto', { ...sword, linkedFrom: { id: '<script>' } }).item.linkedFrom).toBeUndefined();
    expect(validateContent('objeto', sword).item).not.toHaveProperty('linkedFrom');
  });

  it('changedFields dice qué cambió (sin contar el vínculo)', () => {
    expect(changedFields({ ...sword, linkedFrom: { id: 'a', version: 1 } }, { ...sword, description: 'Muy fría.' })).toEqual(['descripción']);
  });

  it('la biblioteca no guarda vínculos', () => {
    const { ref } = svc.saveLocalItem({ type: 'objeto', data: { ...sword, linkedFrom: { id: 'zzzz99', version: 1 } } });
    expect(svc.localPack().items.find((i) => i.ref === ref).data).not.toHaveProperty('linkedFrom');
  });

  it('guardar sin cambios no sube la versión', () => {
    const { ref } = svc.saveLocalItem({ type: 'objeto', data: sword });
    const again = svc.saveLocalItem({ type: 'objeto', data: sword, contentId: ref.split(':').at(-1) });
    expect(again.unchanged).toBe(true);
    expect(svc.localPack().items.find((i) => i.ref === ref).version).toBe(1);
  });
});

describe('usar la biblioteca en campañas', () => {
  it('añade una copia vinculada con la versión fijada, sin duplicar al repetir', async () => {
    const a = await svc.create('Mesa A');
    const { ref } = svc.saveLocalItem({ type: 'objeto', data: sword });
    expect(await svc.useInCampaign(a.id, [ref])).toMatchObject({ created: 1, updated: 0 });
    expect(await svc.useInCampaign(a.id, [ref])).toMatchObject({ created: 0, updated: 1 });
    const items = campaignItems(a.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: 'publicado', item: { name: sword.name, linkedFrom: { id: ref.split(':').at(-1), version: 1 } } });
  });

  it('avisa de la versión nueva y cada campaña se actualiza cuando el DM quiere', async () => {
    const a = await svc.create('Mesa A');
    const b = await svc.create('Mesa B');
    const { ref } = svc.saveLocalItem({ type: 'objeto', data: sword });
    await svc.useInCampaign(a.id, [ref]);
    await svc.useInCampaign(b.id, [ref], { status: 'borrador' });
    svc.saveLocalItem({ type: 'objeto', data: { ...sword, description: 'Congela al tocarla.' }, contentId: ref.split(':').at(-1) });

    const usage = svc.libraryUsage();
    expect(usage.get(ref).map((u) => [u.campaignName, u.pinned, u.outdated])).toEqual([['Mesa A', 1, true], ['Mesa B', 1, true]]);
    expect(pendingUpdates(usage)).toBe(2);
    expect(pendingUpdates(usage, a.id)).toBe(1);
    // La campaña sigue con su versión hasta actualizar.
    expect(campaignItems(a.id)[0].item.description).toBe('Fría.');

    await svc.useInCampaign(a.id, [ref]);
    expect(campaignItems(a.id)[0].item.description).toBe('Congela al tocarla.');
    expect(linkState(campaignItems(a.id)[0], svc.localPack().items).state).toBe('al-dia');
    expect(linkState(campaignItems(b.id)[0], svc.localPack().items).state).toBe('nueva-version');

    const res = await svc.updateEverywhere(ref);
    expect(res).toMatchObject({ campaigns: 1, failed: [] });
    expect(pendingUpdates(svc.libraryUsage())).toBe(0);
    // Actualizar no cambia el estado elegido en cada campaña.
    expect(campaignItems(b.id)[0].status).toBe('borrador');
  });

  it('desvincular conserva la copia y quita los avisos', async () => {
    const a = await svc.create('Mesa A');
    const { ref } = svc.saveLocalItem({ type: 'objeto', data: sword });
    await svc.useInCampaign(a.id, [ref]);
    await svc.unlinkCampaignItem(a.id, campaignItems(a.id)[0].ref);
    expect(campaignItems(a.id)[0].item.linkedFrom).toBeUndefined();
    expect(svc.libraryUsage().get(ref)).toEqual([]);
    // Volver a usarlo crea otra copia vinculada (la desvinculada ya es de la campaña).
    await svc.useInCampaign(a.id, [ref]);
    expect(campaignItems(a.id)).toHaveLength(2);
  });

  it('un elemento creado en la campaña se guarda en la biblioteca y queda vinculado', async () => {
    const a = await svc.create('Mesa A');
    const b = await svc.create('Mesa B');
    const { ref: campRef } = await svc.saveCampaignItem(a.id, { type: 'objeto', data: sword, status: 'publicado' });
    const { ref: libRef } = await svc.saveToLibrary(a.id, campRef);
    expect(linkState(campaignItems(a.id)[0], svc.localPack().items)).toMatchObject({ libraryRef: libRef, state: 'al-dia' });
    // Ya se puede reutilizar en otra campaña.
    await svc.useInCampaign(b.id, [libRef]);
    expect(findLinked(campaignItems(b.id), libRef).item.name).toBe(sword.name);
    expect(svc.localPack().items).toHaveLength(1);
  });

  it('sólo el DM usa la biblioteca en una campaña', async () => {
    const a = await svc.create('Mesa A');
    const { ref } = svc.saveLocalItem({ type: 'objeto', data: sword });
    const list = JSON.parse(localStorage.getItem('agarias-dnd:campaigns')).map((m) => ({ ...m, role: 'jugador' }));
    localStorage.setItem('agarias-dnd:campaigns', JSON.stringify(list));
    const player = createHomebrewService({ api });
    await expect(player.useInCampaign(a.id, [ref])).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('exportar e importar la biblioteca', () => {
  it('conserva ids y versiones: importar dos veces no duplica y mantiene los vínculos', async () => {
    const { ref } = svc.saveLocalItem({ type: 'objeto', data: sword });
    svc.saveLocalItem({ type: 'objeto', data: { ...sword, description: 'v2' }, contentId: ref.split(':').at(-1) });
    const file = svc.exportPack(svc.localPack().id);
    expect(file.version).toBe(2);
    expect(file.items[0]).toMatchObject({ id: ref.split(':').at(-1), version: 2 });

    // Otro dispositivo.
    localStorage.clear();
    resetRegistry();
    const other = createHomebrewService({ api });
    other.init();
    expect(other.importPack(file)).toMatchObject({ added: 1, updated: 0, unchanged: 0 });
    expect(other.importPack(file)).toMatchObject({ added: 0, unchanged: 1 });
    const [mine] = other.localPack().items;
    expect(mine.version).toBe(2);
    // Una campaña vinculada desde el primer dispositivo se reconoce aquí.
    expect(linkState({ type: 'objeto', item: { linkedFrom: { id: ref.split(':').at(-1), version: 1 } } }, other.localPack().items))
      .toMatchObject({ state: 'nueva-version', latest: 2 });
  });

  it('los paquetes antiguos (sin ids) se siguen importando', () => {
    const res = svc.importPack({ format: 'agarias-homebrew-pack', version: 1, items: [{ type: 'objeto', data: sword }] });
    expect(res.added).toBe(1);
  });

  it('libraryUsage ignora campañas que no son del DM', () => {
    const lib = [{ ref: 'hb:local-a:objeto:abc123', type: 'objeto', version: 2, status: 'publicado', data: sword }];
    const usage = libraryUsage(lib, [{ id: 'x', name: 'X', entries: [{ ref: 'hb:x:objeto:q1', type: 'objeto', status: 'publicado', item: { ...sword, linkedFrom: { id: 'abc123', version: 1 } } }] }]);
    expect(usage.get(lib[0].ref)).toHaveLength(1);
  });
});
