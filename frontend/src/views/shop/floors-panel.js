/**
 * Progresión por pisos (Lord 100).
 *
 *   renderFloorsAdmin(service, { toast, rerender })  pestaña «🏰 Pisos» del panel del Mundo (DM)
 *   openBusinesses(root, service)                    jugador: negocios del piso por estado
 */

import { h } from './dom.js';
import { STATES } from '../../domain/shop/floors.js';

const floorLabel = (f) => (f ? `Piso ${f}` : 'Sin piso (siempre)');

function businessRow(x, extra = null) {
    return h('li', { class: 'talk-favor floor-business' },
        h('div', {},
            h('b', {}, `${x.status.icon} ${x.shop?.icon ?? '🏪'} ${x.shop?.name ?? x.keeper.name}`),
            h('small', { class: 'muted' }, ` · ${x.keeper.portrait ?? ''} ${x.keeper.name} · 📍 ${x.location}${x.status.floor ? ` · piso ${x.status.floor}` : ''}`),
            x.status.special ? h('span', { class: 'tag' }, '⭐ Especial') : null,
            x.status.state === 'condicionado' || (x.status.requirement && x.status.requirement.done) ? h('p', { class: 'small' }, `${x.status.requirement.done ? '✅' : '🔒'} Requisito: ${x.status.requirement.text}`) : null,
            x.status.state === 'cerrado' || x.status.state === 'bloqueado' ? h('p', { class: 'small muted' }, x.status.reason) : null),
        extra);
}

