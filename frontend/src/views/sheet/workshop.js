// Pestaña «Taller» del Ingeniero: Energía, artefactos equipados por hueco,
// inventario de materiales y construcción de objetos (catálogo + diseños
// propios) con módulos. La lógica está en domain/workshop.js.

import { html, raw, richText, setHtml } from '../../ui/dom.js';
import { openDialog, toast, confirmDialog } from '../../ui/feedback.js';
import { knownChoices, choiceListDef, pendingDeferredChoices } from '../../domain/class-choices.js';
import {
  TIERS, TIER_ENERGY, COMPLEXITY, MATERIALS, CATEGORIES, MODULE_TYPES, materialName, categoryName, moduleTypeName,
  workshopClass, hasWorkshop, energyMax, energyNow, changeEnergy, slotUsage, knownGadgets, setEquipped,
  adjustMaterial, scavenge, allRecipes, allModules, modulesFor, planBuild, build, dismantle,
  saveDesign, removeDesign,
} from '../../domain/workshop.js';
import { coinsInCp } from '../../domain/money.js';
import { sectionCard } from './common.js';
import { fillChoices } from './features.js';

const intMod = (ctx) => ctx.sheet.scores.inteligencia.modifier;
const sheetInfo = (sheet) => ({
  toolNames: sheet.proficiencies.herramientas.map((t) => t.name),
  weaponNames: sheet.proficiencies.armas.map((t) => t.name),
  scores: sheet.scores, proficiency: sheet.proficiency,
});
const ui = (ctx) => (ctx.ui.workshop ??= { cat: '' });
const fmtGold = (cp) => `${Math.floor(cp / 100)} po${cp % 100 ? ` ${cp % 100} pc` : ''}`;

function pendingCallout(ctx) {
  if (ctx.readOnly) return '';
  const pending = pendingDeferredChoices(ctx.character, 'taller');
  const total = pending.reduce((t, m) => t + m.cantidad, 0);
  if (!total) return '';
  const classes = [...new Set(pending.map((m) => m.classKey))];
  return html`<div class="callout callout--accent spell-allowance" role="status">
    <p><strong>🔧 Aún puedes aprender ${total} esquema${total === 1 ? '' : 's'}.</strong> Tómate tu tiempo: puedes elegir algunos ahora y el resto más tarde.</p>
    <div class="row">${classes.map((k) => html`<button type="button" class="btn btn--primary btn--sm" data-action="workshop-fill" data-class="${k}">Elegir esquemas</button>`)}</div>
  </div>`;
}

function energyCard(ctx) {
  const max = energyMax(ctx.character, intMod(ctx));
  const now = energyNow(ctx.character, intMod(ctx));
  const { slots, used, ok, always } = slotUsage(ctx.character);
  const ro = ctx.readOnly;
  return sectionCard({
    title: 'Energía y huecos',
    subtitle: 'Recuperas tu nivel de Energía con un descanso corto y toda con uno largo.',
    body: html`<div class="workshop-stats">
      <div class="workshop-energy">
        <span class="eyebrow">Energía</span>
        <strong class="workshop-energy__value" aria-live="polite">${max ? `${now} / ${max}` : '—'}</strong>
        ${max && !ro ? html`<div class="row">
          <button type="button" class="btn btn--ghost btn--sm" data-action="workshop-energy" data-delta="1" ${now <= 0 ? raw('disabled') : ''} aria-label="Gastar 1 de Energía">−1</button>
          <button type="button" class="btn btn--ghost btn--sm" data-action="workshop-energy" data-delta="-1" ${now >= max ? raw('disabled') : ''} aria-label="Recuperar 1 de Energía">+1</button>
          <button type="button" class="btn btn--ghost btn--sm" data-action="workshop-energy" data-rest="corto">Descanso corto</button>
          <button type="button" class="btn btn--ghost btn--sm" data-action="workshop-energy" data-rest="largo">Descanso largo</button>
        </div>` : html`<span class="muted">Desde el nivel 2 de Ingeniero.</span>`}
      </div>
      <div class="workshop-slots">
        <span class="eyebrow">Artefactos equipados</span>
        <div class="chips chips--static">${TIERS.map((t) => html`<span class="badge ${used[t] > slots[t] ? 'badge--warning' : ''}">${t}: ${used[t]}/${slots[t]}${t === always ? ' · siempre' : ''}</span>`)}</div>
        ${ok ? '' : html`<p class="field__error">Llevas más artefactos de los que caben: quita alguno.</p>`}
      </div>
    </div>`,
  });
}

