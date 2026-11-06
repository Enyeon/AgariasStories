// Asistente de subida de nivel y selector de dotes.
// Los pasos se calculan con planLevelUp(): sólo se muestran los que aplican.

import { html, setHtml, richText, raw } from '../ui/dom.js';
import { openDialog } from '../ui/feedback.js';
import { ABILITY_KEYS, ABILITY_LABEL, CLASS_SECTIONS } from '../domain/constants.js';
import { listClasses, getFeat, data } from '../data/index.js';
import {
  abilityScores, averageHitDieRoll, classLevels, featAbilityOptions, featPrerequisites, proficiencyBonus,
  spellcasting, totalLevel, abilityModifier, formatModifier,
} from '../domain/rules.js';
import { planLevelUp, applyLevelUp, rollDie, validateImprovement } from '../domain/progression.js';

const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ── Selector de dotes ────────────────────────────────────────────────────

function featList(character, { excludeRaceFeat = false } = {}) {
  const scores = abilityScores(character);
  const { isCaster } = spellcasting(character, scores, proficiencyBonus(Math.max(1, totalLevel(character))));
  const probe = excludeRaceFeat ? { ...character, race: { ...character.race, feat: null } } : character;
  return Object.entries(data.feats).map(([name, def]) => {
    const pre = featPrerequisites(probe, def, scores, { isCaster });
    return { name, def, ok: pre.ok, reasons: pre.reasons, options: featAbilityOptions(def) };
  }).sort((a, b) => Number(b.ok) - Number(a.ok) || a.name.localeCompare(b.name, 'es'));
}

