// Pestaña «Progresión»: raza (con sus elecciones), niveles de clase y mejoras.

import { html, raw, richText } from '../../ui/dom.js';
import { ABILITY_KEYS, ABILITY_LABEL, MAX_LEVEL } from '../../domain/constants.js';
import { raceChoiceGroups, formatModifier, featAbilityOptions, subclassInfo } from '../../domain/rules.js';
import { getRace, getClass, getFeat, raceHasToughness, data, raceName, featName } from '../../data/index.js';
import {
  setRace, setRaceAbilityChoice, setRaceLanguages, raceAllowsFeat, raceFeatOptions, setRaceFeat, applyLevelDown, canLevelUp,
} from '../../domain/progression.js';
import { sectionCard, actionButton } from './common.js';
import { openRacePicker } from '../race-picker.js';
import { renderBackgroundCard } from './background.js';
import { pendingSpellChoices, pendingDeferredChoices } from '../../domain/class-choices.js';
import { openLevelUpWizard, openFeatPicker, openMultiLevelUp, openMultiLevelDown } from '../level-up.js';
import { confirmDialog, toast } from '../../ui/feedback.js';

export function raceBonusText(race) {
  if (!race) return '';
  const fixed = ABILITY_KEYS.filter((k) => race[k]).map((k) => `${ABILITY_LABEL[k]} ${formatModifier(race[k])}`);
  const groups = raceChoiceGroups(race).map((g) => `+${g.bonus} a ${g.count} a elegir`);
  return [...fixed, ...groups].join(' · ');
}

function improvementText(l) {
  if (!l.improvement) return '';
  if (l.improvement.type === 'asi') {
    return Object.entries(l.improvement.increases).map(([k, v]) => `${ABILITY_LABEL[k]} +${v}`).join(', ');
  }
  return `Dote: ${featName(l.improvement.name)}${l.improvement.ability ? ` (${ABILITY_LABEL[l.improvement.ability]} +1)` : ''}`;
}

function raceChoices(ctx, race) {
  const groups = raceChoiceGroups(race);
  if (!groups.length) return '';
  const chosen = ctx.character.race.abilityChoices;
  return html`<div class="stack stack--sm">
    ${groups.map((g, i) => {
      const mine = chosen[i] ?? [];
      const elsewhere = new Set(chosen.flatMap((x, j) => (j === i ? [] : x)));
      const complete = mine.length === g.count;
      return html`<fieldset class="choice-group">
        <legend>Bonificación racial: elige ${g.count} atributo${g.count > 1 ? 's' : ''} (+${g.bonus}) ${complete ? html`<span class="badge badge--success">Listo</span>` : html`<span class="badge badge--warning">${mine.length}/${g.count}</span>`}</legend>
        <div class="chips">
          ${g.allowed.map((k) => {
            const checked = mine.includes(k);
            const disabled = ctx.readOnly || (!checked && (elsewhere.has(k) || mine.length >= g.count));
            return html`<label class="chip"><input type="checkbox" data-race-choice="${i}" value="${k}" ${checked ? raw('checked') : ''} ${disabled ? raw('disabled') : ''}>${ABILITY_LABEL[k]}</label>`;
          })}
        </div>
      </fieldset>`;
    })}
  </div>`;
}

function languages(ctx) {
  const info = ctx.sheet.languages;
  return html`<div class="stack stack--sm">
    <p class="muted">${info.description || 'Sin información de idiomas.'}</p>
    ${info.picks > 0 ? html`<fieldset class="choice-group">
      <legend>Idiomas adicionales: elige ${info.picks} ${info.chosen.length === info.picks ? html`<span class="badge badge--success">Listo</span>` : html`<span class="badge badge--warning">${info.chosen.length}/${info.picks}</span>`}</legend>
      <div class="chips">
        ${(info.raceOptions && info.picks === 1 ? info.raceOptions : info.options).map((l) => {
          const checked = info.chosen.includes(l);
          const disabled = ctx.readOnly || (!checked && info.chosen.length >= info.picks);
          return html`<label class="chip"><input type="checkbox" data-language value="${l}" ${checked ? raw('checked') : ''} ${disabled ? raw('disabled') : ''}>${l}</label>`;
        })}
      </div>
    </fieldset>` : ''}
  </div>`;
}

