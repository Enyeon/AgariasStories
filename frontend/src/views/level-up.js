// Asistente de subida de nivel y selector de dotes.
// Los pasos se calculan con planLevelUp(): sólo se muestran los que aplican.

import { html, setHtml, richText, raw } from '../ui/dom.js';
import { openDialog } from '../ui/feedback.js';
import { ABILITY_KEYS, ABILITY_LABEL, CLASS_SECTIONS, MAX_LEVEL } from '../domain/constants.js';
import { listClasses, listFeats, getFeat, getClass, featName, loadSpells } from '../data/index.js';
import {
  abilityScores, averageHitDieRoll, classLevels, featAbilityOptions, featPrerequisites, proficiencyBonus,
  spellcasting, totalLevel, abilityModifier, formatModifier, hitPoints,
} from '../domain/rules.js';
import {
  planLevelUp, applyLevelUp, applyLevelUps, levelNeedsDecisions, rollDie, validateImprovement, canLevelUp,
  levelDownPreview, forgetSpells,
} from '../domain/progression.js';
import { knownChoices, listSource, validateChoices, expandGrants, deferSpellChoices, levelUpVisibleChoices } from '../domain/class-choices.js';
import { choiceGroupsHtml, bindChoiceGroups, choicesError, choicesSummary, choicesPayload } from './components/choice-picker.js';

const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ── Selector de dotes ────────────────────────────────────────────────────

function featList(character, { excludeRaceFeat = false, allow = null, only = null } = {}) {
  const scores = abilityScores(character);
  const { isCaster } = spellcasting(character, scores, proficiencyBonus(Math.max(1, totalLevel(character))));
  const probe = excludeRaceFeat ? { ...character, race: { ...character.race, feat: null } } : character;
  return listFeats()
    // `only`: la raza limita la elección; las dotes «sólo de raza» no salen en otros casos.
    .filter(([name, def]) => (only ? only.includes(name) : !def.soloRaza))
    .filter(([name, def]) => only || !allow || (def.homebrew ? allow.homebrew.dote : allow.official.dote)).map(([name, def]) => {
    const pre = featPrerequisites(probe, def, scores, { isCaster });
    return { name, label: def.nombre ?? name, homebrew: Boolean(def.homebrew), def, ok: pre.ok, reasons: pre.reasons, options: featAbilityOptions(def) };
  }).sort((a, b) => Number(b.ok) - Number(a.ok) || a.label.localeCompare(b.label, 'es'));
}

/** Panel de elección de dote embebible. Llama a onChange({ name, ability }). */
function mountFeatChooser(root, character, { initial, onChange, excludeRaceFeat, allow, only = null }) {
  const feats = featList(character, { excludeRaceFeat, allow, only });
  let query = '';
  let showAll = false;
  let selected = initial?.name ?? null;
  let ability = initial?.ability ?? null;

  function renderList() {
    const q = normalize(query);
    const items = feats.filter((f) => (showAll || f.ok) && (!q || normalize(f.label).includes(q)));
    return items.length ? items.map((f) => html`<button type="button" class="race-option ${f.name === selected ? 'is-selected' : ''} ${f.ok ? '' : 'is-locked'}" data-feat="${f.name}" aria-pressed="${f.name === selected}">
        <span class="race-option__name">${f.label}${f.homebrew ? html` <span class="badge badge--gold">HB</span>` : ''}</span>
        <span class="race-option__bonus">${f.ok ? (f.options.length ? `+1 a ${f.options.map((k) => ABILITY_LABEL[k].slice(0, 3)).join('/')}` : Object.keys(f.def.aumentarStat ?? {}).map((k) => `${ABILITY_LABEL[k]} +1`).join(', ') || 'Sin aumento de atributo') : f.reasons.join(' · ')}</span>
      </button>`) : html`<p class="muted">Sin resultados.</p>`;
  }

  function renderDetail() {
    const f = feats.find((x) => x.name === selected);
    if (!f) return html`<p class="muted">Selecciona una dote para ver su descripción.</p>`;
    return html`<h4>${f.label}</h4>
      ${f.ok ? '' : html`<p class="callout callout--warning">No cumples los requisitos: ${f.reasons.join(' · ')}</p>`}
      ${f.options.length ? html`<fieldset class="choice-group"><legend>Atributo que aumenta (+1)</legend><div class="chips">
        ${f.options.map((k) => html`<label class="chip"><input type="radio" name="feat-ability" value="${k}" ${k === ability ? raw('checked') : ''}>${ABILITY_LABEL[k]}</label>`)}
      </div></fieldset>` : ''}
      <div class="rich">${richText(f.def.habilidad)}</div>`;
  }

  function render() {
    setHtml(root, html`<div class="picker">
      <div class="picker__list">
        <div class="row"><input class="input" type="search" placeholder="Buscar dote…" value="${query}" data-feat-search aria-label="Buscar dote">
        <label class="check"><input type="checkbox" data-feat-all ${showAll ? raw('checked') : ''}> Ver también las no disponibles</label></div>
        <div class="picker__scroll" data-feat-list>${renderList()}</div>
      </div>
      <div class="picker__detail" data-feat-detail aria-live="polite">${renderDetail()}</div>
    </div>`);
  }

  root.addEventListener('input', (e) => {
    if (e.target.matches('[data-feat-search]')) {
      query = e.target.value;
      setHtml(root.querySelector('[data-feat-list]'), renderList());
    }
  });
  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-feat-all]')) {
      showAll = e.target.checked;
      setHtml(root.querySelector('[data-feat-list]'), renderList());
    }
    if (e.target.name === 'feat-ability') {
      ability = e.target.value;
      onChange({ name: selected, ability });
    }
  });
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-feat]');
    if (!btn) return;
    selected = btn.dataset.feat;
    const f = feats.find((x) => x.name === selected);
    ability = f.options.length === 1 ? f.options[0] : null;
    root.querySelectorAll('[data-feat]').forEach((b) => b.classList.toggle('is-selected', b.dataset.feat === selected));
    setHtml(root.querySelector('[data-feat-detail]'), renderDetail());
    if (window.matchMedia('(max-width: 760px)').matches) root.querySelector('[data-feat-detail]').scrollIntoView({ behavior: 'smooth' });
    onChange({ name: selected, ability });
  });
  render();
}

