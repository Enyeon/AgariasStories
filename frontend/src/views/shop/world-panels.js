/**
 * Diálogos del mundo vivo: mapa (viajar), diario de rumores, comerciantes
 * conocidos y herramientas del DM (franjas, eventos, facciones, memoria).
 */

import { h, replace } from './dom.js';
import { formatCp } from '../../domain/money.js';

function dialogShell(root, title, ...content) {
    const dialog = h(
        'dialog',
        { class: 'shop-dialog world-dialog', 'aria-label': title },
        h('header', {}, h('h2', {}, title), h('button', { class: 'btn btn-icon', 'aria-label': 'Cerrar', onclick: () => dialog.close() }, '✕')),
        h('div', { class: 'world-dialog-body' }, content),
    );
    dialog.addEventListener('close', () => dialog.remove());
    root.querySelector('.shop-root').append(dialog);
    dialog.showModal();
    return dialog;
}

/** Mapa: regiones → ubicaciones. Viajar mueve al personaje (sólo ahí puede comerciar). */
export function openMap(root, service, { toast, onTravel }) {
    const body = h('div', { class: 'map' });
    const towerMode = service.mapFloors();
    const dialog = dialogShell(root, towerMode ? '🏰 Viajar por la Torre' : '🗺️ Mapa de la región', body);
    const go = async (loc) => {
        const res = await service.travel(loc.id);
        if (res.error) return toast(res.error, 'error');
        dialog.close();
        onTravel?.(loc);
    };

    // Viajar → Piso → Zona → negocios del lugar.
    let floorSel = towerMode?.hereFloor ?? towerMode?.floors.at(-1)?.floor ?? null;
    const renderTower = () => {
        const t = service.mapFloors();
        const groups = new Map();
        for (const f of t.floors) groups.set(f.group, [...(groups.get(f.group) ?? []), f]);
        const select = h('select', { class: 'sort-select floor-select', 'aria-label': 'Piso' },
            [...groups.entries()].map(([g, list]) => h('optgroup', { label: g || 'Pisos' }, list.map((f) => h('option', { value: String(f.floor), selected: f.floor === floorSel }, `Piso ${f.floor}${f.floor === t.hereFloor ? ' · 📍 estás aquí' : ''}`)))),
            t.other ? h('option', { value: 'otros', selected: floorSel === null }, 'Otros lugares (sin piso)') : null);
        select.addEventListener('change', () => { floorSel = select.value === 'otros' ? null : Number(select.value); renderTower(); });
        const regions = service.map({ floor: floorSel });
        const zones = regions.flatMap((r) => r.locations.map((l) => ({ ...l, region: r })));
        replace(body,
            h('div', { class: 'tower-head' },
                h('label', { class: 'small' }, '1. Piso ', select),
                h('small', { class: 'muted' }, `Alcanzado: piso ${t.current}. Los pisos superiores aún no existen para vosotros.`)),
            !service.freeTravel && !service.canControlTime ? h('p', { class: 'muted small' }, 'En esta campaña el DM decide los viajes entre pisos: puedes moverte libremente dentro del tuyo.') : null,
            regions[0] ? h('p', { class: 'muted small' }, `${regions[0].group ? `${regions[0].group} · ` : ''}2. Elige una zona:`) : null,
            zones.length
                ? h('div', { class: 'zone-grid' }, zones.map((z) => h('article', { class: ['zone-card', z.here && 'is-here'] },
                    h('header', {}, h('span', { class: 'map-icon', 'aria-hidden': 'true' }, z.icon), h('div', {}, h('h3', {}, z.name), h('p', { class: 'muted small' }, z.description))),
                    z.shops.length
                        ? h('ul', { class: 'zone-shops' }, z.shops.map((s) => h('li', { class: s.open ? '' : 'is-locked', title: s.reason ?? '' }, `${s.open ? s.icon : '🔒'} ${s.name}`, s.open ? null : h('small', { class: 'muted' }, ` — ${s.reason ?? 'cerrado ahora'}`))))
                        : h('p', { class: 'small muted' }, 'Aquí no comercia nadie.'),
                    h('button', { class: ['btn', 'btn-sm', z.here ? 'btn-ghost' : 'btn-primary'], disabled: z.here, onclick: () => go(z) }, z.here ? '📍 Estás aquí' : '3. Ir a esta zona'))))
                : h('p', { class: 'muted' }, 'No hay zonas visibles en este piso.'));
    };
    if (towerMode) {
        renderTower();
        return;
    }

    const render = () => {
        const here = service.here;
        const hereRegion = service.location?.regionId;
        replace(
            body,
            !service.freeTravel && !service.canControlTime ? h('p', { class: 'muted small' }, 'En esta campaña el DM decide los viajes entre regiones: puedes moverte libremente dentro de tu región.') : null,
            service.map().map((region) => h(
                'section',
                { class: ['map-region', region.id === hereRegion && 'is-here'] },
                h('header', {}, h('span', { class: 'map-icon', 'aria-hidden': 'true' }, region.icon), h('div', {}, h('h3', {}, region.name), h('p', { class: 'muted small' }, region.economy?.kind ? `Economía ${region.economy.kind.toLowerCase()} · ${region.description}` : region.description))),
                h('ul', { class: 'map-locations' }, region.locations.map((loc) => h(
                    'li',
                    {},
                    h(
                        'button',
                        {
                            class: ['map-location', loc.here && 'is-here'],
                            disabled: loc.here,
                            onclick: async () => {
                                const res = await service.travel(loc.id);
                                if (res.error) return toast(res.error, 'error');
                                dialog.close();
                                onTravel?.(loc);
                            },
                        },
                        h('span', { class: 'map-icon', 'aria-hidden': 'true' }, loc.icon),
                        h('span', {}, h('b', {}, loc.name), h('small', {}, loc.here ? '📍 Estás aquí' : loc.merchants ? `${loc.merchants} comerciante${loc.merchants === 1 ? '' : 's'} hoy` : 'Nadie comerciando hoy')),
                    ),
                ))),
            )),
            h('p', { class: 'muted small' }, here ? 'Algunos lugares sólo aparecen cuando alguien te habla de ellos.' : ''),
        );
    };
    render();
}

