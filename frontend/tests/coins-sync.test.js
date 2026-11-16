// Monedas añadidas en la ficha (regalo del DM) y la Tienda abierta en otra pestaña.
import { describe, it, expect, vi } from 'vitest';
import { createCharacter } from '../src/domain/schema.js';
import { coinsInCp } from '../src/domain/money.js';
import { mergeCharacters } from '../src/domain/merge.js';
import { createShopService } from '../src/services/shop.js';
import { createLocalStore } from '../src/services/local-store.js';
import { createCharacterService, createChangeChannel } from '../src/services/characters.js';

function hero(gp) {
  const c = createCharacter();
  c.identity.name = 'Aria';
  c.equipment.coins.gp = gp;
  return c;
}

function memoryMarket() {
  const store = { world: null, revision: 0 };
  return {
    store,
    async load() { return { world: store.world && structuredClone(store.world), revision: store.revision, role: 'dm' }; },
    async save(_s, world) { store.world = structuredClone(world); store.revision += 1; return store.revision; },
  };
}

describe('fusión de dos versiones del personaje', () => {
  it('regalo del DM en la ficha + compra en la Tienda: se conservan los dos', () => {
    const base = hero(100);
    base.equipment.items.push({ name: 'Cuerda', quantity: 1, notes: '' });
    const mine = structuredClone(base);
    mine.equipment.coins.gp += 50; // regalo
    mine.identity.name = 'Aria la Generosa';
    const theirs = structuredClone(base);
    theirs.equipment.coins.gp -= 30; // compra
    theirs.equipment.items.push({ name: 'Antorcha', quantity: 2, notes: '' });
    theirs.workshop.materials = { engranajes: 2 };

    const m = mergeCharacters(base, mine, theirs);
    expect(m.equipment.coins.gp).toBe(120);
    expect(m.identity.name).toBe('Aria la Generosa');
    expect(m.equipment.items.map((i) => i.name)).toEqual(['Cuerda', 'Antorcha']);
    expect(m.workshop.materials.engranajes).toBe(2);
    // No modifica sus argumentos.
    expect(mine.equipment.coins.gp).toBe(150);
  });

  it('altas y bajas de inventario en los dos lados', () => {
    const base = hero(0);
    base.equipment.items = [{ name: 'A', quantity: 1, notes: '' }, { name: 'B', quantity: 1, notes: '' }];
    const mine = structuredClone(base);
    mine.equipment.items = [{ name: 'A', quantity: 1, notes: '' }, { name: 'C', quantity: 1, notes: '' }]; // quita B, añade C
    const theirs = structuredClone(base);
    theirs.equipment.items.push({ name: 'D', quantity: 1, notes: '' }); // la Tienda añade D
    const m = mergeCharacters(base, mine, theirs);
    expect(m.equipment.items.map((i) => i.name)).toEqual(['A', 'D', 'C']);
  });

  it('nunca deja monedas negativas', () => {
    const base = hero(10);
    const mine = structuredClone(base); mine.equipment.coins.gp = 0;
    const theirs = structuredClone(base); theirs.equipment.coins.gp = 5;
    expect(mergeCharacters(base, mine, theirs).equipment.coins.gp).toBe(0);
  });
});

/** Canal de prueba: dos «pestañas» que comparten el mismo almacenamiento. */
function linkedTabs() {
  const tabs = [];
  const make = () => {
    const listeners = new Set();
    const me = {
      notify(record, kind = 'saved') { for (const t of tabs) if (t !== me) for (const fn of t.listeners) fn({ id: record.id, updatedAt: record.updatedAt, kind }); },
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      listeners,
    };
    tabs.push(me);
    return me;
  };
  return { make };
}

describe('la Tienda ve las monedas añadidas en la ficha', () => {
  it('aviso de otra pestaña: recarga la ficha y repinta', async () => {
    const store = createLocalStore();
    const link = linkedTabs();
    const sheetTab = createCharacterService({ store, api: {}, changes: link.make() });
    const shopTab = createCharacterService({ store, api: {}, changes: link.make() });
    const record = await sheetTab.create(hero(10));
    const shop = await createShopService({ characters: shopTab, homebrew: { memberships: () => [] }, market: memoryMarket() }).init(record.id);
    const stop = shop.watchCharacter();
    const seen = vi.fn();
    shop.subscribe((_, change) => seen(change.type));
    expect(coinsInCp(shop.state.character.equipment.coins)).toBe(1000);

    // El jugador suma 200 po en la ficha (regalo del DM).
    const opened = await sheetTab.open(record.id);
    opened.character.equipment.coins.gp += 200;
    await new Promise((r) => setTimeout(r, 2)); // otra marca de tiempo
    await sheetTab.save(opened.record, opened.character);
    await shop.syncCharacter(); // espera a la cola de la Tienda

    expect(coinsInCp(shop.state.character.equipment.coins)).toBe(21000);
    expect(seen).toHaveBeenCalledWith('character');
    stop();
  });

  it('sin cambios no repinta', async () => {
    const characters = createCharacterService({ store: createLocalStore(), api: {} });
    const record = await characters.create(hero(10));
    const shop = await createShopService({ characters, homebrew: { memberships: () => [] }, market: memoryMarket() }).init(record.id);
    const seen = vi.fn();
    shop.subscribe(seen);
    await shop.syncCharacter();
    expect(seen).not.toHaveBeenCalled();
  });

  it('el canal real no falla sin BroadcastChannel', () => {
    const ch = createChangeChannel('prueba');
    expect(() => ch.notify({ id: 'x', updatedAt: 'y' })).not.toThrow();
    expect(typeof ch.subscribe(() => {})).toBe('function');
  });
});

describe('platino', () => {
  it('cuenta en la bolsa y sirve para pagar (con cambio)', async () => {
    const { pay } = await import('../src/domain/money.js');
    expect(coinsInCp({ pp: 1, gp: 5 })).toBe(1500);
    const r = pay({ cp: 0, sp: 0, gp: 5, pp: 1 }, 1200);
    expect(r.ok).toBe(true);
    expect(coinsInCp(r.coins)).toBe(300);
    expect(r.coins.pp).toBe(0);
  });

  it('la bolsa de la Tienda muestra el platino tal cual y el total', async () => {
    const { purse } = await import('../src/views/shop/dom.js');
    const el = purse({ cp: 0, sp: 0, gp: 5, pp: 1 });
    expect(el.textContent.replace(/\s+/g, ' ')).toContain('1ppt');
    expect(el.textContent).toContain('= 15 po');
  });
});
