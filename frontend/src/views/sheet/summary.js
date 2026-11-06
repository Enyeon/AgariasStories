// Pestaña «Resumen»: identidad básica, atributos, combate, salvaciones y habilidades.

import { html, raw } from '../../ui/dom.js';
import { ABILITIES, ABILITY_DESCRIPTIONS, ALIGNMENTS, XP_BY_LEVEL, ABILITY_LABEL } from '../../domain/constants.js';
import { classLevels } from '../../domain/rules.js';
import { getClass } from '../../data/index.js';
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
          <span class="static-value">${c.race.key ?? '—'} ${ctx.readOnly ? '' : html`<button type="button" class="link-btn" data-action="goto-tab" data-tab="progresion">${c.race.key ? 'Cambiar' : 'Elegir'}</button>`}</span>
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

function savesList(ctx) {
  return sectionCard({
    title: 'Tiradas de salvación',
    body: html`<ul class="prof-list" role="list">
      ${ctx.sheet.saves.map((s) => html`<li class="prof-item">
        <button type="button" class="prof-toggle ${s.proficient ? 'is-on' : ''}" ${ctx.readOnly ? raw('disabled') : raw(`data-action="toggle-save" data-key="${s.ability}"`)} aria-pressed="${s.proficient}" aria-label="Competencia en salvación de ${ABILITY_LABEL[s.ability]}"></button>
        <span class="prof-item__name">${ABILITY_LABEL[s.ability]}</span>
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
      : 'Círculo: competencia. ★: pericia (duplica la competencia). La columna de la derecha es la puntuación pasiva.',
    actions: (used || allowed) ? html`<span class="badge ${over ? 'badge--warning' : 'badge--gold'}" title="${sourcesText}${over ? ' · Tienes más pericias de las que otorgan tus rasgos (válido si tu DM lo permite).' : ''}">★ Pericias ${used}/${allowed}</span>` : '',
    body: html`<ul class="prof-list prof-list--skills" role="list">
      ${ctx.sheet.skills.map((s) => {
        const lockTitle = s.fromBackground ? 'Competencia otorgada por el trasfondo' : '';
        const profAttrs = ctx.readOnly || s.fromBackground
          ? raw(`disabled title="${lockTitle}"`)
          : raw(`data-action="toggle-skill" data-key="${s.name}"`);
        const expertAttrs = ctx.readOnly || !s.proficient
          ? raw(`disabled title="${s.proficient ? '' : 'Necesitas competencia para tener pericia'}"`)
          : raw(`data-action="toggle-expertise" data-key="${s.name}" title="Pericia en ${s.name}"`);
        return html`<li class="prof-item ${s.expert ? 'is-expert' : ''}">
          <button type="button" class="prof-toggle ${s.proficient ? 'is-on' : ''} ${s.fromBackground ? 'is-locked' : ''}" ${profAttrs} aria-pressed="${s.proficient}" aria-label="Competencia en ${s.name}"></button>
          <span class="prof-item__name">${s.name} <small>(${ABILITY_LABEL[s.ability].slice(0, 3)})</small>${s.fromBackground ? html` <span class="prof-item__tag" title="${lockTitle}">trasfondo</span>` : ''}</span>
          <button type="button" class="expert-toggle ${s.expert ? 'is-on' : ''}" ${expertAttrs} aria-pressed="${s.expert}" aria-label="Pericia en ${s.name}">★</button>
          <span class="prof-item__bonus">${out(`skill.${s.name}`, mod(s.bonus))}</span>
          <span class="prof-item__passive" title="Pasiva">${out(`skill.${s.name}.passive`, s.passive)}</span>
        </li>`;
      })}
    </ul>`,
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
  'toggle-inspiration': (ed) => ed.update((c) => { c.combat.inspiration = !c.combat.inspiration; }),
};
