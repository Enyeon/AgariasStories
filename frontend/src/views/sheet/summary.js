// Pestaña «Resumen»: identidad básica, atributos, combate, salvaciones y habilidades.

import { html, raw } from '../../ui/dom.js';
import { ABILITIES, ABILITY_DESCRIPTIONS, ALIGNMENTS, XP_BY_LEVEL, ABILITY_LABEL } from '../../domain/constants.js';
import { classLevels } from '../../domain/rules.js';
import { getClass, raceName } from '../../data/index.js';
import { sourcesLabel } from '../../domain/proficiencies.js';
import { DAMAGE_LABEL } from '../../domain/effects.js';
import { textField, numberField, selectField, out, mod, actionButton, sectionCard, bindAttrs } from './common.js';

function identityStrip(ctx) {
  const { character: c, sheet } = ctx;
  const classes = Object.entries(classLevels(c)).map(([k, n]) => `${getClass(k)?.nombre ?? k} ${n}`).join(' / ');
  const nextXp = XP_BY_LEVEL[Math.min(sheet.level, 19)];
  return html`
    <section class="card identity-strip">
      <div class="form-grid">
        ${textField(ctx, { label: 'Nombre del personaje', path: 'identity.name', placeholder: 'Ej.: Kael, hija de la Tormenta' })}
        <div class="field">
          <span class="field__label">Raza</span>
          <span class="static-value">${c.race.key ? raceName(c.race.key) : '—'} ${ctx.readOnly ? '' : html`<button type="button" class="link-btn" data-action="goto-tab" data-tab="progresion">${c.race.key ? 'Cambiar' : 'Elegir'}</button>`}</span>
        </div>
        <div class="field">
          <span class="field__label">Clase y nivel</span>
          <span class="static-value">${classes || '—'} ${ctx.readOnly ? '' : html`<button type="button" class="link-btn" data-action="goto-tab" data-tab="progresion">${sheet.level ? 'Subir de nivel' : 'Elegir clase'}</button>`}</span>
        </div>
        ${selectField(ctx, { label: 'Alineamiento', path: 'identity.alignment', options: ALIGNMENTS })}
        <div class="field">
          <span class="field__label">Trasfondo</span>
          <span class="static-value">${sheet.background?.name || '—'} ${ctx.readOnly ? '' : html`<button type="button" class="link-btn" data-action="goto-tab" data-tab="progresion">${sheet.background ? 'Ver' : 'Elegir'}</button>`}</span>
        </div>
        ${numberField(ctx, { label: 'Experiencia (PX)', path: 'experience', min: 0, max: 10000000, hint: sheet.level && sheet.level < 20 ? `Siguiente nivel a ${nextXp.toLocaleString('es')} PX` : '' })}
      </div>
    </section>`;
}

function abilityCard(ctx, a) {
  const s = ctx.sheet.scores[a.key];
  return html`
    <div class="ability" title="${ABILITY_DESCRIPTIONS[a.key]}">
      <span class="ability__label">${a.label}</span>
      <span class="ability__mod">${out(`ability.${a.key}.mod`, mod(s.modifier))}</span>
      <span class="ability__total">Puntuación ${out(`ability.${a.key}.total`, s.total)}</span>
      <label class="ability__base">
        <span>Base</span>
        <input class="input input--num" type="number" inputmode="numeric" min="1" max="30" value="${s.base}" aria-label="${a.label} base" ${bindAttrs(`abilities.${a.key}`, 'int', ctx.readOnly)} data-min="1" data-max="30">
      </label>
      <span class="ability__extra">${out(`ability.${a.key}.extra`, '')}</span>
      ${s.overCap ? html`<span class="badge badge--warning" title="Supera el máximo permitido (${s.cap})">⚠ máx. ${s.cap}</span>` : ''}
    </div>`;
}

