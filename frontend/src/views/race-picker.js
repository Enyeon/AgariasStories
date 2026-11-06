// Selector de raza: buscador + catálogo agrupado por manual.

import { html, setHtml, richText, raw } from '../ui/dom.js';
import { openDialog } from '../ui/feedback.js';
import { data, getRace } from '../data/index.js';
import { raceBonusText } from './sheet/progression.js';

const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function openRacePicker(currentKey) {
  return openDialog({
    title: 'Elige una raza',
    size: 'lg',
    render(body, close) {
      let query = '';
      let selected = currentKey ?? null;

      function list() {
        const q = normalize(query.trim());
        const groups = data.raceCatalog
          .map((g) => ({ ...g, races: g.races.filter((r) => !q || normalize(r).includes(q)) }))
          .filter((g) => g.races.length);
        if (!groups.length) return html`<p class="muted">No hay razas que coincidan con «${query}».</p>`;
        return groups.map((g) => html`<details class="disclosure" ${q || g.races.includes(selected) ? raw('open') : ''}>
          <summary>${g.source} <span class="badge">${g.races.length}</span></summary>
          <div class="disclosure__body"><div class="race-options">
            ${g.races.map((r) => html`<button type="button" class="race-option ${r === selected ? 'is-selected' : ''}" data-race="${r}" aria-pressed="${r === selected}">
              <span class="race-option__name">${r}</span>
              <span class="race-option__bonus">${raceBonusText(getRace(r)) || 'Sin bonificaciones de atributo'}</span>
            </button>`)}
          </div></div>
        </details>`);
      }

      function detail() {
        const race = getRace(selected);
        if (!race) return html`<p class="muted">Selecciona una raza para ver sus rasgos.</p>`;
        return html`<h3>${selected}</h3>
          <p><span class="badge badge--accent">${raceBonusText(race) || 'Sin bonificaciones'}</span> <span class="badge">Velocidad ${race.velocidad ?? 30} pies</span></p>
          <p class="muted">${race.lenguage ?? ''}</p>
          <div class="rich">${richText(race.info)}</div>`;
      }

      function render() {
        setHtml(body, html`
          <div class="picker">
            <div class="picker__list">
              <label class="field"><span class="visually-hidden">Buscar raza</span>
                <input class="input" type="search" placeholder="Buscar raza…" value="${query}" data-search autofocus></label>
              <div class="picker__scroll" data-list>${list()}</div>
            </div>
            <div class="picker__detail" data-detail aria-live="polite">${detail()}</div>
          </div>
          <div class="dialog__footer">
            <button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button>
            <button type="button" class="btn btn--primary" data-confirm ${selected ? '' : raw('disabled')}>Elegir ${selected ?? 'raza'}</button>
          </div>`);
      }

      body.addEventListener('input', (e) => {
        if (!e.target.matches('[data-search]')) return;
        query = e.target.value;
        setHtml(body.querySelector('[data-list]'), list());
      });
      body.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-race]');
        if (btn) {
          selected = btn.dataset.race;
          body.querySelectorAll('[data-race]').forEach((b) => {
            b.classList.toggle('is-selected', b.dataset.race === selected);
            b.setAttribute('aria-pressed', String(b.dataset.race === selected));
          });
          setHtml(body.querySelector('[data-detail]'), detail());
          const confirm = body.querySelector('[data-confirm]');
          confirm.disabled = false;
          confirm.textContent = `Elegir ${selected}`;
          if (window.matchMedia('(max-width: 760px)').matches) body.querySelector('[data-detail]').scrollIntoView({ behavior: 'smooth' });
          return;
        }
        if (e.target.closest('[data-confirm]') && selected) close(selected);
      });
      render();
    },
  });
}