/** Pestaña del DM. */
export function renderFloorsAdmin(service, { toast, rerender }) {
    const p = service.progress;
    const run = async (promise, ok) => {
        const res = await promise;
        if (res.error) toast(res.error, 'error');
        else if (ok) toast(typeof ok === 'function' ? ok(res) : ok, 'success');
        rerender();
    };
    const announce = (res) => {
        const r = res.result;
        const parts = [`Los jugadores llegaron al piso ${r.floor}.`];
        if (r.opened.length) parts.push(`Abren: ${r.opened.map((k) => k.name).join(', ')}.`);
        if (r.conditioned.length) parts.push(`Con requisito: ${r.conditioned.map((k) => k.name).join(', ')}.`);
        if (!r.opened.length && !r.conditioned.length) parts.push('No hay negocios nuevos definidos para ese piso.');
        return parts.join(' ');
    };

    const intro = h('p', { class: 'muted small admin-intro' },
        'Cada piso abre sus negocios: los de pisos superiores no existen todavía para los jugadores, y los anteriores siguen abiertos. ',
        'Asigna el piso en la ficha de cada comerciante (campo «Piso») o en su región. Un negocio puede pedir además un requisito (misión, reputación…) que marcas aquí cuando se cumpla.');

    const toggle = h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: p.enabled, onchange: (e) => run(service.setProgressEnabled(e.target.checked), e.target.checked ? 'Progresión por pisos activada.' : 'Progresión por pisos desactivada: todo está disponible.') }),
        ' Usar progresión por pisos en esta campaña');
    if (!p.enabled) return h('div', { class: 'floors-admin' }, intro, toggle);

    const floorInput = h('input', { type: 'number', class: 'qty-input', min: '1', max: '999', value: String(p.current), 'aria-label': 'Piso' });
    const header = h('div', { class: 'floors-head' },
        h('div', { class: 'floors-current' }, h('span', { class: 'muted small' }, 'Piso actual'), h('b', {}, `🏰 ${p.current}`)),
        h('button', { class: 'btn btn-primary', onclick: () => run(service.setFloor(p.current + 1), announce) }, `⬆️ Llegaron al piso ${p.current + 1}`),
        h('div', { class: 'talk-controls' }, floorInput, h('button', { class: 'btn btn-sm btn-ghost', onclick: () => run(service.setFloor(floorInput.value), announce) }, 'Ir a ese piso')),
        toggle);

    const b = service.businesses();
    const control = (x) => {
        const sel = h('select', { class: 'sort-select', 'aria-label': `Excepción para ${x.keeper.name}` },
            [['', 'Automático'], ['open', 'Forzar abierto'], ['closed', 'Forzar cerrado']].map(([v, t]) => h('option', { value: v, selected: (x.status.forced ?? '') === v }, t)));
        sel.addEventListener('change', () => run(service.setBusinessOverride(x.keeper.id, sel.value || null), 'Excepción guardada.'));
        const req = x.status.requirement
            ? h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: x.status.requirement.done, onchange: (e) => run(service.setRequirementDone(x.keeper.id, e.target.checked), e.target.checked ? `${x.keeper.name}: requisito cumplido.` : 'Requisito pendiente de nuevo.') }), ' Requisito cumplido')
            : null;
        return h('div', { class: 'talk-controls' }, req, sel);
    };
    const section = (title, list, empty) => h('fieldset', {}, h('legend', {}, `${title} (${list.length})`),
        list.length ? h('ul', { class: 'talk-list' }, list.map((x) => businessRow(x, control(x)))) : h('p', { class: 'small muted' }, empty));

    // Bloqueados agrupados por piso, para ver qué trae cada uno.
    const byFloor = new Map();
    for (const x of b.bloqueado) byFloor.set(x.status.floor, [...(byFloor.get(x.status.floor) ?? []), x]);
    const upcoming = h('fieldset', {}, h('legend', {}, `${STATES.bloqueado.icon} Pisos superiores (${b.bloqueado.length})`),
        byFloor.size
            ? [...byFloor.entries()].map(([f, list]) => h('details', {}, h('summary', {}, `${floorLabel(f)} · ${list.length} negocio${list.length === 1 ? '' : 's'}`), h('ul', { class: 'talk-list' }, list.map((x) => businessRow(x, control(x))))))
            : h('p', { class: 'small muted' }, 'No hay negocios definidos en pisos superiores.'));

    const log = p.log?.length ? h('details', { class: 'small' }, h('summary', {}, 'Historial de pisos'), h('ul', {}, p.log.slice(0, 15).map((l) => h('li', {}, `Día ${l.day}: piso ${l.from} → ${l.to}`)))) : null;

    return h('div', { class: 'floors-admin' }, intro, header,
        section(`${STATES.abierto.icon} Desbloqueados`, b.abierto, 'Ninguno.'),
        section(`${STATES.especial.icon} Especiales o temporales`, b.especial, 'Ninguno. Marca «Negocio especial» en la ficha del comerciante.'),
        section(`${STATES.condicionado.icon} En el piso, con requisito pendiente`, b.condicionado, 'Ninguno.'),
        upcoming,
        b.cerrado.length ? section(`${STATES.cerrado.icon} Cerrados`, b.cerrado, '') : null,
        log);
}

/** Panel del jugador: qué negocios hay disponibles en el piso. */
export function openBusinesses(root, service) {
    const p = service.progress;
    const b = service.businesses();
    const list = (title, items) => (items.length ? h('fieldset', {}, h('legend', {}, `${title} (${items.length})`), h('ul', { class: 'talk-list' }, items.map((x) => businessRow(x)))) : null);
    const dialog = h('dialog', { class: 'shop-dialog world-dialog', 'aria-label': 'Negocios del piso' },
        h('header', {}, h('h2', {}, `🏰 Negocios · piso ${p.current}`), h('button', { class: 'btn btn-icon', 'aria-label': 'Cerrar', onclick: () => dialog.close() }, '✕')),
        h('div', { class: 'world-dialog-body estate' },
            list(`${STATES.abierto.icon} Desbloqueados`, b.abierto),
            list(`${STATES.especial.icon} Especiales`, b.especial),
            list(`${STATES.condicionado.icon} Descubiertos, con requisito`, b.condicionado),
            b.hiddenCount ? h('p', { class: 'small muted' }, `⛔ Hay ${b.hiddenCount} negocio${b.hiddenCount === 1 ? '' : 's'} más en pisos superiores. Seguid subiendo…`) : null));
    dialog.addEventListener('close', () => dialog.remove());
    root.querySelector('.shop-root').append(dialog);
    dialog.showModal();
}
