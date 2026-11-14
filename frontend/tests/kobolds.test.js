// Kobolds (Monstruos del Multiverso, Calderis, Aster) y metálicos de Agarias.
import { describe, it, expect } from 'vitest';
import { createCharacter } from '../src/domain/schema.js';
import { setRace, setRaceAbilityChoice, raceAllowsFeat, raceFeatOptions, setRaceFeat, validateImprovement } from '../src/domain/progression.js';
import { abilityScores, allFeats } from '../src/domain/rules.js';
import { getRace, getFeat, getRaceTags, data } from '../src/data/index.js';
import { raceFamilies } from '../src/domain/shop/profile.js';
import shopRaces from '../src/data/shop/races.json';

const NEW = [
  'Kobold (Monstruos del Multiverso)', 'Kobold de Cobalto (Calderis)', 'Kobold (Calderis)', 'Kobold (Aster)',
  ...['Oro', 'Plata', 'Bronce', 'Latón', 'Cobre', 'Cobalto'].map((m) => `Dracónido Metálico (${m})`),
  ...['Oro', 'Plata', 'Bronce', 'Latón', 'Cobre'].map((m) => `Kobold Metálico (${m})`),
];

describe('Kobolds y metálicos', () => {
  it.each(NEW)('%s existe, está en el catálogo, tiene etiquetas y la Tienda lo reconoce', (key) => {
    const race = getRace(key);
    expect(race).toBeTruthy();
    expect(race.info).toMatch(/^Rasgos de Raza:/);
    expect(data.raceCatalog.some((g) => g.races.includes(key))).toBe(true);
    expect(getRaceTags(key).length).toBeGreaterThan(0);
    expect(raceFamilies(key, shopRaces.families)).toContain(key.startsWith('Kobold') ? 'bestial' : 'draconido');
  });

  it('los legados kobold sólo se eligen como dote de la raza', () => {
    let c = setRace(createCharacter(), 'Kobold (Monstruos del Multiverso)');
    expect(raceAllowsFeat(c)).toBe(true);
    expect(raceFeatOptions(c)).toHaveLength(3);
    expect(setRaceFeat(c, { name: 'Alerta' }).errors[0]).toMatch(/sólo deja elegir/);
    const ok = setRaceFeat(c, { name: 'Legado Kobold: Desafiante' });
    expect(ok.errors).toEqual([]);
    expect(allFeats(ok.character).map((f) => f.name)).toContain('Legado Kobold: Desafiante');
    // Al subir de nivel no se pueden tomar.
    expect(validateImprovement(createCharacter(), { type: 'feat', name: 'Legado Kobold: Astucia' })[0]).toMatch(/raza/);
    // El Kobold de Aster no tiene legado.
    expect(raceAllowsFeat(setRace(createCharacter(), 'Kobold (Aster)'))).toBe(false);
    for (const f of raceFeatOptions(c)) expect(getFeat(f)?.soloRaza).toBe(true);
  });

  it('+2 y +1 a elección (Monstruos del Multiverso) y +2 DES / +1 SAB o CAR (Aster)', () => {
    let c = setRace(createCharacter(), 'Kobold (Monstruos del Multiverso)');
    c = setRaceAbilityChoice(c, 0, ['inteligencia']);
    c = setRaceAbilityChoice(c, 1, ['sabiduria']);
    const s = abilityScores(c);
    expect(s.inteligencia.total - s.inteligencia.base).toBe(2);
    expect(s.sabiduria.total - s.sabiduria.base).toBe(1);
    let a = setRace(createCharacter(), 'Kobold (Aster)');
    a = setRaceAbilityChoice(a, 0, ['carisma']);
    const sa = abilityScores(a);
    expect(sa.destreza.total - sa.destreza.base).toBe(2);
    expect(sa.carisma.total - sa.carisma.base).toBe(1);
  });
});