function gadgetsCard(ctx) {
  const gadgets = knownGadgets(ctx.character);
  const equipped = new Set(ctx.character.workshop?.equipped ?? []);
  const w = workshopClass(ctx.character);
  const devDef = w ? choiceListDef(w.classKey, w.subclass, 'dispositivo-caracteristico') : null;
  const devices = w ? (knownChoices(ctx.character, w.classKey)['dispositivo-caracteristico'] ?? []).map((id) => devDef?.opciones?.find((o) => o.id === id)).filter(Boolean) : [];
  const body = html`
    ${devices.length ? html`<h4 class="grimoire__level">Dispositivo característico</h4>
      ${devices.map((d) => html`<details class="disclosure" data-key="dev:${d.id}"><summary><strong>${d.nombre}</strong></summary><div class="disclosure__body rich">${richText(d.descripcion)}</div></details>`)}` : ''}
    ${gadgets.length ? TIERS.filter((t) => gadgets.some((g) => g.complejidad === t)).map((t) => html`<h4 class="grimoire__level">${t} <span class="muted">· ${TIER_ENERGY[t]} Energía al activar</span></h4>
      ${gadgets.filter((g) => g.complejidad === t).map((g) => html`<details class="disclosure ${equipped.has(g.id) ? 'is-prepared' : ''}" data-key="gad:${g.id}">
        <summary><span class="spell__title">${g.nombre}</span><span class="spell__badges">${g.activacion ? html`<span class="badge">${g.activacion}</span>` : ''}${equipped.has(g.id) ? html`<span class="badge badge--gold">Equipado</span>` : ''}</span></summary>
        <div class="disclosure__body">
          <div class="rich">${richText(g.descripcion)}</div>
          ${ctx.readOnly ? '' : html`<label class="check"><input type="checkbox" data-workshop-equip value="${g.id}" ${equipped.has(g.id) ? raw('checked') : ''}> Equipado</label>`}
        </div>
      </details>`)}`) : html`<p class="muted">Aún no conoces esquemas.</p>`}`;
  return sectionCard({ title: 'Artefactos', subtitle: 'Marca los que llevas equipados. Puedes cambiarlos al terminar un descanso largo.', body });
}

function materialsCard(ctx) {
  const stock = ctx.character.workshop?.materials ?? {};
  const w = workshopClass(ctx.character);
  const ro = ctx.readOnly;
  return sectionCard({
    title: 'Materiales',
    subtitle: `Tienes ${fmtGold(coinsInCp(ctx.character.equipment.coins))}. Los materiales se compran en la Tienda (puesto «El Engranaje Risueño»); los que te dé el DM, súmalos con +.`,
    actions: ro ? '' : html`<span class="row">${ctx.recordId ? html`<a class="btn btn--primary btn--sm" href="/tienda/${ctx.recordId}" data-link>🛒 Comprar en la Tienda</a>` : ''}${w?.level >= 9 ? html`<button type="button" class="btn btn--gold btn--sm" data-action="workshop-scavenge" title="Héroe del desguace: 1d4 + tu nivel en chatarra">🎲 Desguace (1 hora)</button>` : ''}</span>`,
    body: html`<div class="table-wrap"><table class="table">
      <thead><tr><th scope="col">Material</th><th class="num" scope="col">Valor</th><th class="num" scope="col">Tienes</th>${ro ? '' : html`<th scope="col"><span class="visually-hidden">Acciones</span></th>`}</tr></thead>
      <tbody>${MATERIALS.map((m) => html`<tr>
        <td><span title="${m.descripcion}">${m.nombre}</span></td>
        <td class="num">${m.precio} po</td>
        <td class="num"><strong>${stock[m.id] ?? 0}</strong></td>
        ${ro ? '' : html`<td><div class="row row--end">
          <button type="button" class="icon-btn" data-action="workshop-mat" data-id="${m.id}" data-delta="-1" aria-label="Quitar 1 de ${m.nombre}" ${stock[m.id] ? '' : raw('disabled')}>−</button>
          <button type="button" class="icon-btn" data-action="workshop-mat" data-id="${m.id}" data-delta="1" aria-label="Sumar 1 de ${m.nombre}">+</button>
        </div></td>`}
      </tr>`)}</tbody>
    </table></div>`,
  });
}