/** «Defensa sin armadura» calculada por los rasgos: la CA sigue siendo manual. */
function unarmoredHint(ctx) {
  const u = ctx.sheet.unarmoredDefense?.[0];
  if (!u) return '';
  const formula = `${u.base} + ${u.atributos.map((k) => ABILITY_LABEL[k].slice(0, 3).toUpperCase()).join(' + ')}`;
  return html`<p class="stat-box__hint" title="${u.label}: ${formula}, sin armadura${u.escudo ? ' (admite escudo)' : ' ni escudo'}">
    Sin armadura: <strong>${out('unarmoredAc', u.value)}</strong>${u.escudo ? ' + escudo' : ''}
    ${ctx.readOnly ? '' : html`<button type="button" class="link-btn" data-action="use-unarmored-ac">Usar</button>`}
  </p>`;
}

function combatStrip(ctx) {
  const { character: c, sheet } = ctx;
  const walk = sheet.speeds.find((s) => s.key === 'velocidad');
  const current = c.combat.currentHp;
  return html`
    <section class="card">
      <div class="combat-grid">
        <div class="stat-box">
          <label class="stat-box__label" for="ac-input">Clase de armadura</label>
          <input id="ac-input" class="input input--num stat-box__input" type="number" min="0" max="99" value="${c.combat.armorClass}" ${bindAttrs('combat.armorClass', 'int', ctx.readOnly)} data-min="0" data-max="99">
          ${unarmoredHint(ctx)}
        </div>
        <div class="stat-box"><span class="stat-box__label">Iniciativa</span><span class="stat-box__value">${out('initiative', mod(sheet.initiative))}</span></div>
        <div class="stat-box"><span class="stat-box__label">Velocidad</span><span class="stat-box__value">${walk?.value ?? 30}<small> pies</small></span></div>
        <div class="stat-box"><span class="stat-box__label">Competencia</span><span class="stat-box__value">${out('proficiency', mod(sheet.proficiency))}</span></div>
        <div class="stat-box"><span class="stat-box__label">Percepción pasiva</span><span class="stat-box__value">${out('passivePerception', sheet.passivePerception)}</span></div>
        <div class="stat-box">
          <span class="stat-box__label">Inspiración</span>
          <button type="button" class="toggle ${c.combat.inspiration ? 'is-on' : ''}" ${ctx.readOnly ? raw('disabled') : raw('data-action="toggle-inspiration"')} aria-pressed="${c.combat.inspiration}">
            ${c.combat.inspiration ? '✦ Activa' : 'Sin inspiración'}
          </button>
        </div>
      </div>
      <div class="hp-row">
        <div class="stat-box stat-box--hp"><span class="stat-box__label">PG máximos</span><span class="stat-box__value">${out('hpMax', sheet.hp.max)}</span></div>
        ${numberField(ctx, { label: 'PG actuales', path: 'combat.currentHp', min: -999, max: 9999, optional: true, placeholder: String(sheet.hp.max) })}
        ${numberField(ctx, { label: 'PG temporales', path: 'combat.tempHp', min: 0, max: 9999 })}
        ${current !== null && current <= 0 && sheet.level ? html`<p class="callout callout--danger">A 0 PG: tiradas de salvación contra la muerte (3 éxitos estabilizan, 3 fallos…).</p>` : ''}
      </div>
    </section>`;
}

/** Etiqueta corta de las fuentes que no son la marca manual. */
function sourceTag(sources) {
  const kinds = [...new Set(sources.filter((x) => !(x.kind === 'otros' && x.label === 'Marcada a mano')).map((x) => (x.kind === 'otros' ? 'rasgo' : x.kind)))];
  if (!kinds.length) return '';
  return html` <span class="prof-item__tag" title="${sourcesLabel(sources)}">${kinds.join(' · ')}</span>`;
}

function profToggle(ctx, { on, granted, sources, action, key, label }) {
  const attrs = ctx.readOnly || granted
    ? raw(`disabled${granted ? ` title="Otorgada por: ${sourcesLabel(sources).replace(/"/g, '')}"` : ''}`)
    : raw(`data-action="${action}" data-key="${key}"`);
  return html`<button type="button" class="prof-toggle ${on ? 'is-on' : ''} ${granted ? 'is-locked' : ''}" ${attrs} aria-pressed="${on}" aria-label="${label}"></button>`;
}

