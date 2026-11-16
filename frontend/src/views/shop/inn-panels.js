/**
 * Pestañas de tienda con funciones propias:
 *   renderLodging   🛏️ Hospedaje (tabernas y posadas)
 *   renderServices  🤝 Servicios (templo, escriba, carpintero, lutier…)
 *   renderExchange  💱 Cambio y banco (cambistas)
 * y la sección de muebles del diálogo de Propiedades (furnitureSection).
 *
 * Sólo hablan con el servicio; todo el texto entra como textContent (dom.js).
 */

import { h, replace, coins } from './dom.js';
import { formatCp, coinValues, displayCurrency, COIN_SHORT, formatBag } from '../../domain/money.js';

const PO = () => coinValues(displayCurrency()).gp;
const UNIT = { día: ['día', 'días'], encargo: ['encargo', 'encargos'], nivel: ['nivel de conjuro', 'niveles de conjuro'] };
const unitLabel = (unit, n) => (UNIT[unit] ?? [unit, `${unit}s`])[n === 1 ? 0 : 1];

function runner(toast, rerender) {
    return async (promise) => {
        const res = await promise;
        if (res.error) {
            toast(res.error, 'error');
            return null;
        }
        toast(res.message ?? 'Hecho.', 'success');
        rerender();
        return res;
    };
}

// ── Hospedaje ──────────────────────────────────────────────────────────────

