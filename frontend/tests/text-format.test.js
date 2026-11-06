import { describe, it, expect } from 'vitest';
import { parseTraitSections, parseClassBasics, proseToHtml, plainText } from '../src/domain/text-format.js';
import { data } from '../src/data/index.js';

describe('rasgos raciales', () => {
  it('separa encabezado, nombre y descripción de cada rasgo', () => {
    const [s] = parseTraitSections('Rasgos de Raza:\n♻ Visión en la Oscuridad. Ves en la oscuridad.\n♻ Ascendencia Feérica. Ventaja contra encantamientos.');
    expect(s.heading).toBe('Rasgos de Raza');
    expect(s.items).toEqual([
      { title: 'Visión en la Oscuridad', body: 'Ves en la oscuridad.', children: [] },
      { title: 'Ascendencia Feérica', body: 'Ventaja contra encantamientos.', children: [] },
    ]);
  });

  it('agrupa sub-viñetas y texto libre', () => {
    const [s] = parseTraitSections('♻ Aliento. Elige un tipo:\n:: Fuego\n:: Frío\nNotas sueltas');
    expect(s.items[0].children).toEqual(['Fuego', 'Frío']);
    expect(s.items[0].body).toContain('Notas sueltas');
  });

  it('acepta texto escrito por el usuario sin viñetas', () => {
    const sections = parseTraitSections('Mi personaje odia el frío.');
    expect(sections[0].notes).toEqual(['Mi personaje odia el frío.']);
  });

  it('interpreta todas las razas sin perder rasgos', () => {
    for (const [name, race] of Object.entries(data.races)) {
      const bullets = race.info.split('\n').filter((l) => /^\s*(♻|❖|•|\*)/.test(l)).length;
      const parsed = parseTraitSections(race.info).flatMap((s) => s.items).length;
      expect(parsed, name).toBe(bullets);
    }
  });
});

describe('atributos de clase', () => {
  it('convierte ❖ y :: en etiquetas y valores', () => {
    const basics = parseClassBasics('Atributos de clase:\n❖ Tiradas de Salvación: Fuerza, Constitución.\n❖ Competencias:\n    :: Armadura: Ligera.\n    :: Armas: Simples.\n    ::');
    expect(basics).toEqual([
      { label: 'Tiradas de Salvación', value: 'Fuerza, Constitución.', items: [] },
      { label: 'Competencias', value: '', items: [{ label: 'Armadura', value: 'Ligera.' }, { label: 'Armas', value: 'Simples.' }] },
    ]);
  });
});

describe('prosa', () => {
  it('convierte viñetas en listas y respeta párrafos', () => {
    expect(proseToHtml('Intro\n— uno\n— dos\n\nFinal')).toBe('<p>Intro</p><ul><li>uno</li><li>dos</li></ul><p>Final</p>');
  });
  it('quita etiquetas para buscar', () => {
    expect(plainText('<b class="x">Hola</b>  mundo')).toBe('Hola mundo');
  });
});
