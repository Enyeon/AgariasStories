import { describe, it, expect, vi } from 'vitest';
import { createCharacter, createDocument, SCHEMA_VERSION } from '../src/domain/schema.js';
import { normalizeCharacter, parseDocument, InvalidDocumentError } from '../src/domain/validation.js';
import { migrateDocument } from '../src/domain/migrations.js';
import { createLocalStore } from '../src/services/local-store.js';
import { createCharacterService } from '../src/services/characters.js';
import { serializeForExport, parseCharacterText, exportFileName, readCharacterFile } from '../src/services/file-transfer.js';
import { ApiError, createApi } from '../src/services/api.js';
import { applyLevelUp, applyLevelDown, setRace, setRaceAbilityChoice, validateImprovement, addEpicBoon } from '../src/domain/progression.js';
import { abilityScores } from '../src/domain/rules.js';

function sampleCharacter() {
  let c = setRace(createCharacter(), 'Medio Elfo');
  c = setRaceAbilityChoice(c, 0, ['fuerza', 'constitucion']);
  c.identity.name = 'Kael, hija de la Tormenta';
  c.identity.alignment = 'Caótico bueno';
  c.abilities = { fuerza: 15, destreza: 12, constitucion: 14, inteligencia: 8, sabiduria: 10, carisma: 13 };
  c.proficiencies.skills = ['Atletismo', 'Percepción'];
  c.equipment.items = [{ name: 'Cuerda', quantity: 1, notes: '15 m' }];
  c.notes.backstory = 'Línea 1\nLínea 2 con «comillas» y emojis 🐉';
  ({ character: c } = applyLevelUp(c, { classKey: 'barbaro' }));
  ({ character: c } = applyLevelUp(c, { classKey: 'barbaro', hpRoll: 7 }));
  return c;
}

/** Simula el backend en memoria con la misma semántica que FastAPI. */
function fakeServer() {
  const db = new Map();
  let seq = 0;
  const api = {
    async createCharacter(document) {
      const id = `id${String(++seq).padStart(14, '0')}`;
      db.set(id, { document: structuredClone(document), revision: 1, token: `tok-${id}` });
      return { id, editToken: `tok-${id}`, revision: 1, updatedAt: 'now', document };
    },
    async getCharacter(id) {
      const row = db.get(id);
      if (!row) throw new ApiError('not_found', 'No existe', 404);
      return { id, document: structuredClone(row.document), revision: row.revision, updatedAt: 'now' };
    },
    async updateCharacter(id, document, { token, revision }) {
      const row = db.get(id);
      if (!row) throw new ApiError('not_found', 'No existe', 404);
      if (token !== row.token) throw new ApiError('forbidden', 'No', 403);
      if (revision !== undefined && revision !== row.revision) throw new ApiError('conflict', 'Conflicto', 409);
      row.document = structuredClone(document);
      row.revision += 1;
      return { id, revision: row.revision, updatedAt: 'now', document };
    },
    async deleteCharacter(id, token) {
      const row = db.get(id);
      if (!row) throw new ApiError('not_found', 'No existe', 404);
      if (token !== row.token) throw new ApiError('forbidden', 'No', 403);
      db.delete(id);
      return null;
    },
  };
  return { api, db };
}