export function renderLodging(container, { service, shopId, ui, toast, rerender }) {
    const inn = service.lodging.inn(shopId);
    if (!inn) return replace(container);
    const run = runner(toast, rerender);
    const stay = service.lodging.stay();
    const day = service.state.world.day;
    const hasChar = Boolean(service.state.character);
    ui.lodging ??= { room: inn.rooms[0]?.id, days: 1, advance: true };
    if (!inn.rooms.some((r) => r.id === ui.lodging.room)) ui.lodging.room = inn.rooms[0]?.id;

    const stayCard = stay ? (() => {
        const here = stay.shopId === shopId;
        const room = inn.rooms.find((r) => r.id === stay.room);
        const renewDays = h('input', { type: 'number', class: 'qty-input', min: '1', max: String(inn.maxDays), value: '1', 'aria-label': 'Días a renovar' });
        return h('div', { class: ['callout', 'inn-stay', stay.expired && 'warn'] },
            h('p', {}, h('b', {}, stay.expired ? '⌛ Tu estancia terminó' : `🛏️ Tienes habitación ${stay.label.toLowerCase()}`),
                ` en ${service.ctx.shop(stay.shopId)?.name ?? 'otra posada'}.`),
            h('p', { class: 'small' }, stay.expired
                ? `Pagaste hasta el día ${stay.until} y hoy es el día ${day}. Renueva o deja la habitación${stay.furniture.length ? ' (tus muebles siguen dentro)' : ''}.`
                : `Te quedan ${stay.daysLeft} día(s): pagada hasta el día ${stay.until} (hoy es el día ${day}). ${formatCp(stay.price)}/día.`),
            here && room
                ? h('div', { class: 'talk-controls' }, renewDays,
                    h('button', { class: 'btn btn-sm btn-primary', disabled: !hasChar, onclick: () => run(service.lodging.rent(shopId, stay.room, Number(renewDays.value), { advance: false })) }, 'Renovar'),
                    h('button', { class: 'btn btn-sm btn-ghost', onclick: leave }, 'Dejar la habitación'))
                : h('div', { class: 'talk-controls' }, h('button', { class: 'btn btn-sm btn-ghost', onclick: leave }, 'Dejar la habitación')),
            stay.furniture.length ? h('p', { class: 'small muted' }, `Muebles en la habitación: ${stay.furniture.map((id) => service.ctx.item(id)?.name ?? id).join(', ')}.`) : null);
    })() : null;

    // Dejar la habitación: primero se enseña qué se devuelve, después se confirma.
    function leave() {
        ui.lodging.leaving = true;
        ui.lodging.confirm = false;
        rerender();
    }
    const leaveBox = () => {
        if (!stay || !ui.lodging.leaving) return null;
        const unused = Math.max(0, stay.until - day);
        const refund = Math.floor(unused * stay.price * (stay.refund ?? 0));
        const msg = unused
            ? (refund ? `Te devolverán ${formatCp(refund)} por ${unused} día(s) sin usar.` : `Los ${unused} día(s) sin usar no se devuelven (regla de la posada).`)
            : 'No quedan días por usar.';
        return h('div', { class: 'callout inn-confirm', role: 'alertdialog', 'aria-label': 'Dejar la habitación' },
            h('p', {}, h('b', {}, '¿Dejar la habitación? '), msg, stay.furniture.length ? ' Tus muebles vuelven al inventario.' : ''),
            h('div', { class: 'talk-controls' },
                h('button', { class: 'btn btn-sm btn-primary', onclick: async () => { ui.lodging.leaving = false; await run(service.lodging.leave()); } }, 'Sí, dejarla'),
                h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { ui.lodging.leaving = false; rerender(); } }, 'Cancelar')));
    };

    const selected = inn.rooms.find((r) => r.id === ui.lodging.room) ?? inn.rooms[0];
    const days = h('input', { type: 'number', class: 'qty-input', min: '1', max: String(inn.maxDays), value: String(ui.lodging.days), 'aria-label': 'Días' });
    const total = h('p', { class: 'inn-total', 'aria-live': 'polite' });
    const updateTotal = () => {
        const n = Math.min(inn.maxDays, Math.max(1, Math.trunc(Number(days.value)) || 1));
        ui.lodging.days = n;
        replace(total, `${n} día(s) × `, coins(selected.price, { size: 'sm' }), ' = ', h('b', {}, formatCp(selected.price * n)),
            h('small', { class: 'muted' }, ` · del día ${day} al ${day + n - 1}`));
    };
    days.addEventListener('input', updateTotal);
    updateTotal();
    const canTime = service.canControlTime;
    const advance = h('input', { type: 'checkbox', checked: ui.lodging.advance, onchange: (e) => { ui.lodging.advance = e.target.checked; } });
    const blocked = stay && !(stay.shopId === shopId && stay.room === selected.id) && !stay.expired;

    // Antes de pagar se enseña el resumen: habitación, comodidades, días y total.
    const confirmBox = () => {
        if (!ui.lodging.confirm) return null;
        const n = ui.lodging.days;
        return h('div', { class: 'callout inn-confirm', role: 'alertdialog', 'aria-label': 'Confirmar el alojamiento' },
            h('p', {}, h('b', {}, `${selected.icon} Habitación ${selected.label} · ${service.ctx.shop(shopId)?.name ?? ''}`)),
            h('ul', { class: 'small' }, selected.comforts.map((c) => h('li', {}, c))),
            h('p', {}, `${n} día(s) × ${formatCp(selected.price)} = `, h('b', {}, formatCp(selected.price * n)), h('small', { class: 'muted' }, ` · días ${day}–${day + n - 1}. ${inn.rule}`)),
            canTime && ui.lodging.advance ? h('p', { class: 'small' }, `Al confirmar pasarán ${n} día(s) en el calendario.`) : null,
            h('div', { class: 'talk-controls' },
                h('button', { class: 'btn btn-sm btn-primary', onclick: async () => { ui.lodging.confirm = false; await run(service.lodging.rent(shopId, selected.id, n, { advance: canTime && ui.lodging.advance })); } }, `Pagar ${formatCp(selected.price * n)}`),
                h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { ui.lodging.confirm = false; rerender(); } }, 'Cancelar')));
    };
    const confirmRent = () => { ui.lodging.confirm = true; ui.lodging.leaving = false; rerender(); };

    replace(container, h('div', { class: 'inn' },
        h('div', { class: 'inn-head' }, h('span', { class: 'guild-emblem', 'aria-hidden': 'true' }, inn.icon),
            h('div', {}, h('h3', {}, `${inn.label} · ${service.ctx.shop(shopId)?.name ?? ''}`),
                h('p', { class: 'small muted' }, `${inn.rule}${inn.floor ? ` · Precios del piso ${inn.floor}.` : ''} Hoy es el día ${day}.`))),
        stayCard,
        leaveBox(),
        h('ul', { class: 'inn-rooms', role: 'radiogroup', 'aria-label': 'Habitaciones' }, inn.rooms.map((r) => h('li', {},
            h('label', { class: ['inn-room', r.id === selected.id && 'active'] },
                h('input', { type: 'radio', name: 'inn-room', checked: r.id === selected.id, onchange: () => { ui.lodging.room = r.id; rerender(); } }),
                h('span', { class: 'inn-room-icon', 'aria-hidden': 'true' }, r.icon),
                h('span', { class: 'inn-room-body' }, h('b', {}, r.label), h('small', {}, r.description),
                    h('ul', { class: 'inn-comforts' }, r.comforts.map((c) => h('li', {}, c))),
                    h('small', { class: 'muted' }, r.slots ? `Sitio para ${r.slots} mueble(s) tuyo(s).` : 'Sin sitio para muebles propios.')),
                h('span', { class: 'inn-room-price' }, coins(r.price, { size: 'sm' }), h('small', {}, '/día')))))),
        h('div', { class: 'inn-book' },
            h('label', { class: 'small' }, 'Días ', days),
            total,
            canTime ? h('label', { class: 'check small' }, advance, ' Pasar estos días ahora (el calendario avanza solo)') : h('p', { class: 'small muted' }, 'Los días de tu estancia se descuentan solos a medida que el DM avanza el calendario de la campaña.'),
            h('button', { class: 'btn btn-primary', disabled: !hasChar || blocked, title: blocked ? 'Ya tienes otra habitación: déjala antes.' : '', onclick: confirmRent },
                stay && stay.shopId === shopId && stay.room === selected.id ? 'Renovar esta habitación' : 'Alquilar…'),
            confirmBox())));
}

