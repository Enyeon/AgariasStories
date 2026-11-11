import { describe, it, expect, beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet, classFeatures, subclassInfo } from '../src/domain/rules.js';
import { applyLevelDowns, planLevelUp, setRace, setSubclass } from '../src/domain/progression.js';
import { applyLevelUp, applyLevelUps } from './helpers/auto-choices.js';
import {
  addUnlock, removeUnlock, findByCode, hashUnlockCode, generateUnlockCode, normalizeUnlockCode, addableExtensions, UNLOCK_CODE_RE,
} from '../src/domain/extensions.js';
import { parseDocument } from '../src/domain/validation.js';
import { createDocument } from '../src/services/characters.js';
import { installPack, resetRegistry } from '../src/content/registry.js';
import { validateContent } from '../src/content/schema.js';

globalThis.crypto ??= webcrypto;

const P = 'mesa';
const SUB_OPEN = `hb:${P}:extension:campeon-divino`;
const SUB_SECRET = `hb:${P}:extension:juramento-oculto`;
const AKATOSH = `hb:${P}:extension:akatosh`;
const SHADOW_EVO = `hb:${P}:extension:evolucion`;
let SECRET_CODE;

async function install() {
  SECRET_CODE = generateUnlockCode();
  installPack({ id: P, name: 'Mesa', kind: 'campaign', items: [
    { ref: SUB_OPEN, type: 'extension', version: 1, status: 'publicado', data: {
      name: 'Camino del Campeón Divino', classKey: 'guerrero', kind: 'subclase', access: 'abierta', origin: 'bendicion',
      features: [3, 7, 10, 15].map((level) => ({ level, name: `Don divino ${level}`, text: '…' })).concat([{ level: 3, name: 'Aura', text: '…', effects: [{ type: 'resistencia', value: 'profano' }] }]),
    } },
    { ref: SUB_SECRET, type: 'extension', version: 1, status: 'publicado', data: {
      name: 'Juramento Oculto', classKey: 'guerrero', kind: 'subclase', access: 'desbloqueo', unlockHash: await hashUnlockCode(SECRET_CODE),
      features: [{ level: 3, name: 'Secreto', text: '…' }],
    } },
    { ref: AKATOSH, type: 'extension', version: 1, status: 'publicado', data: {
      name: 'Golpe de Akatosh', classKey: 'guerrero', kind: 'rasgos', access: 'abierta', origin: 'bendicion', condition: 'Recompensa divina',
      features: [{ level: 8, name: 'Golpe de Akatosh', text: 'Una vez por descanso largo…', effects: [{ type: 'bono', target: 'iniciativa', value: 2 }] }],
    } },
    { ref: SHADOW_EVO, type: 'extension', version: 1, status: 'publicado', data: {
      name: 'Evolución umbría', classKey: 'shadow', kind: 'rasgos', access: 'abierta',
      features: [{ level: 2, name: 'Sombra evolucionada', text: '…', replaces: 'intercambio' }],
    } },
  ] });
}

const fighter = (n, subclass = 'campeon') => {
  let c = setRace(createCharacter(), 'Humano');
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(c, 'guerrero');
    c = applyLevelUp(c, { classKey: 'guerrero', hpRoll: 6, subclass: plan.needsSubclass ? subclass : undefined,
      improvement: plan.needsImprovement ? { type: 'asi', increases: { fuerza: 1, constitucion: 1 } } : null }).character;
  }
  return c;
};

beforeEach(async () => { resetRegistry(); await install(); });

