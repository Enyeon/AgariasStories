/**
 * Propiedades, negocio, empleados e informes de exploración.
 *
 *   openEstate(root, service, { toast })   jugador: terrenos, negocio, caja, empleados, tablón, informes
 *   openReportsInbox(root, service, …)     DM: confirma o cambia lo que encontraron los exploradores
 *
 * Todo lo que mueve dinero u objetos pasa por service.estate(), que guarda
 * mercado y ficha juntos (si la ficha falla, se deshace el mercado).
 */

import { h, replace } from './dom.js';
import { formatCp } from '../../domain/money.js';
import { popularityLabel, entrepreneurStage } from '../../domain/shop/popularity.js';
import { PERIODS } from '../../domain/shop/staff.js';

const PO = 100; // los precios se escriben en piezas de oro

function dialogShell(root, title, ...content) {
    const dialog = h(
        'dialog',
        { class: 'shop-dialog world-dialog estate-dialog', 'aria-label': title },
        h('header', {}, h('h2', {}, title), h('button', { class: 'btn btn-icon', 'aria-label': 'Cerrar', onclick: () => dialog.close() }, '✕')),
        h('div', { class: 'world-dialog-body' }, content),
    );
    dialog.addEventListener('close', () => dialog.remove());
    root.querySelector('.shop-root').append(dialog);
    dialog.showModal();
    return dialog;
}

const num = (attrs = {}) => h('input', { type: 'number', class: 'qty-input', ...attrs });
const select = (label, options, value) => h('select', { class: 'sort-select', 'aria-label': label }, options.map(([v, text]) => h('option', { value: v, selected: String(v) === String(value ?? '') }, text)));
const poToCp = (v) => Math.round(Number(v) * PO);

/** Botón que pide una segunda pulsación antes de algo difícil de deshacer. */
function confirmButton(label, confirmLabel, onConfirm, cls = 'btn btn-sm btn-ghost') {
    let armed = false;
    const btn = h('button', { class: cls, onclick: () => {
        if (!armed) {
            armed = true;
            btn.textContent = confirmLabel;
            return;
        }
        onConfirm();
    } }, label);
    return btn;
}

const OUTCOMES = { exito: '✅ Éxito', fracaso: '❌ Fracaso', descubrimiento: '🌟 Descubrimiento' };