// ── Servicios ──────────────────────────────────────────────────────────────

export function renderServices(container, { service, shopId, toast, rerender }) {
    const list = service.shopServices.of(shopId);
    const run = runner(toast, rerender);
    const log = service.shopServices.log().filter((x) => x.shopId === shopId).slice(0, 8);
    replace(container, h('div', { class: 'guild-section' },
        h('p', { class: 'small muted' }, 'Trabajos que hace por ti: se pagan por adelantado y el DM narra el resultado.'),
        h('ul', { class: 'guild-services' }, list.map((s) => {
            const units = h('input', { type: 'number', min: '1', max: s.unit === 'nivel' ? '9' : '30', value: '1', class: 'qty-input', 'aria-label': `Cantidad (${unitLabel(s.unit, 2)})` });
            return h('li', { class: 'guild-service' },
                h('span', { class: 'guild-service-icon', 'aria-hidden': 'true' }, s.icon),
                h('div', {}, h('b', {}, s.label), h('p', { class: 'small' }, s.text)),
                h('div', { class: 'talk-controls' }, coins(s.price, { size: 'sm' }), h('small', {}, `/${unitLabel(s.unit, 1)}`), units,
                    h('button', { class: 'btn btn-sm btn-primary', disabled: !service.state.character, onclick: () => run(service.shopServices.hire(shopId, s.id, Number(units.value))) }, 'Contratar')));
        })),
        log.length ? h('div', {}, h('h4', {}, 'Tus encargos aquí'), h('ul', { class: 'small' }, log.map((x) => h('li', {}, `Día ${x.day} · ${x.label} · ${x.units} ${unitLabel(x.unit, x.units)} (${formatCp(x.total)})`)))) : null));
}

// ── Cambio y banco ─────────────────────────────────────────────────────────

export function renderExchange(container, { service, shopId, toast, rerender }) {
    const run = runner(toast, rerender);
    const character = service.state.character;
    const bank = service.bank.balance();
    const denoms = ['pp', 'gp', 'sp', 'cp'];
    const sel = (value) => h('select', { class: 'sort-select' }, denoms.map((k) => h('option', { value: k, selected: k === value }, COIN_SHORT[k])));
    const from = sel('pp');
    const to = sel('gp');
    const count = h('input', { type: 'number', class: 'qty-input', min: '1', value: '1', 'aria-label': 'Monedas a cambiar' });
    const preview = h('p', { class: 'small', 'aria-live': 'polite' });
    const update = () => {
        const q = service.bank.quote({ from: from.value, to: to.value, count: Number(count.value) });
        replace(preview, q.error ? h('span', { class: 'muted' }, q.error) : `Recibes ${q.got} ${COIN_SHORT[q.to]}${q.rest ? ` + ${formatCp(q.rest)}` : ''} · comisión ${formatCp(q.fee)}.`);
    };
    [from, to, count].forEach((el) => el.addEventListener('input', update));
    update();
    const amount = h('input', { type: 'number', class: 'qty-input', min: '0', step: '0.01', placeholder: 'po', 'aria-label': 'Cantidad (po)' });
    const toCp = () => (amount.value === '' ? null : Math.round(Number(amount.value) * PO()));
    replace(container, h('div', { class: 'guild-section' },
        h('fieldset', {}, h('legend', {}, '💱 Cambiar monedas'),
            h('p', { class: 'small muted' }, `Tus monedas: ${character ? formatBag(character.equipment.coins) : '—'}. Comisión del 2 %.`),
            h('div', { class: 'talk-controls' }, count, from, h('span', {}, '→'), to,
                h('button', { class: 'btn btn-sm btn-primary', disabled: !character, onclick: () => run(service.bank.exchange(shopId, { from: from.value, to: to.value, count: Number(count.value) })) }, 'Cambiar')),
            preview),
        h('fieldset', {}, h('legend', {}, '🏦 Depósito'),
            h('p', {}, 'Saldo en el banco: ', h('b', {}, formatCp(bank.balance)), h('small', { class: 'muted' }, ' · se retira en cualquier cambista de esta campaña. Sin intereses.')),
            h('div', { class: 'talk-controls' }, amount, h('small', {}, 'po'),
                h('button', { class: 'btn btn-sm', disabled: !character, onclick: () => (toCp() ? run(service.bank.deposit(shopId, toCp())) : toast('Indica cuánto depositas.', 'error')) }, 'Depositar'),
                h('button', { class: 'btn btn-sm btn-ghost', disabled: !character || !bank.balance, onclick: () => run(service.bank.withdraw(shopId, toCp())) }, amount.value === '' ? 'Retirar todo' : 'Retirar')),
            bank.log.length ? h('ul', { class: 'small muted' }, bank.log.slice(0, 5).map((x) => h('li', {}, `Día ${x.day}: ${x.amount > 0 ? 'depósito' : 'retirada'} de ${formatCp(Math.abs(x.amount))}`))) : null)));
}

