// Valores calculados que se actualizan en vivo mientras el usuario escribe,
// sin re-renderizar la pestaña (para no perder el foco del campo).

import { ABILITY_KEYS } from '../../domain/constants.js';
import { formatModifier } from '../../domain/rules.js';

export function computeOutputs(character, sheet) {
  const o = {
    name: character.identity.name.trim() || 'Personaje sin nombre',
    level: sheet.level || '—',
    proficiency: formatModifier(sheet.proficiency),
    initiative: formatModifier(sheet.initiative),
    passivePerception: sheet.passivePerception,
    hpMax: sheet.hp.max,
    xpLevel: sheet.xpLevel,
  };
  for (const k of ABILITY_KEYS) {
    const s = sheet.scores[k];
    o[`ability.${k}.total`] = s.total;
    o[`ability.${k}.mod`] = formatModifier(s.modifier);
    o[`ability.${k}.extra`] = [s.racial ? `${formatModifier(s.racial)} raza` : '', s.improvements ? `${formatModifier(s.improvements)} mejoras` : ''].filter(Boolean).join(' · ') || 'sin bonificaciones';
  }
  for (const s of sheet.skills) {
    o[`skill.${s.name}`] = formatModifier(s.bonus);
    o[`skill.${s.name}.passive`] = s.passive;
  }
  for (const s of sheet.saves) o[`save.${s.ability}`] = formatModifier(s.bonus);
  for (const e of sheet.spellcasting.entries) {
    o[`cast.${e.classKey}.dc`] = e.dc;
    o[`cast.${e.classKey}.attack`] = formatModifier(e.attack);
    o[`cast.${e.classKey}.prepared`] = e.prepared ?? '—';
  }
  if (sheet.spellcasting.featGranted) {
    o['cast.feat.dc'] = sheet.spellcasting.featGranted.dc;
    o['cast.feat.attack'] = formatModifier(sheet.spellcasting.featGranted.attack);
  }
  for (const [id, pct] of Object.entries({ 50: 50, 75: 75 })) o[`creatureHp.${id}`] = Math.floor((sheet.hp.max * pct) / 100);
  return o;
}

export function applyOutputs(root, values) {
  for (const el of root.querySelectorAll('[data-out]')) {
    const v = values[el.dataset.out];
    if (v !== undefined && el.textContent !== String(v)) el.textContent = v;
  }
  for (const el of root.querySelectorAll('[data-over-cap]')) {
    el.hidden = !values[`overcap.${el.dataset.overCap}`];
  }
}