/** Panel de elección de dote embebible. Llama a onChange({ name, ability }). */
function mountFeatChooser(root, character, { initial, onChange, excludeRaceFeat }) {
  const feats = featList(character, { excludeRaceFeat });
  let query = '';
  let showAll = false;
  let selected = initial?.name ?? null;
  let ability = initial?.ability ?? null;

  function renderList() {
    const q = normalize(query);
    const items = feats.filter((f) => (showAll || f.ok) && (!q || normalize(f.name).includes(q)));
    return items.length ? items.map((f) => html`<button type="button" class="race-option ${f.name === selected ? 'is-selected' : ''} ${f.ok ? '' : 'is-locked'}" data-feat="${f.name}" aria-pressed="${f.name === selected}">
        <span class="race-option__name">${f.name}</span>
        <span class="race-option__bonus">${f.ok ? (f.options.length ? `+1 a ${f.options.map((k) => ABILITY_LABEL[k].slice(0, 3)).join('/')}` : Object.keys(f.def.aumentarStat ?? {}).map((k) => `${ABILITY_LABEL[k]} +1`).join(', ') || 'Sin aumento de atributo') : f.reasons.join(' · ')}</span>
      </button>`) : html`<p class="muted">Sin resultados.</p>`;
  }

  function renderDetail() {
    const f = feats.find((x) => x.name === selected);
    if (!f) return html`<p class="muted">Selecciona una dote para ver su descripción.</p>`;
    return html`<h4>${f.name}</h4>
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
    onChange({ name: selected, ability });
  });
  render();
}

export function openFeatPicker(character, { title = 'Elige una dote', excludeRaceFeat = false } = {}) {
  return openDialog({
    title,
    size: 'lg',
    render(body, close) {
      let choice = character.race.feat ? { ...character.race.feat } : null;
      setHtml(body, html`<div data-chooser></div><p class="field__error" data-error role="alert"></p>
        <div class="dialog__footer"><button class="btn btn--ghost" data-dialog-close>Cancelar</button><button class="btn btn--primary" data-ok>Confirmar dote</button></div>`);
      mountFeatChooser(body.querySelector('[data-chooser]'), character, { initial: choice, excludeRaceFeat, onChange: (c) => { choice = c; } });
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

export function openLevelUpWizard(character) {
  return openDialog({
    title: character.levels.length ? `Subir a nivel ${character.levels.length + 1}` : 'Nivel 1: elige tu clase',
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
        hpRoll: null,
        hpMethod: null,
        error: '',
      };
      const scores = abilityScores(character);
      const current = classLevels(character);

      const steps = () => {
        const s = ['class'];
        if (state.plan?.needsSubclass) s.push('subclass');
        if (state.plan?.needsImprovement) s.push('improvement');
        if (state.plan?.featureChoice) s.push('feature');
        s.push('hp', 'confirm');
        return s;
      };
      const LABELS = { class: 'Clase', subclass: 'Subclase', improvement: 'Mejora', feature: 'Rasgo', hp: 'Puntos de golpe', confirm: 'Confirmar' };

      function improvement() {
        if (!state.plan?.needsImprovement) return undefined;
        if (state.improvementType === 'feat') return state.feat ? { type: 'feat', ...state.feat } : null;
        const [a, b] = state.asi;
        if (state.asiMode === 'one') return a ? { type: 'asi', increases: { [a]: 2 } } : null;
        return a && b && a !== b ? { type: 'asi', increases: { [a]: 1, [b]: 1 } } : null;
      }

      function stepClass() {
        const groups = Object.entries(CLASS_SECTIONS).map(([sec, label]) => ({
          label, classes: listClasses().filter((c) => c.seccion === sec),
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
          ${imp ? html`<li><span>Mejora</span><strong>${imp.type === 'asi' ? Object.entries(imp.increases).map(([k, v]) => `${ABILITY_LABEL[k]} +${v}`).join(', ') : `Dote: ${imp.name}`}</strong></li>` : ''}
          ${state.featureChoice.length ? html`<li><span>Rasgo de clase</span><strong>${state.featureChoice.map((k) => ABILITY_LABEL[k]).join(', ')} +${p.featureChoice.bonus}</strong></li>` : ''}
          ${p.milestone?.statAmount ? html`<li><span>Bonificación de clase</span><strong>${Object.entries(p.milestone.statAmount).filter(([k]) => k !== 'choice').map(([k, v]) => `${ABILITY_LABEL[k]} +${v}`).join(', ')}</strong></li>` : ''}
          <li><span>Dado de golpe</span><strong>${hp} (d${p.hitDie})</strong></li>
        </ul>`;
      }

      const RENDER = { class: stepClass, subclass: stepSubclass, improvement: stepImprovement, feature: stepFeature, hp: stepHp, confirm: stepConfirm };

      function validateStep() {
        switch (state.step) {
          case 'class': return state.classKey ? '' : 'Elige una clase.';
          case 'subclass': return state.subclass ? '' : `Elige tu ${state.plan.subclassLabel}.`;
          case 'improvement': {
            const imp = improvement();
            if (!imp) return state.improvementType === 'feat' ? 'Elige una dote (y su atributo si corresponde).' : 'Completa el reparto de atributos.';
            return validateImprovement(character, imp).join(' ');
          }
          case 'feature': return state.featureChoice.length === state.plan.featureChoice.count ? '' : `Elige ${state.plan.featureChoice.count} atributo(s).`;
          case 'hp': return state.plan.isFirstLevel || state.hpRoll ? '' : 'Tira el dado, usa el promedio o introduce tu tirada.';
          default: return '';
        }
      }

      function render() {
        const list = steps();
        const idx = list.indexOf(state.step);
        setHtml(body, html`
          <ol class="stepper" aria-label="Pasos">
            ${list.map((s, i) => html`<li class="stepper__item ${i < idx ? 'is-done' : ''} ${i === idx ? 'is-current' : ''}" ${i === idx ? raw('aria-current="step"') : ''}>${s === 'subclass' ? state.plan.subclassLabel : LABELS[s]}</li>`)}
          </ol>
          <div class="wizard__body">${RENDER[state.step]()}</div>
          <p class="field__error" role="alert">${state.error}</p>
          <div class="dialog__footer">
            <button type="button" class="btn btn--ghost" data-nav="back">${idx === 0 ? 'Cancelar' : '← Atrás'}</button>
            <button type="button" class="btn btn--primary" data-nav="next">${state.step === 'confirm' ? '✓ Confirmar subida' : 'Continuar →'}</button>
          </div>`);
        if (state.step === 'improvement' && state.improvementType === 'feat') {
          mountFeatChooser(body.querySelector('[data-feat-root]'), character, {
            initial: state.feat,
            onChange: (f) => { state.feat = f; state.error = ''; },
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
          if (state.step === 'confirm') {
            const res = applyLevelUp(character, {
              classKey: state.classKey,
              hpRoll: state.hpRoll,
              improvement: improvement(),
              subclass: state.subclass,
              featureChoices: { statAmount: state.featureChoice },
            });
            if (res.errors.length) { state.error = res.errors.join(' '); return render(); }
            return close(res.character);
          }
        } else if (idx === 0) {
          return close(undefined);
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
            Object.assign(state, { subclass: null, feat: null, asi: [null, null], featureChoice: [], hpRoll: null, hpMethod: null });
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