export function openFeatPicker(character, { title = 'Elige una dote', excludeRaceFeat = false, allow = null, only = null } = {}) {
  return openDialog({
    title,
    size: 'lg',
    render(body, close) {
      let choice = character.race.feat ? { ...character.race.feat } : null;
      setHtml(body, html`<div data-chooser></div><p class="field__error" data-error role="alert"></p>
        <div class="dialog__footer"><button class="btn btn--ghost" data-dialog-close>Cancelar</button><button class="btn btn--primary" data-ok>Confirmar dote</button></div>`);
      mountFeatChooser(body.querySelector('[data-chooser]'), character, { initial: choice, excludeRaceFeat, allow, only, onChange: (c) => { choice = c; } });
      body.querySelector('[data-ok]').addEventListener('click', () => {
        if (!choice?.name) {
          body.querySelector('[data-error]').textContent = 'Selecciona una dote.';
          return;
        }
        const def = getFeat(choice.name);
        if (featAbilityOptions(def).length && !choice.ability) {
          body.querySelector('[data-error]').textContent = 'Elige qué atributo aumenta la dote.';
          return;
        }
        close(choice);
      });
    },
  });
}

// ── Asistente de subida de nivel ─────────────────────────────────────────

/**
 * @param {object} character
 * @param {object} [opts]
 * @param {{ classKey?: string|null, hpMode?: 'ask'|'avg'|'roll' }} [opts.preset] decisiones tomadas para todos los niveles.
 * @param {{ index: number, total: number }} [opts.progress] en modo varios niveles: «Nivel 4 (2 de 5)».
 * En modo varios niveles devuelve { character, choices } en lugar del personaje.
 */