function partMaterials(ctx, mat) {
  const stock = ctx.character.workshop?.materials ?? {};
  return html`<span class="chips chips--static">${Object.entries(mat ?? {}).map(([id, q]) => html`<span class="badge ${(stock[id] ?? 0) >= q ? 'badge--success' : 'badge--warning'}">${materialName(id)} ${stock[id] ?? 0}/${q}</span>`)}</span>`;
}

function recipeLine(r) {
  const x = r.resultado ?? {};
  if (x.tipo === 'arma') return `${x.dado} ${x.tipoDano}${x.alcance ? ` · ${x.alcance}` : ''}${x.propiedades ? ` · ${x.propiedades}` : ''}`;
  if (x.tipo === 'armadura') return `${x.tipoArmadura} · CA ${x.ca}${x.nota ? ` · ${x.nota}` : ''}`;
  return x.nota ?? '';
}

function craftCard(ctx) {
  const level = workshopClass(ctx.character)?.level ?? 0;
  const cat = ui(ctx).cat;
  const recipes = allRecipes(ctx.character).filter((r) => !cat || r.categoria === cat);
  return sectionCard({
    title: 'Taller de creación',
    subtitle: 'Armas de fuego, armas mecánicas, armaduras y equipo. La complejidad fija el valor, el tiempo y el nivel necesario.',
    actions: ctx.readOnly ? '' : html`<button type="button" class="btn btn--ghost btn--sm" data-action="workshop-design">＋ Nuevo diseño</button>`,
    body: html`<div class="filters">
        <select class="select" data-workshop-filter aria-label="Categoría"><option value="">Todas las categorías</option>${CATEGORIES.map((c) => html`<option value="${c.id}" ${cat === c.id ? raw('selected') : ''}>${c.nombre}</option>`)}</select>
      </div>
      <div class="recipe-grid">${recipes.map((r) => {
        const need = COMPLEXITY[r.complejidad]?.nivel ?? 1;
        return html`<article class="recipe-card ${level < need ? 'is-locked' : ''}">
          <header class="row row--between">
            <strong>${r.nombre}</strong>
            <span class="chips chips--static"><span class="badge">${r.complejidad}</span>${r.origen === 'diseno' ? html`<span class="badge badge--accent">Diseño propio</span>` : ''}</span>
          </header>
          <p class="muted">${categoryName(r.categoria)} · ${(r.herramientas ?? []).join(' o ')}${level < need ? ` · Ingeniero ${need}` : ''}</p>
          ${recipeLine(r) ? html`<p>${recipeLine(r)}</p>` : ''}
          ${partMaterials(ctx, r.materiales)}
          ${r.ranuras?.length ? html`<p class="muted">Ranuras: ${r.ranuras.map(moduleTypeName).join(', ')}</p>` : ''}
          ${ctx.readOnly ? '' : html`<div class="row row--end">
            ${r.origen === 'diseno' ? html`<button type="button" class="btn btn--ghost btn--sm btn--danger-text" data-action="workshop-design-del" data-id="${r.id}">Borrar diseño</button>` : ''}
            <button type="button" class="btn btn--primary btn--sm" data-action="workshop-build" data-id="${r.id}">Construir…</button>
          </div>`}
        </article>`;
      })}</div>
      ${designedModules(ctx)}`,
  });
}

function designedModules(ctx) {
  const mods = allModules(ctx.character).filter((m) => m.origen === 'diseno');
  if (!mods.length) return '';
  return html`<h4 class="grimoire__level">Mis módulos</h4>
    <ul class="choices-panel__items">${mods.map((m) => html`<li class="row row--between">
      <span><strong>${m.nombre}</strong> <span class="muted">· ${moduleTypeName(m.tipo)} · ${m.complejidad} · ${m.categorias.map(categoryName).join(', ')}</span><br>${m.efecto}</span>
      ${ctx.readOnly ? '' : html`<button type="button" class="btn btn--ghost btn--sm btn--danger-text" data-action="workshop-design-del" data-id="${m.id}">Borrar</button>`}
    </li>`)}</ul>`;
}