function savesList(ctx) {
  return sectionCard({
    title: 'Tiradas de salvación',
    body: html`<ul class="prof-list" role="list">
      ${ctx.sheet.saves.map((s) => html`<li class="prof-item">
        ${profToggle(ctx, { on: s.proficient, granted: s.granted, sources: s.sources, action: 'toggle-save', key: s.ability, label: `Competencia en salvación de ${ABILITY_LABEL[s.ability]}` })}
        <span class="prof-item__name">${ABILITY_LABEL[s.ability]}${sourceTag(s.sources)}</span>
        <span class="prof-item__bonus">${out(`save.${s.ability}`, mod(s.bonus))}</span>
      </li>`)}
    </ul>`,
  });
}

function skillsList(ctx) {
  const { used, allowed, sources } = ctx.sheet.expertise;
  const over = used > allowed;
  const sourcesText = sources.length ? sources.map((x) => `${x.label}: ${x.amount}`).join(' · ') : 'Ningún rasgo conocido otorga pericia';
  return sectionCard({
    title: 'Habilidades',
    subtitle: ctx.readOnly
      ? 'La columna de la derecha es la puntuación pasiva.'
      : 'Círculo: competencia (las bloqueadas vienen de tu clase, trasfondo o rasgos). ★: pericia. A la derecha, la pasiva.',
    actions: (used || allowed) ? html`<span class="badge ${over ? 'badge--warning' : 'badge--gold'}" title="${sourcesText}${over ? ' · Tienes más pericias de las que otorgan tus rasgos (válido si tu DM lo permite).' : ''}">★ Pericias ${used}/${allowed}</span>` : '',
    body: html`<ul class="prof-list prof-list--skills" role="list">
      ${ctx.sheet.skills.map((s) => {
        const expertAttrs = ctx.readOnly || !s.proficient
          ? raw(`disabled title="${s.proficient ? '' : 'Necesitas competencia para tener pericia'}"`)
          : raw(`data-action="toggle-expertise" data-key="${s.name}" title="Pericia en ${s.name}"`);
        return html`<li class="prof-item ${s.expert ? 'is-expert' : ''}">
          ${profToggle(ctx, { on: s.proficient, granted: s.granted, sources: s.sources, action: 'toggle-skill', key: s.name, label: `Competencia en ${s.name}` })}
          <span class="prof-item__name">${s.name} <small>(${ABILITY_LABEL[s.ability].slice(0, 3)})</small>${sourceTag(s.sources)}${s.halfProficiency ? html` <span class="badge" title="Mitad de tu bono de competencia (rasgo de clase)">½</span>` : ''}</span>
          <button type="button" class="expert-toggle ${s.expert ? 'is-on' : ''}" ${expertAttrs} aria-pressed="${s.expert}" aria-label="Pericia en ${s.name}">★</button>
          <span class="prof-item__bonus">${out(`skill.${s.name}`, mod(s.bonus))}</span>
          <span class="prof-item__passive" title="Pasiva">${out(`skill.${s.name}.passive`, s.passive)}</span>
        </li>`;
      })}
    </ul>`,
  });
}

/** Armaduras, armas, herramientas e idiomas con su procedencia. */
function otherProficiencies(ctx) {
  const p = ctx.sheet.proficiencies;
  const d = ctx.sheet.defenses;
  const groups = [
    ['Armaduras', p.armaduras], ['Armas', p.armas], ['Herramientas', p.herramientas], ['Idiomas (rasgos)', p.idiomas],
  ].filter(([, list]) => list.length);
  const defenseRows = [
    ['Resistencias', d.resistencia.map((x) => ({ name: DAMAGE_LABEL[x.value], sources: [{ kind: 'otros', label: x.source }] }))],
    ['Inmunidades', d.inmunidad.map((x) => ({ name: DAMAGE_LABEL[x.value], sources: [{ kind: 'otros', label: x.source }] }))],
    ['Vulnerabilidades', d.vulnerabilidad.map((x) => ({ name: DAMAGE_LABEL[x.value], sources: [{ kind: 'otros', label: x.source }] }))],
    ['Inmune a condiciones', d.inmunidad_condicion.map((x) => ({ name: x.value, sources: [{ kind: 'otros', label: x.source }] }))],
  ].filter(([, list]) => list.length);
  const pending = ctx.sheet.classChoices.some((x) => x.pending || x.skillsRemaining || x.savesRemaining);
  if (!groups.length && !defenseRows.length && !pending) return '';
  return sectionCard({
    title: 'Competencias y defensas',
    subtitle: 'Pasa el ratón por encima de cada una para ver de dónde viene.',
    actions: pending ? html`<button type="button" class="btn btn--ghost btn--sm" data-action="goto-tab" data-tab="rasgos">Elegir competencias de clase</button>` : '',
    body: html`<dl class="basics">${[...groups, ...defenseRows].map(([label, list]) => html`<div class="basics__row">
      <dt>${label}</dt>
      <dd><div class="chips chips--static">${list.map((x) => html`<span class="badge" title="${sourcesLabel(x.sources)}">${x.name}</span>`)}</div></dd>
    </div>`)}</dl>`,
  });
}