export function openLevelUpWizard(character, opts = {}) {
  const multi = Boolean(opts.progress);
  const nextLevel = character.levels.length + 1;
  let wizardState = null;
  return openDialog({
    // Asistente de varios pasos: no se pierde con un clic fuera y, si ya hay
    // decisiones tomadas, pide confirmación antes de cerrarse.
    guard: { isDirty: () => Boolean(wizardState?.dirty()) },
    title: multi
      ? `Nivel ${nextLevel} · ${opts.progress.index} de ${opts.progress.total}`
      : character.levels.length ? `Subir a nivel ${nextLevel}` : 'Nivel 1: elige tu clase',
    size: 'xl',
    className: 'wizard',
    render(body, close) {
      const state = {
        step: 'class',
        classKey: null,
        plan: null,
        subclass: null,
        improvementType: 'asi',
        asiMode: 'two',
        asi: [null, null],
        feat: null,
        featureChoice: [],
        elecciones: {},
        hpRoll: null,
        hpMethod: null,
        error: '',
      };
      const scores = abilityScores(character);
      const current = classLevels(character);
      const hpMode = opts.preset?.hpMode ?? 'ask';
      // Catálogo de conjuros: sólo se carga si alguna elección es de conjuros.
      let spells = null;
      let spellsRequested = false;
      // Elecciones del nivel, incluidas las que abre una opción ya marcada.
      // Los conjuros no se piden aquí: se eligen después en la pestaña Conjuros.
      const expanded = () => deferSpellChoices(expandGrants(state.classKey, character.subclasses[state.classKey] ?? state.subclass, state.plan?.choices ?? [], choicesPayload(state.elecciones)));
      const choiceGroups = () => levelUpVisibleChoices(expanded().groups);
      const deferredSpells = () => expanded().deferred;
      const needsSpells = () => choiceGroups().some((g) => listSource(g.def) === 'conjuros');
      function ensureSpells() {
        if (spells || spellsRequested || !needsSpells()) return;
        spellsRequested = true;
        loadSpells().then((s) => { spells = s; if (state.step === 'choices') render(); }).catch(() => {});
      }

      function presetHp() {
        if (!state.plan || state.plan.isFirstLevel || hpMode === 'ask') return;
        state.hpMethod = hpMode;
        state.hpRoll = hpMode === 'roll' ? rollDie(state.plan.hitDie) : averageHitDieRoll(state.plan.hitDie);
      }
      if (opts.preset?.classKey) {
        state.classKey = opts.preset.classKey;
        state.plan = planLevelUp(character, state.classKey);
        presetHp();
      }

      const steps = () => {
        const s = ['class'];
        if (state.plan?.needsSubclass) s.push('subclass');
        if (state.plan?.needsImprovement) s.push('improvement');
        if (levelUpVisibleChoices(state.plan?.choices ?? []).length) s.push('choices');
        if (state.plan?.featureChoice) s.push('feature');
        if (!multi || hpMode === 'ask' || state.plan?.isFirstLevel) s.push('hp');
        if (!multi) s.push('confirm');
        return s;
      };
      if (opts.preset?.classKey) state.step = steps()[1] ?? 'class';
      const startStep = state.step;
      wizardState = {
        dirty: () => multi || state.step !== startStep || Boolean(state.subclass || state.feat || state.asi?.some(Boolean) || state.featureChoice?.length || Object.keys(choicesPayload(state.elecciones)).length),
      };
      const LABELS = { class: 'Clase', subclass: 'Subclase', improvement: 'Mejora', feature: 'Rasgo', choices: 'Elecciones', hp: 'Puntos de golpe', confirm: 'Confirmar' };

      function improvement() {
        if (!state.plan?.needsImprovement) return undefined;
        if (state.improvementType === 'feat') return state.feat ? { type: 'feat', ...state.feat } : null;
        const [a, b] = state.asi;
        if (state.asiMode === 'one') return a ? { type: 'asi', increases: { [a]: 2 } } : null;
        return a && b && a !== b ? { type: 'asi', increases: { [a]: 1, [b]: 1 } } : null;
      }

      function stepClass() {
        const groups = Object.entries(CLASS_SECTIONS).map(([sec, label]) => ({
          label, classes: listClasses().filter((c) => c.seccion === sec && (current[c.claseName] || !opts.allow || (c.homebrew ? opts.allow.homebrew.clase : opts.allow.official.clase))),
        })).filter((g) => g.classes.length);
        return html`<p class="muted">${character.levels.length ? 'Puedes seguir en tu clase o tomar otra (multiclase).' : 'La clase define tus habilidades, tu dado de golpe y tu estilo de juego.'}</p>
          ${groups.map((g) => html`<h3 class="wizard__group">${g.label}</h3>
            <div class="class-grid">${g.classes.map((c) => html`<button type="button" class="class-card ${state.classKey === c.claseName ? 'is-selected' : ''}" data-class="${c.claseName}" aria-pressed="${state.classKey === c.claseName}">
              <span class="class-card__name">${c.nombre}</span>
              <span class="class-card__meta"><span class="badge">d${c.dadoDeGolpe}</span>${c.conjurador ? html`<span class="badge badge--accent">Conjurador</span>` : ''}${current[c.claseName] ? html`<span class="badge badge--gold">Nivel ${current[c.claseName]} → ${current[c.claseName] + 1}</span>` : ''}</span>
              <span class="class-card__desc">${c.niveles?.[1]?.descripcion ?? ''}</span>
            </button>`)}</div>`)}`;
      }

      function stepSubclass() {
        return html`<p class="muted">Al alcanzar el nivel ${state.plan.newClassLevel} de ${state.plan.className} eliges tu <strong>${state.plan.subclassLabel}</strong>. Esta decisión define rasgos de niveles futuros.</p>
          <div class="stack stack--sm">${state.plan.subclassOptions.map((o) => html`<label class="option-card ${state.subclass === o.key ? 'is-selected' : ''}">
            <input type="radio" name="subclass" value="${o.key}" ${state.subclass === o.key ? raw('checked') : ''}>
            <span><strong>${o.name}</strong><span class="rich">${richText(o.description)}</span></span>
          </label>`)}</div>`;
      }

      function asiSelect(i) {
        return html`<select class="select" data-asi="${i}" aria-label="Atributo ${i + 1}">
          <option value="">— Atributo —</option>
          ${ABILITY_KEYS.map((k) => {
            const inc = state.asiMode === 'one' ? 2 : 1;
            const full = scores[k].total + inc > scores[k].cap;
            return html`<option value="${k}" ${state.asi[i] === k ? raw('selected') : ''} ${full ? raw('disabled') : ''}>${ABILITY_LABEL[k]} (${scores[k].total}${full ? ' · máx.' : ''})</option>`;
          })}
        </select>`;
      }

      function stepImprovement() {
        return html`<p class="muted">Nivel ${state.plan.newClassLevel} de ${state.plan.className}: mejora de puntuación de característica.</p>
          <div class="segmented" role="radiogroup" aria-label="Tipo de mejora">
            <label class="segmented__opt"><input type="radio" name="imp-type" value="asi" ${state.improvementType === 'asi' ? raw('checked') : ''}>Atributos</label>
            <label class="segmented__opt"><input type="radio" name="imp-type" value="feat" ${state.improvementType === 'feat' ? raw('checked') : ''}>Dote</label>
          </div>
          ${state.improvementType === 'asi' ? html`<div class="stack">
            <div class="segmented" role="radiogroup" aria-label="Reparto">
              <label class="segmented__opt"><input type="radio" name="asi-mode" value="two" ${state.asiMode === 'two' ? raw('checked') : ''}>+1 a dos atributos</label>
              <label class="segmented__opt"><input type="radio" name="asi-mode" value="one" ${state.asiMode === 'one' ? raw('checked') : ''}>+2 a un atributo</label>
            </div>
            <div class="row">${asiSelect(0)}${state.asiMode === 'two' ? asiSelect(1) : ''}</div>
            <p class="field__hint">Los atributos no pueden superar su máximo (normalmente 20).</p>
          </div>` : html`<div data-feat-root></div>`}`;
      }

      function stepFeature() {
        const fc = state.plan.featureChoice;
        return html`<p class="muted">Rasgo de ${state.plan.className} (nivel ${state.plan.newClassLevel}): elige ${fc.count} atributo(s) que reciben +${fc.bonus}.</p>
          <div class="chips">${fc.allowed.map((k) => html`<label class="chip"><input type="checkbox" data-feature value="${k}" ${state.featureChoice.includes(k) ? raw('checked') : ''}>${ABILITY_LABEL[k]}</label>`)}</div>`;
      }

      function stepChoices() {
        ensureSpells();
        const required = choiceGroups().some((g) => g.cantidad > 0);
        return html`<p class="muted">${state.plan.className} ${state.plan.newClassLevel}: ${required ? 'tus rasgos de este nivel te piden elegir.' : 'puedes cambiar una elección anterior (opcional).'}</p>
          ${choiceGroupsHtml(choiceGroups(), state.elecciones, { known: knownChoices(character, state.classKey), spells })}`;
      }

      function stepHp() {
        const die = state.plan.hitDie;
        const con = abilityModifier(scores.constitucion.total);
        if (state.plan.isFirstLevel) {
          return html`<div class="hp-roll"><div class="hp-roll__die">d${die}</div>
            <p>En el nivel 1 obtienes el máximo del dado: <strong>${die}</strong> ${formatModifier(con)} (CON).</p></div>`;
        }
        const avg = averageHitDieRoll(die);
        return html`<div class="hp-roll">
          <div class="hp-roll__die ${state.hpMethod === 'roll' ? 'is-rolled' : ''}" aria-live="polite">${state.hpRoll ?? `d${die}`}</div>
          <p>Elige cómo obtener los puntos de golpe de este nivel (dado de ${state.plan.className}: d${die}, más ${formatModifier(con)} por CON).</p>
          <div class="row">
            <button type="button" class="btn btn--gold" data-hp="roll" ${state.hpMethod === 'roll' ? raw('disabled') : ''}>🎲 Tirar d${die}</button>
            <button type="button" class="btn btn--ghost" data-hp="avg" ${state.hpMethod === 'roll' ? raw('disabled') : ''}>Usar promedio (${avg})</button>
            <label class="row field__inline">Dado físico:
              <input class="input input--num" type="number" min="1" max="${die}" value="${state.hpMethod === 'manual' ? state.hpRoll : ''}" data-hp-manual style="width:5rem" ${state.hpMethod === 'roll' ? raw('disabled') : ''} aria-label="Resultado del dado físico"></label>
          </div>
          ${state.hpMethod === 'roll' ? html`<p class="field__hint">La tirada es definitiva para este nivel.</p>` : ''}
        </div>`;
      }

      function stepConfirm() {
        const imp = improvement();
        const p = state.plan;
        const subName = p.subclassOptions.find((o) => o.key === state.subclass)?.name;
        const hp = p.isFirstLevel ? p.hitDie : state.hpRoll;
        return html`<ul class="summary-list">
          <li><span>Clase</span><strong>${p.className} ${p.newClassLevel}</strong></li>
          <li><span>Nivel de personaje</span><strong>${p.newTotalLevel}</strong></li>
          ${subName ? html`<li><span>${p.subclassLabel}</span><strong>${subName}</strong></li>` : ''}
          ${imp ? html`<li><span>Mejora</span><strong>${imp.type === 'asi' ? Object.entries(imp.increases).map(([k, v]) => `${ABILITY_LABEL[k]} +${v}`).join(', ') : `Dote: ${featName(imp.name)}`}</strong></li>` : ''}
          ${state.featureChoice.length ? html`<li><span>Rasgo de clase</span><strong>${state.featureChoice.map((k) => ABILITY_LABEL[k]).join(', ')} +${p.featureChoice.bonus}</strong></li>` : ''}
          ${choicesSummary(choiceGroups(), state.elecciones).map((t) => html`<li><span>Elección</span><strong>${t}</strong></li>`)}
          ${p.milestone?.statAmount ? html`<li><span>Bonificación de clase</span><strong>${Object.entries(p.milestone.statAmount).filter(([k]) => k !== 'choice').map(([k, v]) => `${ABILITY_LABEL[k]} +${v}`).join(', ')}</strong></li>` : ''}
          <li><span>Dado de golpe</span><strong>${hp} (d${p.hitDie})</strong></li>
        </ul>
        ${spellNote(deferredSpells(), getClass(p.classKey)?.conjurador || spellcasting(character, scores, proficiencyBonus(Math.max(1, totalLevel(character)))).isCaster)}`;
      }

      const RENDER = { class: stepClass, subclass: stepSubclass, improvement: stepImprovement, feature: stepFeature, choices: stepChoices, hp: stepHp, confirm: stepConfirm };

      function validateStep() {
        switch (state.step) {
          case 'class': return state.classKey ? '' : 'Elige una clase.';
          case 'subclass': return state.subclass ? '' : `Elige tu ${state.plan.subclassLabel}.`;
          case 'improvement': {
            const imp = improvement();
            if (!imp) return state.improvementType === 'feat' ? 'Elige una dote (y su atributo si corresponde).' : 'Completa el reparto de atributos.';
            return validateImprovement(character, imp).join(' ');
          }
          case 'choices': {
            const groups = choiceGroups();
            const msg = choicesError(groups, state.elecciones);
            if (msg) return msg;
            return validateChoices(knownChoices(character, state.classKey), groups, choicesPayload(state.elecciones), { spells }).errors.join(' ');
          }
          case 'feature': return state.featureChoice.length === state.plan.featureChoice.count ? '' : `Elige ${state.plan.featureChoice.count} atributo(s).`;
          case 'hp': return state.plan.isFirstLevel || state.hpRoll ? '' : 'Tira el dado, usa el promedio o introduce tu tirada.';
          default: return '';
        }
      }

      function render() {
        const list = steps();
        const idx = list.indexOf(state.step);
        const last = idx === list.length - 1;
        const nextLabel = !last ? 'Continuar →' : multi ? (opts.progress.index === opts.progress.total ? 'Ver resumen →' : 'Siguiente nivel →') : '✓ Confirmar subida';
        setHtml(body, html`
          <ol class="stepper" aria-label="Pasos">
            ${list.map((s, i) => html`<li class="stepper__item ${i < idx ? 'is-done' : ''} ${i === idx ? 'is-current' : ''}" ${i === idx ? raw('aria-current="step"') : ''}>${s === 'subclass' ? state.plan.subclassLabel : LABELS[s]}</li>`)}
          </ol>
          <div class="wizard__body">${RENDER[state.step]()}</div>
          <p class="field__error" role="alert">${state.error}</p>
          <div class="dialog__footer">
            <button type="button" class="btn btn--ghost" data-nav="back">${idx === 0 ? (multi ? 'Cancelar todo' : 'Cancelar') : '← Atrás'}</button>
            <button type="button" class="btn btn--primary" data-nav="next">${nextLabel}</button>
          </div>`);
        if (state.step === 'improvement' && state.improvementType === 'feat') {
          mountFeatChooser(body.querySelector('[data-feat-root]'), character, {
            allow: opts.allow,
            initial: state.feat,
            onChange: (f) => { state.feat = f; state.error = ''; },
          });
        }
        if (state.step === 'choices') {
          const shown = choiceGroups().map((g) => `${g.lista}:${g.cantidad}`).join();
          bindChoiceGroups(body, choiceGroups(), state.elecciones, { known: knownChoices(character, state.classKey), spells }, () => {
            state.error = '';
            // Una opción que abre otras elecciones (p. ej. Guerrero Bendito → 2 trucos): se redibuja el paso.
            if (choiceGroups().map((g) => `${g.lista}:${g.cantidad}`).join() !== shown) render();
          });
        }
        body.querySelector('.wizard__body').scrollTop = 0;
      }

      function go(delta) {
        const list = steps();
        const idx = list.indexOf(state.step);
        if (delta > 0) {
          state.error = validateStep();
          if (state.error) return render();
          if (idx === list.length - 1) {
            const choices = {
              classKey: state.classKey,
              hpRoll: state.hpRoll,
              improvement: improvement(),
              subclass: state.subclass,
              featureChoices: { statAmount: state.featureChoice, elecciones: choicesPayload(state.elecciones) },
            };
            const res = applyLevelUp(character, choices);
            if (res.errors.length) { state.error = res.errors.join(' '); return render(); }
            return close(multi ? { character: res.character, choices } : res.character);
          }
        } else if (idx === 0) {
          // Mismo camino que la × : pregunta si hay decisiones sin guardar.
          return body.closest('dialog').querySelector('.dialog__close')?.click();
        }
        state.error = '';
        state.step = list[Math.max(0, Math.min(list.length - 1, idx + delta))];
        render();
      }

      body.addEventListener('click', (e) => {
        const nav = e.target.closest('[data-nav]');
        if (nav) return go(nav.dataset.nav === 'next' ? 1 : -1);
        const cls = e.target.closest('[data-class]');
        if (cls) {
          if (state.classKey !== cls.dataset.class) {
            state.classKey = cls.dataset.class;
            state.plan = planLevelUp(character, state.classKey);
            Object.assign(state, { subclass: null, feat: null, asi: [null, null], featureChoice: [], elecciones: {}, hpRoll: null, hpMethod: null });
            presetHp();
          }
          state.error = '';
          return render();
        }
        const hp = e.target.closest('[data-hp]');
        if (hp) {
          state.hpMethod = hp.dataset.hp;
          state.hpRoll = hp.dataset.hp === 'roll' ? rollDie(state.plan.hitDie) : averageHitDieRoll(state.plan.hitDie);
          state.error = '';
          render();
        }
      });
      body.addEventListener('dblclick', (e) => {
        if (e.target.closest('[data-class]') && state.step === 'class') go(1);
      });
      body.addEventListener('change', (e) => {
        const t = e.target;
        if (t.name === 'subclass') {
          state.subclass = t.value;
          // Las elecciones de la subclase dependen de cuál se elija.
          state.plan = planLevelUp(character, state.classKey, { subclass: state.subclass });
          state.elecciones = {};
          body.querySelectorAll('.option-card').forEach((card) => card.classList.toggle('is-selected', card.contains(t)));
        }
        else if (t.name === 'imp-type') { state.improvementType = t.value; render(); }
        else if (t.name === 'asi-mode') { state.asiMode = t.value; state.asi = [null, null]; render(); }
        else if (t.matches('[data-asi]')) state.asi[Number(t.dataset.asi)] = t.value || null;
        else if (t.matches('[data-feature]')) {
          state.featureChoice = [...body.querySelectorAll('[data-feature]:checked')].map((b) => b.value).slice(0, state.plan.featureChoice.count);
          render();
        } else if (t.matches('[data-hp-manual]')) {
          const v = Number(t.value);
          if (Number.isInteger(v) && v >= 1 && v <= state.plan.hitDie) { state.hpRoll = v; state.hpMethod = 'manual'; } else { state.hpRoll = null; state.hpMethod = null; }
          render();
        }
        state.error = '';
      });
      render();
    },
  });
}