describe('extensiones de clase', () => {
  it('valida la extensión', () => {
    expect(validateContent('extension', { name: 'X', features: [] }).errors).toEqual(expect.arrayContaining(['Elige la clase a la que se añade.', 'Añade al menos un rasgo con su nivel.']));
    expect(UNLOCK_CODE_RE.test(generateUnlockCode())).toBe(true);
    expect(normalizeUnlockCode(' abcd efgh-2345 ')).toBe('ABCD-EFGH-2345');
  });

  it('subclase abierta: se ofrece al llegar al nivel, se asigna y aplica sus rasgos', () => {
    const at2 = fighter(2);
    const plan = planLevelUp(at2, 'guerrero');
    const keys = plan.subclassOptions.map((o) => o.key);
    expect(keys).toContain(SUB_OPEN);
    expect(keys).not.toContain(SUB_SECRET); // la secreta no aparece sin código
    let c = applyLevelUp(at2, { classKey: 'guerrero', hpRoll: 6, subclass: SUB_OPEN }).character;
    expect(c.unlocks.map((u) => u.ref)).toEqual([SUB_OPEN]);
    c = applyLevelUps(c, [4, 5, 6, 7].map(() => ({ classKey: 'guerrero', hpRoll: 6, improvement: null })).map((ch, i) => (i === 0 || i === 2 ? { ...ch, improvement: { type: 'asi', increases: { fuerza: 2 } } } : ch))).character;
    const f = classFeatures(c)[0];
    expect(f.subclass).toMatchObject({ name: 'Camino del Campeón Divino', homebrew: true });
    const subTitles = f.levels.flatMap((l) => l.subFeatures.map((x) => x.title));
    expect(subTitles).toEqual(['Don divino 3', 'Aura', 'Don divino 7']);
    expect(computeSheet(c).defenses.resistencia[0]).toMatchObject({ value: 'profano' });
    // Bajar por debajo del nivel de subclase la quita (se puede volver a elegir).
    const down = applyLevelDowns(c, 2);
    expect(down.subclasses.guerrero).toBeUndefined();
    expect(computeSheet(down).defenses.resistencia).toEqual([]);
  });

  it('subclase secreta: sólo con el código correcto', async () => {
    expect(await findByCode('AAAA-BBBB-CCCC')).toBeNull();
    const entry = await findByCode(SECRET_CODE.toLowerCase());
    expect(entry.ref).toBe(SUB_SECRET);
    // Un personaje que ya tenía otra subclase la cambia por la secreta.
    let c = addUnlock(fighter(5), SUB_SECRET, SECRET_CODE);
    expect(subclassInfo('guerrero', c).options.map((o) => o.key)).toContain(SUB_SECRET);
    c = setSubclass(c, 'guerrero', SUB_SECRET).character;
    expect(classFeatures(c)[0].subclass.name).toBe('Juramento Oculto');
    // Quitar la extensión deja la subclase por elegir.
    expect(removeUnlock(c, SUB_SECRET).subclasses.guerrero).toBeUndefined();
  });

  it('habilidad especial por nivel: sólo para el personaje asignado y desde su nivel', () => {
    const other = fighter(8);
    expect(classFeatures(other)[0].levels.flatMap((l) => l.features).some((x) => x.homebrew)).toBe(false);
    expect(addableExtensions(other).map((e) => e.ref)).toContain(AKATOSH);
    let c = addUnlock(fighter(7), AKATOSH);
    const base = computeSheet(c).initiative;
    expect(classFeatures(c)[0].levels.flatMap((l) => l.features).some((x) => x.title === 'Golpe de Akatosh')).toBe(false);
    c = applyLevelUp(c, { classKey: 'guerrero', hpRoll: 6, improvement: { type: 'asi', increases: { destreza: 2 } } }).character;
    const lvl8 = classFeatures(c)[0].levels[7].features.find((x) => x.title === 'Golpe de Akatosh');
    expect(lvl8).toMatchObject({ homebrew: true, extension: 'Golpe de Akatosh', condition: 'Recompensa divina' });
    expect(computeSheet(c).initiative).toBe(base + 1 + 2); // +1 DES (de 10 a 12) y +2 de la habilidad
    // Bajar a 7: deja de aplicarse, pero la asignación (independiente del nivel) se conserva.
    const down = applyLevelDowns(c, 7);
    expect(down.unlocks.map((u) => u.ref)).toEqual([AKATOSH]);
    expect(computeSheet(down).initiative).toBe(base);
  });

  it('una extensión puede sustituir un rasgo oficial', () => {
    let c = setRace(createCharacter(), 'Humano');
    c = applyLevelUps(c, [{ classKey: 'shadow' }, { classKey: 'shadow', hpRoll: 4 }]).character;
    c = addUnlock(c, SHADOW_EVO);
    const lvl2 = classFeatures(c)[0].levels[1].features;
    expect(lvl2.find((x) => x.title === 'Intercambio').replacedBy).toBe('Sombra evolucionada');
    expect(lvl2.some((x) => x.title === 'Sombra evolucionada' && x.homebrew)).toBe(true);
  });

  it('viaja con el personaje (instantánea) y se abre sin la campaña', () => {
    let c = applyLevelUp(fighter(2), { classKey: 'guerrero', hpRoll: 6, subclass: SUB_OPEN }).character;
    c = addUnlock(c, AKATOSH);
    const doc = JSON.parse(JSON.stringify(createDocument(c)));
    expect(Object.keys(doc.character.content).sort()).toEqual([AKATOSH, SUB_OPEN].sort());
    resetRegistry();
    const { character, warnings } = parseDocument(doc);
    expect(warnings).toEqual([]);
    expect(character.subclasses.guerrero).toBe(SUB_OPEN);
    expect(classFeatures(character)[0].subclass.name).toBe('Camino del Campeón Divino');
  });
});