function speedsCard(ctx) {
  const extra = ctx.sheet.speeds.filter((s) => s.key !== 'velocidad' && s.value !== null);
  return html`<details class="disclosure">
    <summary>Velocidades ${extra.length ? html`<span class="badge">${extra.map((s) => `${s.label} ${s.value}`).join(' · ')}</span>` : ''}</summary>
    <div class="disclosure__body">
      <p>Los valores vienen de la raza. Escribe un número para sobrescribirlo o déjalo vacío para usar el de la raza.</p>
      <div class="form-grid">
        ${ctx.sheet.speeds.map((s) => numberField(ctx, {
          label: `${s.label} (pies)`, path: `combat.speedOverrides.${s.key}`, min: 0, max: 999, optional: true,
          placeholder: s.fromRace ?? (s.key === 'velocidad' ? '30' : '—'),
          value: s.overridden ? s.value : '',
        }))}
      </div>
    </div>
  </details>`;
}

export function renderSummary(ctx) {
  const levelZero = ctx.sheet.level === 0;
  return html`
    <div class="stack">
      ${identityStrip(ctx)}
      ${!ctx.readOnly && (!ctx.character.race.key || levelZero) ? html`
        <div class="callout"><p><strong>Primeros pasos:</strong> 1) reparte las puntuaciones base de atributo, 2) elige raza y 3) sube a nivel 1 eligiendo clase en la pestaña <button type="button" class="link-btn" data-action="goto-tab" data-tab="progresion">Progresión</button>.</p></div>` : ''}
      ${sectionCard({
        title: 'Atributos',
        subtitle: ctx.readOnly ? '' : 'Edita la puntuación base; las bonificaciones de raza, dotes y mejoras se suman solas.',
        actions: levelZero ? actionButton(ctx, { action: 'roll-abilities', label: '🎲 Tirar 4d6', title: 'Tira 4d6 y descarta el menor para cada atributo' }) : '',
        body: html`<div class="abilities">${ABILITIES.map((a) => abilityCard(ctx, a))}</div>`,
      })}
      ${combatStrip(ctx)}
      ${speedsCard(ctx)}
      <div class="grid-2 grid-2--skills">
        ${savesList(ctx)}
        ${skillsList(ctx)}
      </div>
      ${otherProficiencies(ctx)}
    </div>`;
}

export const summaryActions = {
  'toggle-skill': (ed, el) => ed.update((c) => {
    const list = c.proficiencies.skills;
    const i = list.indexOf(el.dataset.key);
    if (i >= 0) list.splice(i, 1); else list.push(el.dataset.key);
  }),
  'toggle-expertise': (ed, el) => ed.update((c) => {
    const list = c.proficiencies.expertise;
    const i = list.indexOf(el.dataset.key);
    if (i >= 0) list.splice(i, 1); else list.push(el.dataset.key);
  }),
  'toggle-save': (ed, el) => ed.update((c) => {
    const list = c.proficiencies.saves;
    const i = list.indexOf(el.dataset.key);
    if (i >= 0) list.splice(i, 1); else list.push(el.dataset.key);
  }),
  'use-unarmored-ac': (ed) => {
    const value = ed.sheet.unarmoredDefense?.[0]?.value;
    if (Number.isInteger(value)) ed.update((c) => { c.combat.armorClass = value; }, { structural: true, message: `CA: ${value} (sin armadura).` });
  },
  'toggle-inspiration': (ed) => ed.update((c) => { c.combat.inspiration = !c.combat.inspiration; }),
};