// ── Varios niveles de una vez ────────────────────────────────────────────

function openMultiLevelSetup(character) {
  const level = character.levels.length;
  const classes = Object.keys(classLevels(character));
  const mainClass = character.levels.at(-1)?.classKey ?? '';
  return openDialog({
    title: 'Subir varios niveles',
    size: 'md',
    render(body, close) {
      setHtml(body, html`<form class="stack" data-form>
        <p class="muted">Se recorren los niveles uno a uno, igual que si subieras de uno en uno. Sólo se te preguntará en los niveles con decisiones (subclase, mejora, rasgos). Nada cambia hasta que confirmes el resumen final.</p>
        <div class="form-grid form-grid--wide">
          <div class="field"><label class="field__label" for="ml-target">Nivel objetivo</label>
            <select id="ml-target" class="select" name="target">${Array.from({ length: MAX_LEVEL - level }, (_, i) => level + i + 1).map((n) => html`<option value="${n}" ${n === Math.min(MAX_LEVEL, level + 2) ? raw('selected') : ''}>Nivel ${n}${n === level + 1 ? ' (sólo uno)' : ` (+${n - level})`}</option>`)}</select></div>
          <div class="field"><label class="field__label" for="ml-class">Clase</label>
            <select id="ml-class" class="select" name="classKey">
              ${classes.map((k) => html`<option value="${k}" ${k === mainClass ? raw('selected') : ''}>${getClass(k)?.nombre ?? k}</option>`)}
              <option value="">Elegir en cada nivel (multiclase)</option>
            </select></div>
        </div>
        <fieldset class="choice-group"><legend>Puntos de golpe de cada nivel</legend>
          <div class="stack stack--sm">
            <label class="check"><input type="radio" name="hpMode" value="avg" checked> Usar el promedio en todos (recomendado)</label>
            <label class="check"><input type="radio" name="hpMode" value="roll"> Tirar el dado automáticamente en cada nivel</label>
            <label class="check"><input type="radio" name="hpMode" value="ask"> Preguntarme en cada nivel (dado físico)</label>
          </div>
        </fieldset>
        <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button type="submit" class="btn btn--primary">Empezar</button></div>
      </form>`);
      const form = body.querySelector('[data-form]');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        close({ target: Number(fd.get('target')), classKey: fd.get('classKey') || null, hpMode: fd.get('hpMode') });
      });
    },
  });
}