function creationsCard(ctx) {
  const list = ctx.character.workshop?.creations ?? [];
  if (!list.length) return '';
  const mods = allModules(ctx.character);
  return sectionCard({
    title: 'Mis creaciones',
    subtitle: 'Lo construido está también en la pestaña Equipo. Desmontar devuelve la mitad de los materiales.',
    body: html`<ul class="choices-panel__items">${list.map((cr) => html`<li class="row row--between">
      <span><strong>${cr.name}</strong>${cr.modules.length ? html` <span class="muted">· ${cr.modules.map((id) => mods.find((m) => m.id === id)?.nombre ?? id).join(', ')}</span>` : ''}${cr.at ? html` <span class="muted">· ${cr.at}</span>` : ''}</span>
      ${ctx.readOnly ? '' : html`<button type="button" class="btn btn--ghost btn--sm" data-action="workshop-dismantle" data-id="${cr.id}">Desmontar</button>`}
    </li>`)}</ul>`,
  });
}

export function renderWorkshop(ctx) {
  if (!hasWorkshop(ctx.character)) {
    return html`<div class="callout"><p>El Taller es del Ingeniero. Sube un nivel en esa clase para usarlo.</p></div>`;
  }
  return html`<div class="stack">
    ${pendingCallout(ctx)}
    ${energyCard(ctx)}
    ${gadgetsCard(ctx)}
    ${materialsCard(ctx)}
    ${craftCard(ctx)}
    ${creationsCard(ctx)}
  </div>`;
}

// ── Diálogos ─────────────────────────────────────────────────────────────

async function openBuild(ed, recipeId) {
  const recipe = allRecipes(ed.character).find((r) => r.id === recipeId);
  if (!recipe) return;
  const state = { name: '', modules: (recipe.ranuras ?? []).map(() => '') };
  const info = sheetInfo(ed.sheet);
  const ok = await openDialog({
    title: `Construir: ${recipe.nombre}`,
    size: 'lg',
    render(body, close) {
      const draw = () => {
        const plan = planBuild(ed.character, recipe.id, state.modules, { ...info, name: state.name });
        setHtml(body, html`<div class="stack">
          ${recipe.descripcion ? html`<div class="rich muted">${richText(recipe.descripcion)}</div>` : ''}
          <div class="field"><label class="field__label" for="wb-name">Nombre del objeto</label>
            <input id="wb-name" class="input" maxlength="80" value="${state.name}" placeholder="${recipe.nombre}" data-wb-name></div>
          ${(recipe.ranuras ?? []).length ? html`<fieldset class="choice-group"><legend>Módulos</legend><div class="form-grid">
            ${recipe.ranuras.map((t, i) => {
              const opts = modulesFor(ed.character, recipe, t);
              return html`<div class="field"><label class="field__label" for="wb-m${i}">${moduleTypeName(t)}</label>
                <select id="wb-m${i}" class="select" data-wb-slot="${i}"><option value="">— Ninguno —</option>
                  ${opts.map((m) => html`<option value="${m.id}" ${state.modules[i] === m.id ? raw('selected') : ''}>${m.nombre} (${m.complejidad})</option>`)}</select>
                ${state.modules[i] ? html`<span class="field__hint">${opts.find((m) => m.id === state.modules[i])?.efecto ?? ''}</span>` : ''}</div>`;
            })}</div></fieldset>` : ''}
          <ul class="summary-list">
            <li><span>Resultado</span><strong>${plan.item?.notes.split('\n').slice(1).join(' · ') || recipe.nombre}</strong></li>
            <li><span>Materiales</span><strong>${Object.keys(plan.materials ?? {}).length ? partMaterials(ed, plan.materials) : '—'}</strong></li>
            <li><span>Oro</span><strong>${plan.gold ?? 0} po</strong></li>
            <li><span>Tiempo</span><strong>${plan.hours ?? 0} horas</strong></li>
            ${plan.discounts?.length ? html`<li><span>Descuentos</span><strong>${plan.discounts.join(' · ')}</strong></li>` : ''}
          </ul>
          ${plan.errors.length ? html`<div class="callout callout--warning"><ul>${plan.errors.map((e) => html`<li>${e}</li>`)}</ul></div>` : ''}
          <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button>
            <button type="button" class="btn btn--primary" data-ok ${plan.errors.length ? raw('disabled') : ''}>🔧 Construir</button></div>
        </div>`);
        body.querySelector('[data-ok]').addEventListener('click', () => close(true));
      };
      body.addEventListener('change', (e) => {
        if (e.target.matches('[data-wb-slot]')) { state.modules[Number(e.target.dataset.wbSlot)] = e.target.value; draw(); }
      });
      body.addEventListener('input', (e) => { if (e.target.matches('[data-wb-name]')) state.name = e.target.value; });
      draw();
    },
  });
  if (!ok) return;
  const res = build(ed.character, recipe.id, state.modules, { ...info, name: state.name });
  if (res.errors.length) return toast(res.errors.join(' '), { type: 'error' });
  ed.replace(res.character, { keepScroll: true, message: `Construido: ${res.plan.item.name} (${res.plan.hours} h). Está en la pestaña Equipo.` });
}