// ── Muebles (en el diálogo de Propiedades) ─────────────────────────────────

export function furnitureSection(service, { toast, onChange }) {
    const run = runner(toast, onChange);
    const spaces = service.furniture.spaces();
    const list = service.furniture.list();
    return h('fieldset', {}, h('legend', {}, '🪑 Muebles y decoración'),
        h('p', { class: 'small muted' }, 'Los muebles se compran en carpinterías, mueblerías y mercados. Guárdalos en el inventario o colócalos en tu habitación alquilada o en una propiedad con 🏠 Vivienda. Funcional = tiene un uso (descansar, estudiar…); decorativo = adorna.'),
        spaces.length
            ? h('ul', { class: 'talk-list' }, spaces.map((sp) => h('li', { class: 'talk-favor' },
                h('div', {}, h('b', {}, `${sp.icon} ${sp.label}`), h('small', { class: 'muted' }, ` · ${sp.used}/${sp.capacity} huecos`),
                    h('p', { class: 'small muted' }, sp.note),
                    sp.items.length ? h('ul', { class: 'small' }, sp.items.map((id) => h('li', {}, service.ctx.item(id)?.name ?? id, ' ',
                        h('button', { class: 'link', onclick: () => run(service.furniture.remove(id, sp.id)) }, 'recoger')))) : null))))
            : h('p', { class: 'small muted' }, 'Todavía no tienes dónde colocar muebles: alquila una habitación (en una posada) o construye una 🏠 Vivienda en un terreno tuyo.'),
        list.length
            ? h('table', { class: 'guild-ranks' }, h('thead', {}, h('tr', {}, h('th', {}, 'Mueble'), h('th', {}, 'Tipo'), h('th', {}, 'Estado'), h('th', {}, ''))),
                h('tbody', {}, list.map(({ item, stored, placedIn }) => {
                    const target = h('select', { class: 'sort-select', 'aria-label': `Dónde colocar ${item.name}` }, spaces.map((sp) => h('option', { value: sp.id }, sp.label)));
                    return h('tr', {},
                        h('td', {}, item.name, h('small', { class: 'muted' }, ` · ocupa ${item.furniture.size}`)),
                        h('td', { class: 'small' }, item.furniture.kind === 'funcional' ? `Funcional: ${item.furniture.effect}` : `Decorativo${item.furniture.effect && item.furniture.effect !== 'Decorativo.' ? `: ${item.furniture.effect}` : ''}`),
                        h('td', { class: 'small' }, [stored ? `${stored} guardado(s) en el inventario` : null, placedIn.length ? `colocado en ${placedIn.join(', ')}` : null].filter(Boolean).join(' · ')),
                        h('td', {}, stored && spaces.length ? h('div', { class: 'talk-controls' }, target, h('button', { class: 'btn btn-sm', onclick: () => run(service.furniture.place(item.id, target.value)) }, 'Colocar')) : null));
                })))
            : h('p', { class: 'small muted' }, 'No tienes muebles.'));
}