function openMultiLevelSummary(original, final, steps) {
  const before = abilityScores(original);
  const after = abilityScores(final);
  const changes = ABILITY_KEYS.filter((k) => after[k].total !== before[k].total);
  return openDialog({
    title: `Resumen: nivel ${original.levels.length} → ${final.levels.length}`,
    size: 'lg',
    guard: { isDirty: () => true },
    render(body, close) {
      setHtml(body, html`<div class="stack">
        <div class="table-wrap"><table class="table">
          <thead><tr><th class="num" scope="col">Nivel</th><th scope="col">Clase</th><th scope="col">Decisiones</th><th class="num" scope="col">Dado de PG</th></tr></thead>
          <tbody>${steps.map((st, i) => {
            const lvl = original.levels.length + i + 1;
            const sub = st.choices.subclass ? (planLevelUp(st.before, st.choices.classKey).subclassOptions.find((o) => o.key === st.choices.subclass)?.name ?? st.choices.subclass) : null;
            const imp = st.choices.improvement;
            const notes = [
              sub ? `Subclase: ${sub}` : '',
              imp?.type === 'asi' ? Object.entries(imp.increases).map(([k, v]) => `${ABILITY_LABEL[k]} +${v}`).join(', ') : '',
              imp?.type === 'feat' ? `Dote: ${featName(imp.name)}` : '',
              st.choices.featureChoices?.statAmount?.length ? `Rasgo: ${st.choices.featureChoices.statAmount.map((k) => ABILITY_LABEL[k]).join(', ')}` : '',
              ...choicesSummary(expandGrants(st.choices.classKey, st.before.subclasses[st.choices.classKey] ?? st.choices.subclass, planLevelUp(st.before, st.choices.classKey, { subclass: st.choices.subclass }).choices, st.choices.featureChoices?.elecciones ?? {}), st.choices.featureChoices?.elecciones ?? {}),
            ].filter(Boolean).join(' · ');
            return html`<tr><td class="num">${lvl}</td><td>${getClass(st.choices.classKey)?.nombre ?? st.choices.classKey}</td><td>${notes || html`<span class="muted">—</span>`}</td><td class="num">${lvl === 1 ? 'máx.' : st.choices.hpRoll}</td></tr>`;
          })}</tbody>
        </table></div>
        <ul class="summary-list">
          <li><span>PG máximos</span><strong>${hitPointsMax(original)} → ${hitPointsMax(final)}</strong></li>
          ${changes.map((k) => html`<li><span>${ABILITY_LABEL[k]}</span><strong>${before[k].total} → ${after[k].total}</strong></li>`)}
        </ul>
        ${spellNote(steps.flatMap((st) => planLevelUp(st.before, st.choices.classKey, { subclass: st.choices.subclass }).deferredSpells ?? []), spellcasting(final, after, proficiencyBonus(Math.max(1, totalLevel(final)))).isCaster)}
        <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Descartar todo</button><button type="button" class="btn btn--primary" data-ok autofocus>✓ Confirmar ${steps.length} niveles</button></div>
      </div>`);
      body.querySelector('[data-ok]').addEventListener('click', () => close(true));
    },
  });
}