describe('validación y normalización', () => {
  it('rellena valores predeterminados de un objeto vacío', () => {
    const { character } = normalizeCharacter({});
    expect(character).toEqual(createCharacter());
  });

  it('corrige tipos y rangos inválidos', () => {
    const { character, warnings } = normalizeCharacter({
      identity: { name: 42, portrait: 'javascript:alert(1)' },
      abilities: { fuerza: 99, destreza: '14', constitucion: 'abc' },
      proficiencies: { skills: ['Atletismo', 'Inventada', 'Atletismo'] },
      combat: { armorClass: -5 },
    });
    expect(character.identity.name).toBe('42');
    expect(character.identity.portrait).toBeNull();
    expect(character.abilities.fuerza).toBe(30);
    expect(character.abilities.destreza).toBe(14);
    expect(character.abilities.constitucion).toBe(10);
    expect(character.proficiencies.skills).toEqual(['Atletismo']);
    expect(character.combat.armorClass).toBe(0);
    expect(warnings.some((w) => w.includes('retrato'))).toBe(true);
  });

  it('corta el historial en el primer nivel inválido', () => {
    const { character, warnings } = normalizeCharacter({
      levels: [{ classKey: 'mago', hpRoll: 6 }, { hpRoll: 3 }, { classKey: 'mago', hpRoll: 2 }],
    });
    expect(character.levels).toHaveLength(1);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('conserva claves de raza/clase desconocidas avisando', () => {
    const { character, warnings } = normalizeCharacter({ race: { key: 'Raza Futura' }, levels: [{ classKey: 'clase-futura', hpRoll: 4 }] });
    expect(character.race.key).toBe('Raza Futura');
    expect(character.levels[0].classKey).toBe('clase-futura');
    expect(warnings).toHaveLength(2);
  });

  it('rechaza documentos ajenos, versiones futuras y JSON corrupto', () => {
    expect(() => parseDocument('texto')).toThrow(InvalidDocumentError);
    expect(() => parseDocument({ format: 'otro', schemaVersion: 1, character: {} })).toThrow(/no es un personaje/);
    expect(() => parseDocument({ ...createDocument(createCharacter()), schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/más nueva/);
    expect(() => parseCharacterText('{"roto": ')).toThrow(/dañado/);
  });
});

describe('migraciones', () => {
  it('convierte el formato de Firestore de la versión original', () => {
    const legacy = {
      nombre: 'Vieja Ficha', raza: 'Medio Elfo', trasfondo: 'Huérfano', alineamiento: 'Neutral',
      imagenSrc: '', stats: { fuerza: '16', destreza: '12', constitucion: '14', inteligencia: '10', sabiduria: '8', carisma: '13' },
      habilidades: [], salvaciones: [], fecha: '2025-05-01',
    };
    const migrated = migrateDocument(legacy);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    const { character, warnings } = parseDocument(legacy);
    expect(character.identity.name).toBe('Vieja Ficha');
    expect(character.abilities.fuerza).toBe(16);
    expect(character.race.key).toBe('Medio Elfo');
    expect(warnings[0]).toMatch(/versión anterior/);
  });

  it('convierte el formato localStorage original restando mejoras ya aplicadas', () => {
    const { character } = parseDocument({
      stats: { fuerza: 18, destreza: 10, constitucion: 10, inteligencia: 10, sabiduria: 10, carisma: 10 },
      raza: 'Medio Elfo', clases: { guerrero: 4 }, nivel: 4, mejoras: { 4: [{ stat: 'fuerza', value: 2 }] },
    });
    expect(character.abilities.fuerza).toBe(16);
    expect(character.levels).toHaveLength(4);
    expect(character.levels[3].improvement).toEqual({ type: 'asi', increases: { fuerza: 2 } });
    expect(abilityScores(character).fuerza.total).toBe(18);
  });
});

describe('progresión', () => {
  it('sube y baja de nivel sin dejar restos', () => {
    let c = setRace(createCharacter(), 'Medio Elfo');
    for (let i = 0; i < 3; i++) {
      ({ character: c } = applyLevelUp(c, { classKey: 'guerrero', hpRoll: 6, subclass: 'campeon' }));
    }
    const asi = { type: 'asi', increases: { fuerza: 2 } };
    const res = applyLevelUp(c, { classKey: 'guerrero', hpRoll: 6, improvement: asi });
    expect(res.errors).toEqual([]);
    const before = abilityScores(c).fuerza.total;
    expect(abilityScores(res.character).fuerza.total).toBe(before + 2);
    const down = applyLevelDown(res.character);
    expect(down).toEqual(c);
    const toTwo = applyLevelDown(down);
    expect(toTwo.subclasses.guerrero).toBeUndefined();
  });

  it('exige raza, tirada de PG, subclase y mejora cuando corresponde', () => {
    expect(applyLevelUp(createCharacter(), { classKey: 'mago' }).errors[0]).toMatch(/raza/);
    let c = setRace(createCharacter(), 'Medio Elfo');
    ({ character: c } = applyLevelUp(c, { classKey: 'mago' }));
    expect(applyLevelUp(c, { classKey: 'mago' }).errors[0]).toMatch(/dado/);
    expect(applyLevelUp(c, { classKey: 'mago', hpRoll: 7 }).errors[0]).toMatch(/dado/); // d6
    ({ character: c } = applyLevelUp(c, { classKey: 'mago', hpRoll: 4 }));
    expect(applyLevelUp(c, { classKey: 'mago', hpRoll: 4 }).errors).toContain('Elige una subclase.');
  });

  it('valida mejoras de atributo y límites', () => {
    const c = setRace(createCharacter(), 'Medio Elfo');
    c.abilities.fuerza = 19;
    expect(validateImprovement(c, { type: 'asi', increases: { fuerza: 2 } })[0]).toMatch(/superar 20/);
    expect(validateImprovement(c, { type: 'asi', increases: { fuerza: 1, destreza: 1 } })).toEqual([]);
    expect(validateImprovement(c, { type: 'asi', increases: { fuerza: 1 } })[0]).toMatch(/exactamente 2/);
    expect(validateImprovement(c, { type: 'feat', name: 'Actor' })).toEqual([]);
    expect(validateImprovement(c, { type: 'feat', name: 'Resiliente' })[0]).toMatch(/atributo/);
  });

  it('bendiciones épicas requieren permiso del DM y nivel 20', () => {
    let c = setRace(createCharacter(), 'Medio Elfo');
    expect(addEpicBoon(c, { name: 'Bendición épica de la fortaleza' }).errors[0]).toMatch(/DM/);
    c.settings.allowEpicBoons = true;
    expect(addEpicBoon(c, { name: 'Bendición épica de la fortaleza' }).errors[0]).toMatch(/nivel 20/);
  });
});

describe('almacenamiento local (IndexedDB)', () => {
  it('guarda, lista, carga y elimina registros', async () => {
    const store = createLocalStore();
    const service = createCharacterService({ store, api: fakeServer().api });
    const character = sampleCharacter();
    const record = await service.create(character);
    const list = await service.list();
    expect(list.some((r) => r.id === record.id)).toBe(true);
    const opened = await service.open(record.id);
    expect(opened.character).toEqual(character);
    expect(opened.record.summary.classes).toBe('Bárbaro 2');
    await service.remove(record.id);
    expect(await service.open(record.id)).toBeNull();
  });

  it('los datos sobreviven a una nueva instancia (cerrar y reabrir)', async () => {
    const character = sampleCharacter();
    const first = createCharacterService({ store: createLocalStore(), api: fakeServer().api });
    const record = await first.create(character);
    const modified = structuredClone(character);
    modified.identity.name = 'Kael II';
    await first.save(record, modified);

    const reopened = createCharacterService({ store: createLocalStore(), api: fakeServer().api });
    const opened = await reopened.open(record.id);
    expect(opened.character.identity.name).toBe('Kael II');
    expect(opened.character.levels).toEqual(character.levels);
  });
});

describe('exportar / importar', () => {
  it('ida y vuelta sin pérdida de datos', () => {
    const character = sampleCharacter();
    const json = serializeForExport(character);
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe('agarias-dnd-character');
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    const { character: back, warnings } = parseCharacterText(json);
    expect(back).toEqual(character);
    expect(warnings).toEqual([]);
  });

  it('genera nombres de archivo seguros', () => {
    expect(exportFileName('Kael, hija de la Tormenta')).toBe('kael-hija-de-la-tormenta.json');
    expect(exportFileName('../../etc')).toBe('etc.json');
    expect(exportFileName('')).toBe('personaje.json');
  });

  it('rechaza archivos incorrectos', async () => {
    await expect(readCharacterFile(new File(['hola'], 'x.txt', { type: 'text/plain' }))).rejects.toThrow(/dañado/);
    await expect(readCharacterFile(new File(['{}'], 'x.png', { type: 'image/png' }))).rejects.toThrow(/\.json/);
    await expect(readCharacterFile(new File(['{"a":1}'], 'x.json', { type: 'application/json' }))).rejects.toThrow(/no es un personaje|no contiene/);
  });
});

describe('compartir', () => {
  it('publica, abre el enlace y recupera los mismos datos', async () => {
    const { api } = fakeServer();
    const service = createCharacterService({ store: createLocalStore(), api });
    const character = sampleCharacter();
    let record = await service.create(character);
    record = await service.publish(record, character);
    expect(record.cloud.id).toHaveLength(16);
    const shared = await service.loadShared(record.cloud.id);
    expect(shared.character).toEqual(character);

    const edited = structuredClone(character);
    edited.identity.name = 'Kael editada';
    record = await service.publish(record, edited);
    expect(record.cloud.revision).toBe(2);
    expect((await service.loadShared(record.cloud.id)).character.identity.name).toBe('Kael editada');
  });

  it('detecta conflictos y permite forzar', async () => {
    const { api, db } = fakeServer();
    const service = createCharacterService({ store: createLocalStore(), api });
    const character = sampleCharacter();
    let record = await service.publish(await service.create(character), character);
    db.get(record.cloud.id).revision = 5; // otro dispositivo guardó
    await expect(service.publish(record, character)).rejects.toMatchObject({ code: 'conflict' });
    record = await service.publish(record, character, { force: true });
    expect(record.cloud.revision).toBe(6);
  });

  it('republica si la copia en línea fue eliminada', async () => {
    const { api, db } = fakeServer();
    const service = createCharacterService({ store: createLocalStore(), api });
    const character = sampleCharacter();
    let record = await service.publish(await service.create(character), character);
    const oldId = record.cloud.id;
    db.clear();
    record = await service.publish(record, character);
    expect(record.cloud.id).not.toBe(oldId);
  });
});

describe('cliente HTTP', () => {
  it('convierte errores de red y HTTP en mensajes para el usuario', async () => {
    const offline = createApi(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(offline.getCharacter('x')).rejects.toMatchObject({ code: 'network' });

    const notFound = createApi(vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'not_found', message: 'No existe ningún personaje con ese enlace.' } }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    )));
    await expect(notFound.getCharacter('x')).rejects.toMatchObject({ code: 'not_found', status: 404 });

    const unavailable = createApi(vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'sharing_unavailable', message: 'Compartir por enlace no está disponible en esta versión de la aplicación.' } }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    )));
    await expect(unavailable.createCharacter({})).rejects.toMatchObject({ code: 'sharing_unavailable', userMessage: expect.stringMatching(/no está disponible/) });

    const html500 = createApi(vi.fn().mockResolvedValue(new Response('<h1>Bad gateway</h1>', { status: 502 })));
    const err = await html500.getCharacter('x').catch((e) => e);
    expect(err.userMessage).not.toMatch(/TypeError|undefined/);
  });
});