async function openDesign(ed) {
  const d = { kind: 'receta', nombre: '', categoria: 'arma-fuego', complejidad: 'Simple', herramienta: 'Herramientas de armero', materiales: {}, ranuras: [], resultado: {}, tipo: 'sistema', categorias: [], efecto: '', descripcion: '' };
  let error = '';
  const result = await openDialog({
    title: 'Nuevo diseño',
    size: 'lg',
    guard: { isDirty: () => Boolean(d.nombre) },
    render(body, close) {
      const read = () => {
        const f = new FormData(body.querySelector('form'));
        for (const k of ['nombre', 'categoria', 'complejidad', 'herramienta', 'tipo', 'efecto', 'descripcion', 'ataque', 'ca', 'dano']) if (f.has(k)) d[k] = f.get(k);
        if (d.kind === 'receta') {
          d.ranuras = f.getAll('ranuras');
          d.resultado = { dado: f.get('r-dado') ?? '', tipoDano: f.get('r-tipo') ?? '', alcance: f.get('r-alcance') ?? '', propiedades: f.get('r-prop') ?? '', competencia: f.get('r-comp') ?? '', ca: f.get('r-ca') ?? '', tipoArmadura: f.get('r-tarm') ?? '', nota: f.get('r-nota') ?? '' };
        } else d.categorias = f.getAll('categorias');
        d.materiales = Object.fromEntries(MATERIALS.map((m) => [m.id, Number(f.get(`mat-${m.id}`)) || 0]).filter(([, q]) => q > 0));
      };
      const draw = () => {
        const cx = COMPLEXITY[d.complejidad];
        const isWeapon = d.categoria === 'arma-fuego' || d.categoria === 'arma-mecanica';
        const r = d.resultado ?? {};
        setHtml(body, html`<form class="stack" novalidate>
          <div class="segmented" role="radiogroup" aria-label="Tipo de diseño">
            <label class="segmented__opt"><input type="radio" name="kind" value="receta" ${d.kind === 'receta' ? raw('checked') : ''}>Objeto (receta)</label>
            <label class="segmented__opt"><input type="radio" name="kind" value="modulo" ${d.kind === 'modulo' ? raw('checked') : ''}>Módulo</label>
          </div>
          <div class="form-grid form-grid--wide">
            <div class="field"><label class="field__label" for="wd-name">Nombre</label><input id="wd-name" class="input" name="nombre" maxlength="80" value="${d.nombre}" required></div>
            <div class="field"><label class="field__label" for="wd-cx">Complejidad</label>
              <select id="wd-cx" class="select" name="complejidad" data-wd-redraw>${TIERS.map((t) => html`<option ${d.complejidad === t ? raw('selected') : ''}>${t}</option>`)}</select>
              <span class="field__hint">Valor ${cx.valor} po · ${cx.horas} h · Ingeniero ${cx.nivel}+ (reglas de la clase).</span></div>
          </div>
          ${d.kind === 'receta' ? html`<div class="form-grid form-grid--wide">
              <div class="field"><label class="field__label" for="wd-cat">Categoría</label>
                <select id="wd-cat" class="select" name="categoria" data-wd-redraw>${CATEGORIES.map((c) => html`<option value="${c.id}" ${d.categoria === c.id ? raw('selected') : ''}>${c.nombre}</option>`)}</select></div>
              <div class="field"><label class="field__label" for="wd-tool">Herramientas</label>
                <select id="wd-tool" class="select" name="herramienta">${['Herramientas de armero', 'Herramientas de herrero', 'Herramientas de hojalatero'].map((t) => html`<option ${d.herramienta === t ? raw('selected') : ''}>${t}</option>`)}</select></div>
            </div>
            ${isWeapon ? html`<div class="form-grid">
              <div class="field"><label class="field__label" for="wd-dado">Daño</label><input id="wd-dado" class="input" name="r-dado" maxlength="8" value="${r.dado ?? ''}" placeholder="1d8"></div>
              <div class="field"><label class="field__label" for="wd-tipo">Tipo de daño</label><input id="wd-tipo" class="input" name="r-tipo" maxlength="30" value="${r.tipoDano ?? ''}" placeholder="perforante"></div>
              <div class="field"><label class="field__label" for="wd-alc">Alcance</label><input id="wd-alc" class="input" name="r-alcance" maxlength="20" value="${r.alcance ?? ''}" placeholder="30/90"></div>
              ${d.categoria === 'arma-mecanica' ? html`<div class="field"><label class="field__label" for="wd-comp">Competencia</label><select id="wd-comp" class="select" name="r-comp"><option ${r.competencia !== 'Armas marciales' ? raw('selected') : ''}>Armas simples</option><option ${r.competencia === 'Armas marciales' ? raw('selected') : ''}>Armas marciales</option></select></div>` : ''}
              <div class="field field--wide"><label class="field__label" for="wd-prop">Propiedades</label><input id="wd-prop" class="input" name="r-prop" maxlength="160" value="${r.propiedades ?? ''}" placeholder="Munición, Recarga"></div>
            </div>` : d.categoria === 'armadura' ? html`<div class="form-grid">
              <div class="field"><label class="field__label" for="wd-ca">CA</label><input id="wd-ca" class="input" name="r-ca" maxlength="40" value="${r.ca ?? ''}" placeholder="14 + mod. Destreza (máx. 2)"></div>
              <div class="field"><label class="field__label" for="wd-tarm">Tipo</label><select id="wd-tarm" class="select" name="r-tarm">${['Ligera', 'Media', 'Pesada', 'Escudo'].map((t) => html`<option ${r.tipoArmadura === t ? raw('selected') : ''}>${t}</option>`)}</select></div>
              <div class="field field--wide"><label class="field__label" for="wd-nota">Notas</label><input id="wd-nota" class="input" name="r-nota" maxlength="160" value="${r.nota ?? ''}"></div>
            </div>` : html`<div class="field"><label class="field__label" for="wd-nota">Qué hace</label><textarea id="wd-nota" class="textarea" rows="2" name="r-nota" maxlength="300">${r.nota ?? ''}</textarea></div>`}
            <fieldset class="choice-group"><legend>Ranuras para módulos</legend><div class="chips">
              ${MODULE_TYPES.map((t) => html`<label class="chip"><input type="checkbox" name="ranuras" value="${t.id}" ${d.ranuras.includes(t.id) ? raw('checked') : ''}>${t.nombre}</label>`)}</div></fieldset>`
          : html`<div class="form-grid form-grid--wide">
              <div class="field"><label class="field__label" for="wd-mt">Tipo de módulo (ranura)</label>
                <select id="wd-mt" class="select" name="tipo">${MODULE_TYPES.map((t) => html`<option value="${t.id}" ${d.tipo === t.id ? raw('selected') : ''}>${t.nombre}</option>`)}</select></div>
              <fieldset class="choice-group"><legend>Encaja en</legend><div class="chips">
                ${CATEGORIES.map((c) => html`<label class="chip"><input type="checkbox" name="categorias" value="${c.id}" ${d.categorias.includes(c.id) ? raw('checked') : ''}>${c.nombre}</label>`)}</div></fieldset>
            </div>
            <div class="field"><label class="field__label" for="wd-ef">Efecto</label><textarea id="wd-ef" class="textarea" rows="2" name="efecto" maxlength="300">${d.efecto}</textarea></div>
            <div class="form-grid">
              <div class="field"><label class="field__label" for="wd-atk">+ al ataque</label><input id="wd-atk" class="input input--num" type="number" min="0" max="3" name="ataque" value="${d.ataque ?? ''}"></div>
              <div class="field"><label class="field__label" for="wd-cam">+ a la CA</label><input id="wd-cam" class="input input--num" type="number" min="0" max="3" name="ca" value="${d.ca ?? ''}"></div>
              <div class="field"><label class="field__label" for="wd-dmg">Daño extra</label><input id="wd-dmg" class="input" name="dano" maxlength="30" value="${d.dano ?? ''}" placeholder="+1d4 fuego"></div>
            </div>`}
          <fieldset class="choice-group"><legend>Materiales y componentes</legend><div class="form-grid">
            ${MATERIALS.map((m) => html`<div class="field"><label class="field__label" for="wd-mat-${m.id}">${m.nombre} <span class="muted">(${m.precio} po)</span></label>
              <input id="wd-mat-${m.id}" class="input input--num" type="number" min="0" max="50" name="mat-${m.id}" value="${d.materiales[m.id] ?? ''}"></div>`)}
          </div><p class="field__hint">El oro que pagas al construir es el valor de la complejidad menos lo que valen estos materiales.</p></fieldset>
          <div class="field"><label class="field__label" for="wd-desc">Descripción</label><textarea id="wd-desc" class="textarea" rows="2" name="descripcion" maxlength="600">${d.descripcion}</textarea></div>
          <p class="field__error" role="alert">${error}</p>
          <div class="dialog__footer"><button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button><button type="submit" class="btn btn--primary">Guardar diseño</button></div>
        </form>`);
      };
      body.addEventListener('change', (e) => {
        if (e.target.name === 'kind') { read(); d.kind = e.target.value; draw(); }
        else if (e.target.matches('[data-wd-redraw]')) { read(); draw(); }
      });
      body.addEventListener('submit', (e) => {
        e.preventDefault();
        read();
        const res = saveDesign(ed.character, d);
        if (res.errors.length) { error = res.errors.join(' '); draw(); return; }
        close(res);
      });
      draw();
    },
  });
  if (result) ed.replace(result.character, { keepScroll: true, message: `Diseño guardado: ${result.design.nombre}.` });
}