const TAB_LABEL = { conjuros: 'Conjuros', taller: 'Taller', rasgos: 'Rasgos' };
const TAB_NOUN = { conjuros: ['conjuro', 'conjuros'], taller: ['esquema', 'esquemas'], rasgos: ['elección', 'elecciones'] };

/**
 * Aviso de que lo diferible (conjuros, esquemas…) se elige con calma después,
 * en su pestaña. Sin elecciones diferidas, a un lanzador se le recuerda igual.
 */
function spellNote(deferred, isCaster) {
  const byTab = new Map();
  for (const d of deferred) {
    const t = byTab.get(d.pestana) ?? { total: 0, titles: new Set() };
    t.total += d.cantidad;
    t.titles.add(d.titulo);
    byTab.set(d.pestana, t);
  }
  if (!byTab.size && !isCaster) return '';
  if (!byTab.size) return html`<p class="callout callout--accent">✨ Puede que este nivel te dé trucos o conjuros nuevos. No hace falta elegirlos ahora: ve a la pestaña <strong>Conjuros</strong> y revísalos tranquilamente.</p>`;
  return html`${[...byTab].map(([tab, t]) => html`<p class="callout callout--accent">✨ Este nivel te da <strong>${t.total} ${(TAB_NOUN[tab] ?? TAB_NOUN.rasgos)[t.total === 1 ? 0 : 1]}</strong> para elegir (${[...t.titles].join(', ')}). No hace falta elegirlos ahora: ve a la pestaña <strong>${TAB_LABEL[tab] ?? tab}</strong> y revísalos tranquilamente.</p>`)}`;
}