/** Diario de rumores del personaje. */
export function openJournal(root, service, { toast }) {
    const body = h('div', { class: 'journal' });
    dialogShell(root, '📔 Diario de rumores', body);
    const topics = { lugares: '🧭 Lugares', personas: '👤 Personas', peligros: '⚠️ Peligros', rutas: '🛤️ Rutas', eventos: '📰 Sucesos', facciones: '🏳️ Facciones' };
    const render = () => {
        const list = service.journal();
        replace(
            body,
            list.length
                ? h('ul', { class: 'journal-list' }, list.map((j) => h(
                    'li',
                    { class: 'journal-entry' },
                    h('header', {}, h('span', { class: 'journal-topic' }, topics[j.rumor.topic] ?? j.rumor.topic), h('small', { class: 'muted' }, `Día ${j.day}${j.from ? ` · te lo contó ${j.from}` : ''}${j.age === 'viejo' ? ' · noticia vieja' : j.age === 'reciente' ? ' · reciente' : ''}`)),
                    h('p', {}, `«${j.rumor.text}»`),
                    j.hint
                        ? h('p', { class: 'journal-hint' }, '🔎 ', j.hint)
                        : h('button', {
                            class: 'btn btn-sm btn-ghost',
                            disabled: j.checked,
                            title: j.checked ? 'Ya le diste vueltas' : 'Perspicacia (CD 13): ¿es cierto?',
                            onclick: async () => {
                                const roll = service.state.prefs.rollMode === 'manual' ? Number(window.prompt('Tu tirada de d20 (Perspicacia):')) : undefined;
                                const res = await service.verifyRumor(j.rumorId, roll);
                                if (res.error) return toast(res.error, 'error');
                                toast(`${res.result.text}. ${res.result.hint}`, res.result.roll.success ? 'success' : 'info');
                                render();
                            },
                        }, j.checked ? 'No sabrías decir' : '🤔 ¿Será cierto?'),
                )))
                : h('div', { class: 'empty' }, h('span', { 'aria-hidden': 'true' }, '📔'), h('p', {}, 'Aún no has oído ningún rumor. Pregunta a los comerciantes: los que confían en ti cuentan más.')),
        );
    };
    render();
}

/** Comerciantes conocidos: dónde están hoy y cómo te tratan. */
export function openKnown(root, service, { onGo, contracts = false }) {
    const hired = new Map(service.contracts().map((c) => [c.keeperId, c.contract]));
    const known = service.knownMerchants().filter((m) => !contracts || hired.has(m.keeper.id));
    const balance = (id) => {
        const c = hired.get(id);
        if (!c) return null;
        return h('small', { class: c.balance >= 0 ? 'tone-good' : 'tone-bad' }, c.balance >= 0 ? ` · te debe ${formatCp(c.balance)}` : ` · le debes ${formatCp(-c.balance)}`);
    };
    dialogShell(
        root,
        contracts ? '📜 Tus empleados' : '👥 Comerciantes conocidos',
        known.length
            ? h('ul', { class: 'known-list' }, known.map((m) => h(
                'li',
                { class: 'known-merchant' },
                h('span', { class: 'map-icon', 'aria-hidden': 'true' }, m.keeper.portrait),
                h('div', {}, h('b', {}, m.keeper.name), h('small', { class: 'muted' }, ` · ${m.keeper.title}`),
                    h('p', { class: 'small' }, m.location ? `📍 ${m.location.name}` : '🐪 ', m.status.reason ? ` · ${m.status.reason}` : m.status.open ? ' · atiende ahora' : '', balance(m.keeper.id))),
                h('span', { class: 'tier-badge', style: { '--tier': m.tier.color }, title: 'Vuestra relación' }, m.tier.icon, ' ', m.tier.label),
                m.location ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => onGo(m) }, 'Ir') : null,
            )))
            : h('div', { class: 'empty' }, h('p', {}, 'Todavía no has tratado con nadie.')),
    );
}