function raceFeat(ctx) {
  if (!raceAllowsFeat(ctx.character)) return '';
  const current = ctx.character.race.feat;
  const def = getFeat(current?.name);
  const options = featAbilityOptions(def);
  return html`<fieldset class="choice-group">
    <legend>Dote racial ${current ? html`<span class="badge badge--success">${featName(current.name)}</span>` : html`<span class="badge badge--warning">Pendiente</span>`}</legend>
    ${ctx.readOnly
      ? (def ? html`<div class="rich">${richText(def.habilidad)}</div>` : html`<p class="muted">Sin dote elegida.</p>`)
      : html`<div class="row">
          <button type="button" class="btn btn--ghost" data-action="pick-race-feat">${current ? 'Cambiar dote' : 'Elegir dote'}</button>
          ${current ? html`<button type="button" class="btn btn--ghost btn--sm" data-action="clear-race-feat">Quitar</button>` : ''}
        </div>`}
    ${current && options.length ? html`<p class="muted">Aumenta ${ABILITY_LABEL[current.ability] ?? '—'} en +1.</p>` : ''}
  </fieldset>`;
}

function raceCard(ctx) {
  const race = getRace(ctx.character.race.key);
  const key = ctx.character.race.key;
  return sectionCard({
    title: key ? `Raza: ${raceName(key)}` : 'Raza',
    subtitle: race ? raceBonusText(race) : key ? 'Esta raza no existe en los datos actuales.' : 'Tu raza otorga bonificaciones, velocidades e idiomas.',
    actions: actionButton(ctx, { action: 'pick-race', label: key ? 'Cambiar raza' : 'Elegir raza', variant: key ? 'btn--ghost' : 'btn--primary' }),
    body: race ? html`<div class="stack">
      ${raceHasToughness(key) ? html`<p><span class="badge badge--gold">${data.raceBadges[key].icono} ${data.raceBadges[key].texto}</span></p>` : ''}
      ${raceChoices(ctx, race)}
      ${languages(ctx)}
      ${raceFeat(ctx)}
    </div>` : '',
  });
}

function levelsCard(ctx) {
  const { character: c, sheet } = ctx;
  const gate = canLevelUp(c);
  const subclasses = Object.entries(c.subclasses).map(([k, s]) => {
    const sub = subclassInfo(k);
    const info = sub?.options.find((o) => o.key === s);
    return `${getClass(k)?.nombre ?? k} (${sub?.label ?? 'Subclase'}): ${info?.name ?? s}`;
  });
  const actions = ctx.readOnly ? '' : html`
    ${c.levels.length ? html`<button type="button" class="btn btn--ghost" data-action="level-down">↓ Bajar nivel</button>` : ''}
    ${c.levels.length > 1 ? html`<button type="button" class="btn btn--ghost" data-action="level-down-multi">⇊ Bajar varios niveles</button>` : ''}
    ${c.levels.length && gate.ok && c.levels.length < 19 ? html`<button type="button" class="btn btn--ghost" data-action="level-up-multi">⇈ Subir varios niveles</button>` : ''}
    <button type="button" class="btn btn--primary" data-action="level-up" ${gate.ok ? '' : raw('aria-disabled="true"')} title="${gate.reason}">↑ ${c.levels.length ? 'Subir de nivel' : 'Nivel 1: elegir clase'}</button>`;
  return sectionCard({
    title: `Nivel ${sheet.level} de ${MAX_LEVEL}`,
    subtitle: subclasses.length ? subclasses.join(' · ') : 'Cada nivel guarda su clase, su tirada de golpe y su mejora.',
    actions,
    body: c.levels.length === 0
      ? html`<p class="muted">${gate.ok ? 'Pulsa «Nivel 1» para elegir la clase inicial de tu personaje.' : gate.reason}</p>`
      : html`<div class="table-wrap"><table class="table">
          <thead><tr><th class="num">Nivel</th><th>Clase</th><th class="num">Dado</th><th class="num">PG</th><th>Mejora</th></tr></thead>
          <tbody>
            ${sheet.hp.perLevel.map((p, i) => html`<tr>
              <td class="num">${p.level}</td>
              <td>${getClass(p.classKey)?.nombre ?? p.classKey}</td>
              <td class="num">d${p.die} → ${p.roll}</td>
              <td class="num" title="${p.roll} dado ${formatModifier(p.conMod)} CON${p.extra ? ` +${p.extra} rasgos` : ''}">${p.total}</td>
              <td>${improvementText(c.levels[i])}</td>
            </tr>`)}
          </tbody>
          <tfoot><tr><td></td><td colspan="2"><strong>PG máximos</strong></td><td class="num"><strong>${sheet.hp.max}</strong></td><td>${sheet.hp.tough ? 'Incluye Dureza racial' : ''}${sheet.hp.duro ? ' · Dote «Duro»' : ''}</td></tr></tfoot>
        </table></div>`,
  });
}

