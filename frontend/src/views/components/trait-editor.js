// Diálogo para crear o editar un rasgo con origen genérico.

import { html, raw, setHtml } from '../../ui/dom.js';
import { openDialog, trackChanges } from '../../ui/feedback.js';
import { TRAIT_ORIGINS } from '../../domain/proficiencies.js';
import { normalizeTrait } from '../../domain/validation.js';
import { effectsFieldset, bindEffectsEditor, readEffects } from './effects-editor.js';

/**
 * @param {object|null} initial  Rasgo a editar (o null para uno nuevo).
 * @param {{ allowEffects?: boolean }} opts  Sin permiso, el rasgo es sólo narrativo.
 * @returns {Promise<object|undefined>} el rasgo normalizado o undefined si se cancela.
 */
export function openTraitEditor(initial, { allowEffects = true, catalog = [] } = {}) {
  const t = initial ?? { name: '', description: '', origin: 'dm', originDetail: '', effects: [], active: true, ref: null };
  let linked = t.ref ? catalog.find((e) => e.ref === t.ref) ?? null : null;
  const tracker = trackChanges();
  return openDialog({
    guard: tracker.guard,
    title: initial ? 'Editar rasgo' : 'Nuevo rasgo',
    size: 'lg',
    render(body, close) {
      setHtml(body, html`<form class="stack" data-form novalidate>
        ${catalog.length ? html`<div class="field"><label class="field__label" for="tr-ref">Rasgo del Homebrew (opcional)</label>
          <select id="tr-ref" class="select" name="ref"><option value="">— Rasgo propio —</option>${catalog.map((e) => html`<option value="${e.ref}" ${t.ref === e.ref ? raw('selected') : ''}>${e.item.name} · ${e.packName}</option>`)}</select>
          <span class="field__hint">Si eliges uno, se copian su nombre, descripción y efectos, y se mantiene el vínculo con el original.</span></div>` : ''}
        <div class="form-grid form-grid--wide">
          <div class="field"><label class="field__label" for="tr-name">Nombre *</label>
            <input id="tr-name" class="input" name="name" maxlength="120" required value="${t.name}" autofocus placeholder="Ej.: Marca del Pacto Roto"></div>
          <div class="field"><label class="field__label" for="tr-origin">Origen</label>
            <select id="tr-origin" class="select" name="origin">${Object.entries(TRAIT_ORIGINS).map(([k, l]) => html`<option value="${k}" ${t.origin === k ? raw('selected') : ''}>${l}</option>`)}</select></div>
        </div>
        <div class="field"><label class="field__label" for="tr-detail">¿De dónde viene?</label>
          <input id="tr-detail" class="input" name="originDetail" maxlength="2000" value="${t.originDetail}" placeholder="Ej.: Recibida al sobrevivir al ritual de la Torre Gris (sesión 14)">
          <span class="field__hint">Explica el origen con tus palabras: un objeto, un evento, una decisión del DM…</span></div>
        <div class="field"><label class="field__label" for="tr-desc">Descripción</label>
          <textarea id="tr-desc" class="textarea" name="description" rows="5" maxlength="20000" placeholder="Qué hace el rasgo y cuándo se usa">${t.description}</textarea></div>
        ${allowEffects
          ? effectsFieldset(t.effects)
          : html`<p class="callout">Tu campaña sólo permite al DM asignar rasgos con efectos automáticos. Este rasgo será narrativo: descríbelo en el texto.</p>`}
        <label class="check"><input type="checkbox" name="active" ${t.active !== false ? raw('checked') : ''}> Activo (sus efectos se aplican a la ficha)</label>
        <p class="field__error" data-error role="alert"></p>
        <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button type="submit" class="btn btn--primary">Guardar rasgo</button></div>
      </form>`);
      const form = body.querySelector('[data-form]');
      bindEffectsEditor(form);
      tracker.watch(form);
      if (linked) form.querySelector('[data-effects]')?.setAttribute('hidden', '');
      form.addEventListener('change', (e) => {
        if (e.target.name !== 'ref') return;
        linked = catalog.find((x) => x.ref === e.target.value) ?? null;
        if (linked) {
          form.querySelector('#tr-name').value = linked.item.name;
          form.querySelector('#tr-desc').value = linked.item.description;
          const box = form.querySelector('[data-effects]');
          if (box) box.hidden = true;
        } else {
          const box = form.querySelector('[data-effects]');
          if (box) box.hidden = false;
        }
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const name = String(fd.get('name') ?? '').trim();
        if (!name) {
          body.querySelector('[data-error]').textContent = 'Ponle un nombre al rasgo.';
          form.querySelector('#tr-name').focus();
          return;
        }
        close(normalizeTrait({
          ...t,
          name,
          origin: fd.get('origin'),
          originDetail: fd.get('originDetail'),
          description: fd.get('description'),
          ref: linked?.ref ?? null,
          effects: linked ? linked.item.effects : allowEffects ? readEffects(form) : (t.effects ?? []),
          active: fd.get('active') === 'on',
        }));
      });
    },
  });
}