function hitPointsMax(c) {
  return hitPoints(c, abilityScores(c)).max;
}

/**
 * Sube varios niveles seguidos. Atómico: devuelve el personaje final sólo si
 * el usuario confirma el resumen; si cancela en cualquier momento, undefined.
 */
export async function openMultiLevelUp(character, { allow = null } = {}) {
  const gate = canLevelUp(character);
  if (!gate.ok) return undefined;
  const setup = await openMultiLevelSetup(character);
  if (!setup) return undefined;
  const total = setup.target - character.levels.length;
  const steps = [];
  let current = character;
  for (let i = 1; i <= total; i++) {
    const classKey = setup.classKey;
    let choices;
    if (classKey && setup.hpMode !== 'ask' && current.levels.length > 0 && !levelNeedsDecisions(current, classKey)) {
      const plan = planLevelUp(current, classKey);
      choices = { classKey, hpRoll: setup.hpMode === 'roll' ? rollDie(plan.hitDie) : averageHitDieRoll(plan.hitDie), improvement: null, subclass: null, featureChoices: {} };
    } else {
      const res = await openLevelUpWizard(current, { allow, preset: { classKey, hpMode: setup.hpMode }, progress: { index: i, total } });
      if (!res) return undefined;
      choices = res.choices;
    }
    const applied = applyLevelUp(current, choices);
    if (applied.errors.length) return undefined;
    steps.push({ before: current, choices });
    current = applied.character;
  }
  if (!(await openMultiLevelSummary(character, current, steps))) return undefined;
  // Se vuelve a aplicar desde el original con las mismas decisiones: el
  // resultado es idéntico y garantiza que todo el lote es válido.
  const res = applyLevelUps(character, steps.map((s) => s.choices));
  return res.errors.length ? undefined : res.character;
}