export function openEstate(root, service, { toast }) {
    const body = h('div', { class: 'estate' });
    dialogShell(root, '🏠 Propiedades y negocios', body);
    const ctx = () => service.ctx;

    const run = async (action, params, ok) => {
        const res = await service.estate(action, params);
        if (res.error) {
            toast(res.error, 'error');
            return false;
        }
        toast(res.result?.text ?? ok ?? 'Hecho.', 'success');
        render();
        return true;
    };

    const stageCard = () => {
        const st = entrepreneurStage(service.state.world, service.state.characterId);
        return h('div', { class: 'estate-stage' },
            h('span', { class: 'estate-stage-icon', 'aria-hidden': 'true' }, st.icon),
            h('div', {}, h('b', {}, st.label), h('small', { class: 'muted' }, ` · ${st.sold} invento${st.sold === 1 ? '' : 's'} vendido${st.sold === 1 ? '' : 's'} · fama aquí: ${service.renown.label}`),
                st.next ? h('p', { class: 'small muted' }, `Siguiente: ${st.next.icon} ${st.next.label}. ${st.hint}`) : h('p', { class: 'small muted' }, st.hint)));
    };

    const plotsSection = () => {
        const plots = service.plotsHere();
        return h('fieldset', {}, h('legend', {}, `🏞️ Terrenos en ${service.location?.name ?? 'este lugar'}`),
            plots.length
                ? h('ul', { class: 'talk-list' }, plots.map(({ plot, prop, mine, free, value }) => h('li', { class: 'talk-favor' },
                    h('div', {}, h('b', {}, plot.name), h('small', { class: 'muted' }, ` · ${plot.size} · ${formatCp(value)}`),
                        h('p', { class: 'small' }, plot.description),
                        prop?.buildings?.length ? h('p', { class: 'small muted' }, `Ya construido: ${prop.buildings.map((b) => ctx().estate.buildings.get(b)?.label ?? b).join(', ')}`) : null),
                    mine ? h('span', { class: 'chip' }, 'Tuyo') : free
                        ? h('button', { class: 'btn btn-sm', onclick: () => run('buy', { plotId: plot.id }) }, `Comprar (${formatCp(value)})`)
                        : h('span', { class: 'chip muted' }, 'Tiene dueño'))))
                : h('p', { class: 'muted small' }, 'Aquí no hay terrenos en venta. Prueba en otro lugar.'));
    };

    const businessBlock = (p) => {
        const biz = p.prop.business;
        const fx = p.effects;
        const id = p.plot.id;
        if (!biz) {
            if (!fx.business) return h('p', { class: 'small muted' }, 'Construye un 🏪 Local comercial para abrir un negocio.');
            const name = h('input', { class: 'qty-input wide', placeholder: 'Nombre del negocio', maxlength: '60', 'aria-label': 'Nombre del negocio' });
            return h('div', { class: 'talk-controls' }, name, h('button', { class: 'btn btn-sm btn-primary', disabled: !p.here, title: p.here ? '' : 'Tienes que estar allí', onclick: () => run('open', { plotId: id, name: name.value }) }, 'Abrir negocio'));
        }
        const available = Math.max(0, biz.cash - p.reserved);
        const cashAmount = num({ min: '0', step: '0.01', placeholder: 'Todo (po)', 'aria-label': 'Cantidad a retirar (po)' });
        const sellers = p.staff.filter((s) => s.role === 'vendedor');
        const stockRows = Object.entries(biz.stock).map(([itemId, s]) => {
            const item = ctx().item(itemId);
            const price = num({ min: '0.01', step: '0.01', value: String(s.price / PO), 'aria-label': `Precio de ${item?.name} (po)` });
            price.addEventListener('change', () => run('price', { plotId: id, itemId, price: poToCp(price.value) }, 'Precio actualizado.'));
            const pop = service.popularity(itemId);
            return h('tr', {},
                h('td', {}, item?.name ?? itemId, h('small', { class: 'muted' }, ` ${pop.label}`)),
                h('td', {}, String(s.qty)),
                h('td', {}, price, ' po'),
                h('td', {}, h('button', { class: 'btn btn-sm btn-ghost', disabled: !p.here, onclick: () => run('withdrawStock', { plotId: id, itemId }) }, 'Recoger')));
        });
        const stockable = service.stockable();
        const pick = select('Producto', [['', 'Elige qué poner a la venta…'], ...stockable.map(({ item, units }) => [item.id, `${item.name} (tienes ${units})`])]);
        const qty = num({ min: '1', value: '1', 'aria-label': 'Cantidad' });
        const depPrice = num({ min: '0.01', step: '0.01', placeholder: 'Precio po (auto)', 'aria-label': 'Precio (po)' });
        const promo = num({ min: '1', step: '1', value: '5', 'aria-label': 'Inversión en promoción (po)' });
        return h('div', { class: 'estate-business' },
            h('p', {}, h('b', {}, `🏪 ${biz.name}`), h('small', { class: 'muted' }, ` · ${popularityLabel(biz.popularity)} (${Math.round(biz.popularity)}) · ventas ayer: ${formatCp(biz.lastRevenue ?? 0)} · mantenimiento ${formatCp(fx.upkeep)}/día`)),
            sellers.length ? null : h('p', { class: 'small callout' }, 'Sin vendedor asignado el negocio no vende. Contrata uno en el tablón de empleo.'),
            h('div', { class: 'estate-cash' },
                h('span', {}, '💰 Caja: ', h('b', {}, formatCp(biz.cash)), p.reserved ? h('small', { class: 'muted' }, ` (${formatCp(p.reserved)} reservados para salarios)`) : null),
                h('div', { class: 'talk-controls' }, cashAmount,
                    h('button', { class: 'btn btn-sm', disabled: !p.here || !available, title: p.here ? 'Las ganancias se retiran en persona' : 'Tienes que estar allí para retirar', onclick: () => run('withdrawCash', { plotId: id, amount: cashAmount.value === '' ? null : poToCp(cashAmount.value) }) }, `Retirar (hasta ${formatCp(available)})`))),
            h('table', { class: 'estate-stock' },
                h('thead', {}, h('tr', {}, h('th', {}, 'Producto'), h('th', {}, 'Uds.'), h('th', {}, 'Precio'), h('th', {}, ''))),
                h('tbody', {}, stockRows.length ? stockRows : h('tr', {}, h('td', { colspan: '4', class: 'muted small' }, `Vacío · caben ${fx.slots} productos distintos.`)))),
            p.here ? h('div', { class: 'talk-controls' }, pick, qty, depPrice,
                h('button', { class: 'btn btn-sm', onclick: () => {
                    if (!pick.value) return toast('Elige un producto.', 'error');
                    run('deposit', { plotId: id, itemId: pick.value, qty: qty.value, price: depPrice.value === '' ? null : poToCp(depPrice.value) });
                } }, 'Poner a la venta')) : h('p', { class: 'small muted' }, 'Para reponer o recoger mercancía tienes que estar allí. Los precios se cambian desde cualquier lugar.'),
            h('div', { class: 'talk-controls' }, promo, ' po ',
                h('button', { class: 'btn btn-sm btn-ghost', disabled: !p.here, title: 'Pregoneros y muestras: sube la fama del negocio y de lo que vende', onclick: () => run('promote', { plotId: id, amount: poToCp(promo.value) }) }, '📣 Promocionar')),
            biz.log?.length ? h('details', {}, h('summary', { class: 'small' }, 'Libro de cuentas'), h('ul', { class: 'small' }, biz.log.slice(0, 8).map((l) => h('li', {}, `Día ${l.day}: ${l.text}`)))) : null);
    };

    const propertiesSection = () => {
        const props = service.myProperties();
        if (!props.length) return null;
        return h('fieldset', {}, h('legend', {}, '🏠 Tus propiedades'),
            props.map((p) => {
                const built = p.prop.buildings ?? [];
                const options = service.buildings().filter((b) => !built.includes(b.id));
                const pick = select('Mejora', options.map((b) => [b.id, `${b.icon} ${b.label} · ${formatCp(b.cost)} · ${b.days} días${(b.requires ?? []).some((r) => !built.includes(r)) ? ' (requiere otra mejora)' : ''}`]));
                return h('section', { class: 'estate-property' },
                    h('header', {}, h('h3', {}, p.plot.name), h('small', { class: 'muted' }, `${p.location?.icon ?? '📍'} ${p.location?.name ?? ''} · vale ${formatCp(p.value)}${p.here ? ' · 📍 estás aquí' : ''}`)),
                    h('p', { class: 'small' }, built.length ? built.map((b) => { const def = ctx().estate.buildings.get(b); return `${def?.icon ?? ''} ${def?.label ?? b}`; }).join(' · ') : 'Terreno sin construir.'),
                    p.prop.works
                        ? h('p', { class: 'small' }, `🏗️ Obra en curso: ${ctx().estate.buildings.get(p.prop.works.buildingId)?.label} · termina el día ${p.prop.works.ends}.`)
                        : options.length && p.here ? h('div', { class: 'talk-controls' }, pick, h('button', { class: 'btn btn-sm', onclick: () => run('build', { plotId: p.plot.id, buildingId: pick.value }) }, 'Construir')) : null,
                    businessBlock(p),
                    p.staff.length ? h('p', { class: 'small muted' }, `Trabajan aquí: ${p.staff.map((s) => s.name).join(', ')}`) : null,
                    p.here ? confirmButton(`Vender la propiedad (${formatCp(Math.round(p.value * 0.8))})`, '¿Seguro? Pulsa otra vez para vender', () => run('sell', { plotId: p.plot.id })) : null);
            }));
    };

    const staffSection = () => {
        const list = service.myStaff();
        if (!list.length) return null;
        const roles = new Map(service.staffRoles().map((r) => [r.id, r]));
        const props = service.myProperties();
        const map = service.map();
        return h('fieldset', {}, h('legend', {}, '👷 Tus empleados'),
            h('ul', { class: 'talk-list' }, list.map((e) => {
                const role = roles.get(e.role);
                const assign = select('Destino', [['', 'Sin destino'], ...props.map((p) => [p.plot.id, p.plot.name])], e.assignment);
                assign.addEventListener('change', () => run('assign', { staffId: e.id, plotId: assign.value || null }, 'Destino cambiado.'));
                const wage = num({ min: '0.01', step: '0.01', value: String(e.wage / PO), 'aria-label': 'Salario diario (po)' });
                const period = select('Pago', Object.entries(PERIODS), e.period);
                const share = num({ min: '0', max: '50', step: '1', value: String(Math.round(e.share * 100)), 'aria-label': '% de las ventas' });
                const days = num({ min: '0', step: '1', placeholder: 'Indef.', value: e.until ? String(Math.max(0, e.until - service.clock.day)) : '', 'aria-label': 'Días de contrato (vacío = indefinido)' });
                const terms = h('details', {}, h('summary', { class: 'small' }, 'Condiciones'),
                    h('div', { class: 'talk-controls' },
                        h('label', { class: 'small' }, 'Salario/día ', wage, ' po'),
                        h('label', { class: 'small' }, 'Pago ', period),
                        h('label', { class: 'small' }, 'Parte de ventas ', share, ' %'),
                        h('label', { class: 'small' }, 'Días restantes ', days),
                        h('button', { class: 'btn btn-sm', onclick: () => run('terms', { staffId: e.id, wage: poToCp(wage.value), period: period.value, share: Number(share.value) / 100, days: days.value === '' ? null : Number(days.value) }, 'Condiciones actualizadas.') }, 'Guardar')));
                let explore = null;
                if (e.role === 'explorador' && !e.task) {
                    const target = select('Destino', map.flatMap((r) => [[r.id, `${r.icon} ${r.name} (toda la región)`], ...r.locations.map((l) => [l.id, `  · ${l.name}`])]));
                    const eDays = num({ min: '1', max: '30', value: '3', 'aria-label': 'Días' });
                    const goal = h('input', { class: 'qty-input wide', maxlength: '300', placeholder: 'Objetivo: qué buscar (el DM lo verá)', 'aria-label': 'Objetivo' });
                    explore = h('details', {}, h('summary', { class: 'small' }, '🧭 Enviar a explorar'),
                        h('div', { class: 'talk-controls' }, target, eDays, ' días', goal,
                            h('button', { class: 'btn btn-sm', onclick: () => run('explore', { staffId: e.id, target: target.value, days: eDays.value, objective: goal.value }) }, 'Enviar')));
                }
                return h('li', { class: 'talk-favor estate-employee' },
                    h('div', {},
                        h('b', {}, `${role?.icon ?? '👤'} ${e.name}`),
                        h('small', { class: 'muted' }, ` · ${role?.label ?? e.role} · habilidad ${Math.round(e.skill * 100)} % · ${formatCp(e.wage)}/día (${PERIODS[e.period].toLowerCase()})${e.share ? ` · ${Math.round(e.share * 100)} % de ventas` : ''}${e.until ? ` · hasta el día ${e.until}` : ''}`),
                        h('p', { class: 'small' }, `Ánimo ${Math.round(e.satisfaction)}/100${e.owed ? ` · ⚠️ se le deben ${formatCp(e.owed)}` : ''}${e.earned ? ` · ha ganado ${formatCp(e.earned)} en comisiones` : ''}${e.sickUntil >= service.clock.day ? ' · 🤒 enfermo' : ''}${e.task ? ` · 🧭 explorando hasta el día ${e.task.ends}` : ''}`),
                        e.log?.[0] ? h('p', { class: 'small muted' }, `Día ${e.log[0].day}: ${e.log[0].text}`) : null,
                        e.task ? null : h('div', { class: 'talk-controls' }, assign),
                        terms, explore),
                    h('div', { class: 'talk-controls' },
                        e.owed ? h('button', { class: 'btn btn-sm', onclick: () => run('payStaff', { staffId: e.id }, 'Deuda saldada.') }, `Pagar ${formatCp(e.owed)}`) : null,
                        confirmButton('Despedir', '¿Seguro?', () => run('dismiss', { staffId: e.id }, 'Despedido.'))));
            })),
            h('p', { class: 'small muted' }, 'Los salarios salen de la caja del negocio donde trabajan; si no alcanza, quedan como deuda que pagas en persona. Con el ánimo por debajo de 15, renuncian.'));
    };

    const boardSection = () => {
        const cands = service.jobBoard();
        const props = service.myProperties();
        return h('fieldset', {}, h('legend', {}, `📋 Tablón de empleo · ${service.location?.name ?? ''}`),
            cands.length
                ? h('ul', { class: 'talk-list' }, cands.map((c) => {
                    const period = select('Pago', Object.entries(PERIODS), 'dia');
                    const assign = select('Destino', [['', 'Sin destino'], ...props.map((p) => [p.plot.id, p.plot.name])]);
                    const role = service.staffRoles().find((r) => r.id === c.role);
                    return h('li', { class: 'talk-favor' },
                        h('div', {}, h('b', {}, `${c.icon ?? '👤'} ${c.name}`), h('small', { class: 'muted' }, ` · ${c.roleLabel} · habilidad ${Math.round(c.skill * 100)} % · pide ${formatCp(c.wage)}/día`),
                            role?.description ? h('p', { class: 'small muted' }, role.description) : null),
                        h('div', { class: 'talk-controls' }, period, assign,
                            h('button', { class: 'btn btn-sm', onclick: () => run('hire', { candidateKey: c.key, period: period.value, assignment: assign.value || null }) }, 'Contratar')));
                }))
                : h('p', { class: 'muted small' }, 'Nadie busca trabajo aquí esta semana.'),
            h('p', { class: 'small muted' }, 'Los candidatos cambian cada semana. Puedes ajustar sueldo, forma de pago, comisiones y duración después de contratar.'));
    };

    const reportsSection = () => {
        const list = service.myReports();
        if (!list.length) return null;
        return h('fieldset', {}, h('legend', {}, '🧭 Informes de exploración'),
            h('ul', { class: 'talk-list' }, list.slice(0, 10).map((r) => h('li', { class: 'talk-favor' },
                h('div', {},
                    h('b', {}, `${r.staffName} · ${ctx().regions.get(r.target)?.name ?? ctx().location(r.target)?.name ?? r.target}`),
                    h('small', { class: 'muted' }, ` · día ${r.day}`),
                    r.status === 'pendiente'
                        ? h('p', { class: 'small muted' }, '⏳ El DM está revisando lo que encontró.')
                        : h('div', {},
                            h('p', { class: 'small' }, `${OUTCOMES[r.final.outcome] ?? ''} — ${r.final.text}`),
                            r.final.revealed ? h('p', { class: 'small' }, `📍 Nuevo lugar en tu mapa: ${ctx().location(r.final.revealed)?.name ?? r.final.revealed}`) : null,
                            r.final.rumor ? h('p', { class: 'small' }, '📔 Trajo un rumor: está en tu diario.') : null))))));
    };

    const render = () => {
        if (!service.state.characterId) return replace(body, h('p', { class: 'muted' }, 'Elige un personaje.'));
        replace(body, stageCard(), plotsSection(), propertiesSection(), staffSection(), boardSection(), reportsSection());
    };
    render();
}