// ── Acciones ─────────────────────────────────────────────────────────────

export const workshopActions = {
  'workshop-fill': (ed, el) => fillChoices(ed, el.dataset.class, 'taller'),
  'workshop-energy': (ed, el) => ed.replace(changeEnergy(ed.character, { delta: Number(el.dataset.delta) || 0, rest: el.dataset.rest || null, intMod: ed.sheet.scores.inteligencia.modifier }), { keepScroll: true }),
  'workshop-mat': (ed, el) => ed.replace(adjustMaterial(ed.character, el.dataset.id, Number(el.dataset.delta) || 0), { keepScroll: true }),
  'workshop-scavenge'(ed) {
    const roll = 1 + Math.floor(Math.random() * 4);
    const res = scavenge(ed.character, roll);
    if (res.errors.length) return toast(res.errors.join(' '), { type: 'warning' });
    ed.replace(res.character, { keepScroll: true, message: `Desguace: 1d4 = ${roll}. Encuentras ${res.found} de chatarra.` });
  },
  'workshop-build': (ed, el) => openBuild(ed, el.dataset.id),
  'workshop-design': (ed) => openDesign(ed),
  async 'workshop-design-del'(ed, el) {
    const ok = await confirmDialog({ title: 'Borrar diseño', message: 'El diseño desaparece del Taller. Lo que ya construiste con él se conserva.', confirmLabel: 'Borrar', danger: true });
    if (ok) ed.replace(removeDesign(ed.character, el.dataset.id), { keepScroll: true });
  },
  async 'workshop-dismantle'(ed, el) {
    const ok = await confirmDialog({ title: 'Desmontar', message: 'Recuperas la mitad de los materiales y el objeto se quita del equipo.', confirmLabel: 'Desmontar', danger: true });
    if (!ok) return;
    const res = dismantle(ed.character, el.dataset.id);
    if (res.errors.length) return toast(res.errors.join(' '), { type: 'error' });
    ed.replace(res.character, { keepScroll: true, message: 'Desmontado.' });
  },
};

export const workshopChanges = {
  equip(ed, el) {
    const res = setEquipped(ed.character, el.value, el.checked);
    if (res.errors.length) { el.checked = !el.checked; return toast(res.errors.join(' '), { type: 'warning' }); }
    ed.replace(res.character, { keepScroll: true });
  },
  filter(ed, el) {
    (ed.ui.workshop ??= { cat: '' }).cat = el.value;
    ed.rerender({ keepScroll: true, refocus: '[data-workshop-filter]' });
  },
};