/** Herramientas del DM: tiempo, eventos, viajes, facciones y memoria de los comerciantes. */
export function openDmTools(root, service, { toast, keeperId }) {
    const ctx = service.ctx;
    const body = h('div', { class: 'dm-tools' });
    dialogShell(root, '🎲 Herramientas del DM', body);
    const run = async (action, params, ok) => {
        const res = await service.dm(action, params);
        if (res.error) return toast(res.error, 'error');
        if (ok) toast(ok, 'success');
        render();
    };
    const render = () => {
        const active = service.activeEvents();
        const eventSelect = h('select', { class: 'sort-select', 'aria-label': 'Evento' }, [...ctx.events.values()].map((e) => h('option', { value: e.id }, `${e.icon} ${e.name}${e.regions?.length ? ` (${e.regions.map((r) => ctx.regions.get(r)?.name ?? r).join(', ')})` : ''}`)));
        const days = h('input', { type: 'number', min: '1', max: '60', value: '5', class: 'qty-input', 'aria-label': 'Días' });
        const standing = service.standing();
        const keeper = keeperId ? ctx.keepers.get(keeperId) : null;
        const memSelect = h('select', { class: 'sort-select', 'aria-label': 'Suceso' }, service.memoryTypes().map((m) => h('option', { value: m.id }, `${m.icon} ${m.label}`)));
        const memNote = h('input', { class: 'qty-input wide', placeholder: 'Nota (opcional)', maxlength: '140', 'aria-label': 'Nota' });
        const charName = service.state.character?.identity?.name || 'este personaje';
        replace(
            body,
            h('fieldset', {}, h('legend', {}, '⏳ Tiempo'),
                h('p', { class: 'small' }, `Día ${service.clock.day} · ${service.clock.weekday} · ${service.clock.phase.icon} ${service.clock.phase.label}`),
                h('div', { class: 'talk-controls' },
                    h('button', { class: 'btn btn-sm', onclick: async () => {
                        const res = await service.advancePhase();
                        if (res.error) return toast(res.error, 'error');
                        render();
                    } }, 'Siguiente franja'))),
            h('fieldset', {}, h('legend', {}, '📰 Eventos del mundo'),
                active.length ? h('ul', { class: 'talk-list' }, active.map((e) => h('li', { class: 'talk-favor' }, h('div', {}, h('b', {}, `${e.def.icon} ${e.def.name}`), h('small', { class: 'muted' }, ` · hasta el día ${e.end}`)), h('button', { class: 'btn btn-sm btn-ghost', onclick: () => run('endEvent', { eventId: e.id }, `Terminó: ${e.def.name}.`) }, 'Terminar')))) : h('p', { class: 'muted small' }, 'Ningún evento activo.'),
                h('div', { class: 'talk-controls' }, eventSelect, days, h('button', { class: 'btn btn-sm btn-primary', onclick: () => run('triggerEvent', { eventId: eventSelect.value, days: Number(days.value) || 5 }, 'Evento lanzado.') }, 'Lanzar'))),
            h('fieldset', {}, h('legend', {}, '🧭 Viajes'),
                h('label', { class: 'radio' }, h('input', { type: 'checkbox', checked: service.freeTravel, onchange: (e) => run('freeTravel', { value: e.target.checked }) }), 'Los jugadores pueden viajar libremente entre regiones')),
            h('fieldset', {}, h('legend', {}, `🏳️ Reputación de ${charName} con las facciones`),
                h('ul', { class: 'standing-list' }, [...ctx.factions.values()].map((f) => {
                    const input = h('input', { type: 'range', min: '-100', max: '100', step: '5', value: String(standing[f.id] ?? 0), 'aria-label': f.name });
                    const out = h('output', {}, String(standing[f.id] ?? 0));
                    input.addEventListener('input', () => { out.textContent = input.value; });
                    input.addEventListener('change', () => run('standing', { factionId: f.id, value: Number(input.value) }));
                    return h('li', {}, h('span', {}, `${f.icon} ${f.name}`), input, out);
                }))),
            keeper
                ? h('fieldset', {}, h('legend', {}, `🧠 Lo que ${keeper.short ?? keeper.name} recuerda de ${charName}`),
                    h('p', { class: 'muted small' }, 'Registra algo que pasó en la partida (le salvó la vida a su hermano, le insultó en público…). Cambia su trato.'),
                    h('div', { class: 'talk-controls' }, memSelect, memNote, h('button', { class: 'btn btn-sm btn-primary', onclick: () => run('remember', { keeperId, type: memSelect.value, note: memNote.value }, 'Anotado en su memoria.') }, 'Registrar')))
                : null,
        );
    };
    render();
}