// ── Bajar varios niveles ─────────────────────────────────────────────────

function improvementLabel(imp) {
  if (!imp) return '';
  if (imp.type === 'asi') return Object.entries(imp.increases).map(([k, v]) => `${ABILITY_LABEL[k]} +${v}`).join(', ');
  if (imp.type === 'feat') return `Dote: ${featName(imp.name)}`;
  return '';
}

/**
 * Baja de nivel N veces (10 → 9 → … → 5) con la misma lógica que «Bajar nivel».
 * Muestra antes qué se pierde. Devuelve el personaje nuevo o undefined.
 */
export async function openMultiLevelDown(character) {
  let spells = null;
  if (character.spells.known.length) {
    try { spells = await loadSpells(); } catch { spells = null; }
  }
  const current = character.levels.length;
  return openDialog({
    title: 'Bajar varios niveles',
    size: 'lg',
    render(body, close) {
      let target = Math.max(0, current - 1);
      let dropSpells = true;
      const draw = () => {
        const p = levelDownPreview(character, target, spells);
        setHtml(body, html`<div class="stack">
          <div class="form-grid form-grid--wide">
            <div class="field"><label class="field__label" for="ld-target">Bajar hasta</label>
              <select id="ld-target" class="select" data-target>${Array.from({ length: current }, (_, i) => current - 1 - i).map((n) => html`<option value="${n}" ${n === target ? raw('selected') : ''}>${n === 0 ? 'Sin niveles (quitar todas las clases)' : `Nivel ${n}${n === current - 1 ? ' (sólo uno)' : ` (−${current - n})`}`}</option>`)}</select></div>
            <div class="callout"><p>Se quitan uno a uno, igual que con «Bajar nivel». Se conservan raza, trasfondo, equipo, notas, rasgos con origen y criaturas.</p></div>
          </div>
          <section aria-labelledby="ld-lost"><h3 id="ld-lost" class="content-form__section">Se perderá</h3>
            <div class="table-wrap"><table class="table">
              <thead><tr><th class="num" scope="col">Nivel</th><th scope="col">Clase</th><th scope="col">Mejora o dote</th><th class="num" scope="col">PG</th></tr></thead>
              <tbody>${p.levels.map((l) => html`<tr><td class="num">${l.level}</td><td>${l.className}</td><td>${improvementLabel(l.improvement) || html`<span class="muted">—</span>`}</td><td class="num">${l.level === 1 ? 'máx.' : l.hpRoll}</td></tr>`)}</tbody>
            </table></div>
          </section>
          <ul class="summary-list">
            <li><span>Nivel</span><strong>${p.from} → ${p.to}</strong></li>
            <li><span>PG máximos</span><strong>${p.hp.before} → ${p.hp.after}</strong></li>
            ${p.abilities.map((a) => html`<li><span>${ABILITY_LABEL[a.ability]}</span><strong>${a.before} → ${a.after}</strong></li>`)}
            ${p.subclasses.map((x) => html`<li><span>Subclase de ${x.className}</span><strong>${x.name} (se elegirá de nuevo al volver a subir)</strong></li>`)}
            ${p.classesLost.length ? html`<li><span>Clases que se quitan</span><strong>${p.classesLost.join(', ')}</strong></li>` : ''}
            ${p.epicBoons.length ? html`<li><span>Bendiciones épicas</span><strong>${p.epicBoons.join(', ')}</strong></li>` : ''}
          </ul>
          ${p.features.length ? html`<details class="disclosure"><summary>Rasgos de clase que se dejan de tener (${p.features.length})</summary>
            <div class="disclosure__body"><ul class="basics__list">${p.features.map((f) => html`<li><strong>${f.className} ${f.level}:</strong> ${f.title}</li>`)}</ul></div></details>` : ''}
          ${p.spellsAbove.length ? html`<label class="check check--lg"><input type="checkbox" data-drop-spells ${dropSpells ? raw('checked') : ''}>
            <span><strong>Olvidar ${p.spellsAbove.length} conjuro(s) de un nivel que ya no puedes lanzar</strong><br><small>${p.spellsAbove.join(', ')}. Desmárcalo si los obtuviste por otra vía (un objeto, una dote…).</small></span></label>` : ''}
          <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button type="button" class="btn btn--danger" data-ok>Bajar a nivel ${p.to}</button></div>
        </div>`);
        body.querySelector('[data-ok]').addEventListener('click', () => close(dropSpells && p.spellsAbove.length ? forgetSpells(p.character, p.spellsAbove) : p.character));
      };
      body.addEventListener('change', (e) => {
        if (e.target.matches('[data-target]')) { target = Number(e.target.value); draw(); body.querySelector('[data-target]').focus(); }
        if (e.target.matches('[data-drop-spells]')) dropSpells = e.target.checked;
      });
      draw();
    },
  });
}
