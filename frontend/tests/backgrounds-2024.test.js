// Los 16 trasfondos del Manual del Jugador 2024 (más los 2 de Agarias).
import { describe, it, expect } from 'vitest';
import backgrounds from '../src/data/backgrounds.json';
import feats from '../src/data/feats.json';
import { SKILLS, ABILITY_KEYS } from '../src/domain/constants.js';
import { parseEquipmentText } from '../src/domain/background.js';
import { buildShopContext, characterProfile } from '../src/services/shop.js';
import { createCharacter } from '../src/domain/schema.js';
import { createWorld } from '../src/domain/shop/simulation.js';
import { quoteBuy } from '../src/domain/shop/pricing.js';

const PHB = ['acolito', 'agricultor', 'artesano', 'artista', 'caminante', 'charlatan', 'comerciante', 'criminal', 'ermitano', 'escriba', 'guardia', 'guia', 'marinero', 'noble', 'sabio', 'soldado'];
const skillNames = new Set(SKILLS.map((s) => s.name));

describe('Trasfondos 2024', () => {
  it('están los 16 y se conservan los de Agarias', () => {
    for (const key of PHB) expect(backgrounds[key], key).toBeTruthy();
    expect(backgrounds.solitario.pending).toBe(true);
    expect(backgrounds.huerfano.pending).toBe(true);
  });

  it.each(PHB)('%s: 3 atributos, dote existente, 2 habilidades válidas, herramienta y equipo A/B', (key) => {
    const bg = backgrounds[key];
    expect(bg.abilityOptions).toHaveLength(3);
    for (const a of bg.abilityOptions) expect(ABILITY_KEYS).toContain(a);
    expect(feats[bg.feat], bg.feat).toBeTruthy();
    expect(bg.skills).toHaveLength(2);
    for (const s of bg.skills) expect(skillNames.has(s), s).toBe(true);
    expect(bg.tools).toHaveLength(1);
    expect(bg.equipment.map((e) => e.label)).toEqual(['A', 'B']);
    const a = parseEquipmentText(bg.equipment[0].text);
    expect(a.items.length).toBeGreaterThan(0);
    expect(a.coins.gp).toBeGreaterThan(0);
    expect(parseEquipmentText(bg.equipment[1].text).coins.gp).toBe(50);
  });
});

describe('Dote Artesano en la Tienda', () => {
  it('descuenta un 20 % en objetos no mágicos y nada en los mágicos', () => {
    const ctx = buildShopContext();
    const world = createWorld(ctx, { seed: 'artesano', warmupDays: 0 });
    const shopId = 'linterna';
    const itemId = Object.keys(world.shops[shopId].stock).find((id) => ctx.item(id)?.category !== 'magicos' && ctx.item(id).price >= 500);
    const profile = characterProfile(createCharacter());
    const base = { shopId, itemId, charId: 'pj', profile };
    const plain = quoteBuy(world, ctx, base);
    const crafter = quoteBuy(world, ctx, { ...base, profile: { ...profile, feats: ['Artesano'] } });
    expect(crafter.factors.some((f) => f.key === 'dote-artesano')).toBe(true);
    expect(crafter.unit).toBeLessThan(plain.unit);
    const magicShop = 'gabinete';
    const magicId = Object.keys(world.shops[magicShop].stock).find((id) => ctx.item(id)?.category === 'magicos');
    const magic = quoteBuy(world, ctx, { shopId: magicShop, itemId: magicId, charId: 'pj', profile: { ...profile, feats: ['Artesano'] } });
    expect(magic.factors.some((f) => f.key === 'dote-artesano')).toBe(false);
  });
});