export function renderProgression(ctx) {
  return html`<div class="stack">${raceCard(ctx)}${renderBackgroundCard(ctx)}${levelsCard(ctx)}</div>`;
}

/** Recordatorio tras subir: lo diferible (conjuros, esquemas) se elige en su pestaña. */
function spellHint(c) {
  const classes = [...new Set(c.levels.map((l) => l.classKey))];
  const pending = classes.reduce((t, k) => t + pendingSpellChoices(c, k).reduce((n, m) => n + m.cantidad, 0), 0);
  const taller = pendingDeferredChoices(c, 'taller').reduce((n, m) => n + m.cantidad, 0);
  const parts = [];
  if (pending) parts.push(`Tienes ${pending} conjuro${pending === 1 ? '' : 's'} por elegir en la pestaña Conjuros.`);
  if (taller) parts.push(`Tienes ${taller} esquema${taller === 1 ? '' : 's'} por elegir en la pestaña Taller.`);
  if (!parts.length && getClass(c.levels.at(-1)?.classKey)?.conjurador) parts.push('Revisa tus conjuros nuevos en la pestaña Conjuros.');
  return parts.length ? ` ${parts.join(' ')}` : '';
}

export const progressionActions = {
  async 'pick-race'(ed) {
    const c = ed.character;
    if (c.race.key && c.levels.length) {
      const ok = await confirmDialog({
        title: 'Cambiar raza',
        message: 'Cambiar la raza reinicia sus elecciones (bonificaciones, idiomas y dote racial). Tus niveles se conservan.',
        confirmLabel: 'Cambiar raza',
      });
      if (!ok) return;
    }
    const perms = ed.permissions;
    const key = await openRacePicker(c.race.key, { official: perms.official.raza, homebrew: perms.homebrew.raza });
    if (key) ed.replace(setRace(ed.character, key), { message: `Raza: ${key}` });
  },
  async 'pick-race-feat'(ed) {
    const only = raceFeatOptions(ed.character);
    const choice = await openFeatPicker(ed.character, { title: only ? 'Legado / dote de tu raza' : 'Dote racial', excludeRaceFeat: true, allow: ed.permissions, only });
    if (!choice) return;
    const res = setRaceFeat(ed.character, choice);
    if (res.errors.length) return toast(res.errors.join(' '), { type: 'error' });
    ed.replace(res.character);
  },
  'clear-race-feat': (ed) => ed.replace(setRaceFeat(ed.character, null).character),
  async 'level-up'(ed) {
    const gate = canLevelUp(ed.character);
    if (!gate.ok) return toast(gate.reason, { type: 'warning' });
    const next = await openLevelUpWizard(ed.character, { allow: ed.permissions });
    if (next) ed.replace(next, { message: `¡Nivel ${next.levels.length}!${spellHint(next)}` });
  },
  async 'level-up-multi'(ed) {
    const from = ed.character.levels.length;
    const next = await openMultiLevelUp(ed.character, { allow: ed.permissions });
    if (next) ed.replace(next, { message: `Nivel ${from} → ${next.levels.length}.${spellHint(next)}` });
  },
  async 'level-down-multi'(ed) {
    const from = ed.character.levels.length;
    const next = await openMultiLevelDown(ed.character);
    if (next) ed.replace(next, { message: `Nivel ${from} → ${next.levels.length}.` });
  },
  async 'level-down'(ed) {
    const c = ed.character;
    const last = c.levels.at(-1);
    const ok = await confirmDialog({
      title: 'Bajar de nivel',
      message: `Se eliminará el nivel ${c.levels.length} (${getClass(last.classKey)?.nombre ?? last.classKey}) con su tirada de PG y su mejora${last.improvement ? ` (${improvementText(last)})` : ''}.`,
      confirmLabel: 'Bajar nivel', danger: true,
    });
    if (ok) ed.replace(applyLevelDown(c), { message: `Ahora eres nivel ${c.levels.length - 1}.` });
  },
};

export const progressionChanges = {
  'race-choice'(ed, el) {
    const group = Number(el.dataset.raceChoice);
    const boxes = [...ed.root.querySelectorAll(`[data-race-choice="${group}"]:checked`)].map((b) => b.value);
    ed.replace(setRaceAbilityChoice(ed.character, group, boxes));
  },
  language(ed) {
    const picks = ed.sheet.languages.picks;
    const chosen = [...ed.root.querySelectorAll('[data-language]:checked')].map((b) => b.value);
    ed.replace(setRaceLanguages(ed.character, chosen, picks));
  },
};