/** Bandeja del DM: informes de exploración pendientes de confirmar. */
export function openReportsInbox(root, service, { toast }) {
    const body = h('div', { class: 'estate' });
    dialogShell(root, '📨 Informes de exploradores', body);
    const ctx = service.ctx;
    const render = () => {
        const list = service.pendingReports();
        replace(body, list.length
            ? list.map((r) => {
                const regionId = ctx.regions.get(r.target) ? r.target : ctx.location(r.target)?.regionId;
                const region = ctx.regions.get(regionId);
                const outcome = select('Resultado', Object.entries(OUTCOMES), r.outcome);
                const text = h('textarea', { class: 'qty-input wide', rows: '3', maxlength: '2000', 'aria-label': 'Lo que cuenta al volver' }, r.proposal);
                const hiddenLocs = (region?.locations ?? []).filter((l) => l.hidden);
                const reveal = select('Revelar lugar', [['', 'No revelar ningún lugar'], ...hiddenLocs.map((l) => [l.id, `${r.suggestions?.locations?.includes(l.id) ? '★ ' : ''}${l.name}`])], r.outcome === 'descubrimiento' ? r.suggestions?.locations?.[0] : '');
                const rumors = [...ctx.rumors.values()].filter((x) => x.region === regionId);
                const rumor = select('Rumor', [['', 'Sin rumor'], ...rumors.map((x) => [x.id, `${r.suggestions?.rumors?.includes(x.id) ? '★ ' : ''}${x.text.slice(0, 70)}`])], r.outcome !== 'fracaso' ? r.suggestions?.rumors?.[0] : '');
                return h('section', { class: 'estate-property' },
                    h('header', {}, h('h3', {}, `🧭 ${r.staffName} → ${region?.name ?? ''}${ctx.location(r.target) ? ` · ${ctx.location(r.target).name}` : ''}`),
                        h('small', { class: 'muted' }, `Volvió el día ${r.day} · tirada ${r.roll.d20} → ${r.roll.total} contra CD ${r.roll.dc}${r.hurt ? ' · vuelve herido' : ''}`)),
                    r.objective ? h('p', { class: 'small' }, `Objetivo: «${r.objective}»`) : null,
                    h('div', { class: 'talk-controls' }, outcome, reveal, rumor),
                    text,
                    h('p', { class: 'small muted' }, '★ = sugerencia del sistema. El jugador sólo verá el resultado cuando lo confirmes.'),
                    h('button', { class: 'btn btn-sm btn-primary', onclick: async () => {
                        const res = await service.resolveReport(r.id, { outcome: outcome.value, text: text.value, revealLocation: reveal.value || null, rumorId: rumor.value || null });
                        if (res.error) return toast(res.error, 'error');
                        toast('Informe confirmado: el jugador ya puede verlo.', 'success');
                        render();
                    } }, 'Confirmar y enviar al jugador'));
            })
            : h('p', { class: 'muted' }, 'No hay informes pendientes.'));
    };
    render();
}
