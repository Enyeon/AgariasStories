/**
 * Pestaña «Gremio» (Lord 100): tablón de misiones, licencia de aventurero,
 * servicios y publicación de misiones PJ. El DM además cierra misiones y
 * concede o retira licencias.
 *
 * Sólo habla con el servicio (service.guild); todo el texto entra como
 * textContent (ver dom.js).
 */

import { h, replace, coins } from './dom.js';
import { formatCp, coinValues, displayCurrency } from '../../domain/money.js';

// Los importes se escriben en piezas de oro del sistema monetario activo (100 pc en D&D, 1000 en Lord 100).
const PO = () => coinValues(displayCurrency()).gp;
const STATUS = {
    abierta: ['Abierta', 'ok'],
    aceptada: ['En curso', 'info'],
    vencida: ['Vencida', 'warn'],
    completada: ['Completada', 'ok'],
    fallida: ['Fallida', 'bad'],
    cancelada: ['Retirada', 'muted'],
};

const SECTIONS = [
    ['tablon', '📋 Tablón'],
    ['licencia', '🪪 Licencia'],
    ['servicios', '🤝 Servicios'],
    ['publicar', '✍️ Publicar misión'],
];

/**
 * @param {HTMLElement} container
 * @param {{ service: object, shopId: string, ui: object, toast: Function, rerender: Function, root: HTMLElement }} opts
 */
export function renderGuild(container, { service, shopId, ui, toast, rerender, root }) {
    const view = service.guild.view(shopId);
    if (!view) return replace(container);
    ui.guildTab ??= 'tablon';
    const ranks = service.guild.ranks();
    const rankLabel = (id) => ranks.find((r) => r.id === id)?.label ?? 'Sin licencia';
    const kinds = service.guild.kinds();
    const kindOf = (id) => kinds.find((k) => k.id === id) ?? { icon: '📜', label: id };

    const run = async (promise, ok) => {
        const res = await promise;
        if (res.error) {
            toast(res.error, 'error');
            return null;
        }
        toast(res.message ?? ok ?? 'Hecho.', 'success');
        rerender();
        return res;
    };

    const header = h('div', { class: 'guild-head' },
        h('span', { class: 'guild-emblem', 'aria-hidden': 'true' }, view.prestige.icon),
        h('div', {},
            h('h3', {}, view.name),
            h('p', { class: 'small muted' }, `${view.profile.realm} · ${view.prestige.staff}. Encargos habituales: ${rankLabel(ranks[view.profile.rankMin].id)} a ${rankLabel(ranks[view.profile.rankMax].id)}. Comisión por publicar: ${Math.round(view.prestige.commission * 100)} %.`),
            h('details', { class: 'guild-norms' }, h('summary', {}, 'Normas de este Gremio'), h('ul', {}, view.norms.map((n) => h('li', {}, n))))),
        h('div', { class: 'guild-license-badge', title: 'Tu licencia y reputación' },
            h('b', {}, view.license.rank ? `🪪 ${view.license.rank}` : '🪪 —'),
            h('small', {}, view.license.reputation)));

    const sections = [...SECTIONS, ...(view.isDm ? [['dm', '👑 DM']] : [])];
    const nav = h('div', { class: 'chips guild-nav', role: 'tablist' }, sections.map(([id, label]) => h('button', {
        class: ['chip', ui.guildTab === id && 'active'], role: 'tab', 'aria-selected': String(ui.guildTab === id),
        onclick: () => { ui.guildTab = id; rerender(); },
    }, label)));

    const body = ui.guildTab === 'licencia' ? licenseSection()
        : ui.guildTab === 'servicios' ? servicesSection()
            : ui.guildTab === 'publicar' ? publishSection()
                : ui.guildTab === 'dm' && view.isDm ? dmSection()
                    : boardSection();

    replace(container, h('div', { class: 'guild' }, header,
        view.hasCharacter ? null : h('p', { class: 'callout small' }, view.isDm ? 'Entraste como DM: puedes cerrar misiones y gestionar licencias. Para aceptar o publicar misiones elige un personaje.' : 'Elige un personaje para usar el Gremio.'),
        nav, body));

    // ── Tablón ──
    function questCard(q) {
        const [label, tone] = STATUS[q.status] ?? [q.status, 'muted'];
        const k = kindOf(q.kind);
        const actions = [];
        if (q.claims.length) actions.push(h('button', { class: 'btn btn-sm btn-primary', onclick: () => run(service.guild.claim(q.id)) }, `Cobrar ${formatCp(q.claims.reduce((n, c) => n + c.amount, 0))}`));
        if (q.canTake) actions.push(h('button', { class: 'btn btn-sm btn-primary', disabled: !view.hasCharacter, onclick: () => run(service.guild.accept(shopId, q.id)) }, 'Aceptar'));
        if (q.taken && ['aceptada', 'abierta', 'vencida'].includes(q.status)) actions.push(h('button', { class: 'btn btn-sm btn-ghost', onclick: () => run(service.guild.abandon(q.id)) }, 'Abandonar'));
        if (q.canResolve) {
            actions.push(h('button', { class: 'btn btn-sm', onclick: () => run(service.guild.resolve(q.id, 'completada')) }, '✔ Completada'));
            actions.push(h('button', { class: 'btn btn-sm btn-ghost', onclick: () => run(service.guild.resolve(q.id, 'fallida')) }, '✘ Fallida'));
        }
        if (q.canCancel) actions.push(h('button', { class: 'btn btn-sm btn-ghost', onclick: () => run(service.guild.cancel(q.id)) }, 'Retirar'));
        return h('li', { class: ['guild-quest', `rank-${q.rank.toLowerCase()}`] },
            h('div', { class: 'guild-quest-rank', title: rankLabel(q.rank) }, q.rank),
            h('div', { class: 'guild-quest-main' },
                h('p', { class: 'guild-quest-title' }, h('b', {}, `${k.icon} ${q.title}`), ' ', h('span', { class: ['guild-status', tone] }, label)),
                h('p', { class: 'small' }, q.description),
                h('dl', { class: 'guild-quest-facts small' },
                    h('dt', {}, 'Recompensa'), h('dd', {}, coins(q.reward, { size: 'sm' }), q.rewardItems ? ` + ${q.rewardItems}` : '', q.maxTakers > 1 ? h('small', { class: 'muted' }, ` (a repartir entre ${q.takers.length || 'los'} aventureros)`) : null),
                    q.requirements ? [h('dt', {}, 'Requisitos'), h('dd', {}, q.requirements)] : null,
                    q.conditions ? [h('dt', {}, 'Condiciones'), h('dd', {}, q.conditions)] : null,
                    h('dt', {}, 'Plazas'), h('dd', {}, `${q.takers.length}/${q.maxTakers}${q.takers.length ? ` · ${q.takers.map((t) => t.name).join(', ')}` : ''}`),
                    h('dt', {}, 'Publica'), h('dd', {}, `${q.posterName ?? 'El Gremio'} · día ${q.postedDay}${q.deadlineDays ? ` · plazo hasta el día ${q.postedDay + q.deadlineDays}` : ''}`)),
                q.blockedBy ? h('p', { class: 'small warn' }, q.blockedBy) : null),
            h('div', { class: 'guild-quest-actions' }, actions));
    }

    function boardSection() {
        const filter = ui.guildFilter ?? 'all';
        const list = view.board.filter((q) => filter === 'all' || (filter === 'mine' ? q.mine || q.taken || q.claims.length : filter === 'available' ? q.canTake : true));
        const tools = h('div', { class: 'chips' }, [['all', 'Todas'], ['available', 'Puedo aceptar'], ['mine', 'Las mías']].map(([id, label]) =>
            h('button', { class: ['chip', filter === id && 'active'], onclick: () => { ui.guildFilter = id; rerender(); } }, label)));
        return h('section', { class: 'guild-section' }, tools,
            list.length ? h('ul', { class: 'guild-board' }, list.map(questCard))
                : h('p', { class: 'muted small' }, 'No hay misiones que mostrar. El tablón del Gremio se renueva cada semana.'));
    }

    // ── Licencia ──
    function licenseSection() {
        const l = view.license;
        const next = view.exams.find((e) => e.ok) ?? null;
        return h('section', { class: 'guild-section' },
            h('div', { class: 'guild-license' },
                h('p', {}, h('b', {}, l.rank ? `Licencia del Gremio: ${rankLabel(l.rank)}` : 'Sin licencia'), l.since ? h('small', { class: 'muted' }, ` · desde el día ${l.since}${l.floor ? `, piso ${l.floor}` : ''}`) : null),
                h('p', { class: 'small' }, `Reputación: ${l.reputation} (${l.points} puntos) · misiones completadas: ${l.completed}`),
                h('p', { class: 'small muted' }, 'Las misiones de rango F no piden licencia. Para las demás necesitas una licencia de su rango o superior. La primera evaluación puede ser de cualquier rango que permita tu nivel; después se asciende de uno en uno, con misiones completadas.')),
            h('table', { class: 'guild-ranks' },
                h('thead', {}, h('tr', {}, h('th', {}, 'Rango'), h('th', {}, 'Qué misiones'), h('th', {}, 'Nivel'), h('th', {}, 'Examen'))),
                h('tbody', {}, view.exams.map((e) => h('tr', { class: [l.rank === e.id && 'current'] },
                    h('td', {}, h('b', {}, e.id)),
                    h('td', { class: 'small' }, e.summary),
                    h('td', {}, String(e.minLevel)),
                    h('td', {}, e.ok
                        ? h('button', { class: 'btn btn-sm btn-primary', disabled: !view.hasCharacter, onclick: () => openExam(e.id) }, `Examinarse (${formatCp(e.fee)})`)
                        : h('small', { class: 'muted' }, l.rank === e.id ? 'Tu rango' : e.reason)))))),
            next ? null : h('p', { class: 'small muted' }, 'Ahora mismo no puedes examinarte de ningún rango.'));
    }

    function openExam(rankId) {
        const exam = service.guild.evaluation(rankId);
        if (!exam) return;
        const manual = service.state.prefs.rollMode === 'manual';
        const answers = exam.questions.map(() => null);
        let approach = 0;
        const rollInputs = manual ? [0, 1, 2].map((i) => h('input', { type: 'number', min: '1', max: '20', class: 'qty-input', placeholder: 'd20', 'aria-label': `Tirada ${i + 1}` })) : [];
        const out = h('div', { class: 'guild-exam-result', 'aria-live': 'polite' });
        const submit = h('button', { class: 'btn btn-primary' }, `Presentarse (${formatCp(exam.fee)})`);
        const dialog = h('dialog', { class: 'shop-dialog world-dialog', 'aria-label': `Examen de ${rankLabel(rankId)}` },
            h('header', {}, h('h2', {}, `🪪 Examen de ${rankLabel(rankId)}`), h('button', { class: 'btn btn-icon', 'aria-label': 'Cerrar', onclick: () => dialog.close() }, '✕')),
            h('div', { class: 'world-dialog-body guild-exam' },
                h('p', { class: 'small muted' }, `Apruebas con al menos 1 de 2 preguntas bien y 2 de 3 pruebas superadas (CD ${exam.dc}). Si suspendes, podrás repetirlo en una semana.`),
                exam.questions.map((q, qi) => h('fieldset', {}, h('legend', {}, `Pregunta ${qi + 1}`), h('p', {}, q.text),
                    q.options.map((o, oi) => h('label', { class: 'guild-option' }, h('input', { type: 'radio', name: `gq${qi}`, onchange: () => { answers[qi] = oi; } }), ` ${o}`)))),
                h('fieldset', {}, h('legend', {}, 'Pruebas'), h('ul', {}, exam.tests.map((t) => h('li', {}, `${t.skill} contra CD ${t.dc}`)))),
                h('fieldset', {}, h('legend', {}, 'Situación'), h('p', {}, exam.situation.text),
                    exam.situation.options.map((o, oi) => h('label', { class: 'guild-option' }, h('input', { type: 'radio', name: 'gs', checked: oi === 0, onchange: () => { approach = oi; } }), ` ${o.label} (${o.skill}, CD ${o.dc})`))),
                manual ? h('p', { class: 'small' }, '🎲 Tus tiradas de d20 (pruebas 1 y 2 y la situación): ', rollInputs) : null,
                h('div', { class: 'talk-controls' }, submit),
                out));
        submit.addEventListener('click', async () => {
            if (answers.some((a) => a === null)) return toast('Responde las dos preguntas.', 'error');
            const rolls = rollInputs.map((i) => Number(i.value)).map((n) => (Number.isInteger(n) && n >= 1 && n <= 20 ? n : undefined));
            if (manual && rolls.some((r) => r === undefined)) return toast('Escribe tus tres tiradas de d20.', 'error');
            submit.disabled = true;
            const res = await service.guild.takeEvaluation(shopId, rankId, { answers, approach, rolls });
            if (res.error) {
                submit.disabled = false;
                return toast(res.error, 'error');
            }
            replace(out,
                h('p', { class: res.result.passed ? 'ok' : 'warn' }, h('b', {}, res.message)),
                h('ul', { class: 'small' }, res.result.checks.map((c) => h('li', {}, c.text))),
                h('p', { class: 'small muted' }, `Preguntas correctas: ${res.result.correct}/2.`));
            toast(res.message, res.result.passed ? 'success' : 'info');
            rerender();
        });
        dialog.addEventListener('close', () => dialog.remove());
        (root.querySelector('.shop-root') ?? root).append(dialog);
        dialog.showModal();
    }

    // ── Servicios ──
    function servicesSection() {
        return h('section', { class: 'guild-section' },
            h('p', { class: 'small muted' }, 'Profesionales que buscan clientes en este Gremio esta semana. Se paga por adelantado; lo que hagan por ti lo narra el DM.'),
            h('ul', { class: 'guild-services' }, view.offers.map((o) => {
                const units = h('input', { type: 'number', min: '1', max: '30', value: '1', class: 'qty-input', 'aria-label': `Cantidad de ${o.unit}s` });
                return h('li', { class: 'guild-service' },
                    h('span', { class: 'guild-service-icon', 'aria-hidden': 'true' }, o.icon),
                    h('div', {}, h('b', {}, o.label), h('small', { class: 'muted' }, ` · ${o.npc} (${o.race}) · rango ${o.rank}`), h('p', { class: 'small' }, o.text)),
                    h('div', { class: 'talk-controls' }, coins(o.price, { size: 'sm' }), h('small', {}, `/${o.unit}`), units,
                        h('button', { class: 'btn btn-sm btn-primary', disabled: !view.hasCharacter, onclick: () => run(service.guild.hire(shopId, o.id, Number(units.value))) }, 'Contratar')));
            })),
            view.hires.length ? h('div', {}, h('h4', {}, 'Tus contrataciones en este piso'), h('ul', { class: 'small' }, view.hires.map((x) => h('li', {},
                `${x.npc} · ${x.label} · ${x.units} ${x.unit}${x.units === 1 ? '' : 's'} (${formatCp(x.total)}) · ${x.unit === 'día' ? `días ${x.start}–${x.until}` : `día ${x.start}`}`, x.active ? h('span', { class: 'guild-status ok' }, ' activo') : null)))) : null);
    }

    // ── Publicar ──
    function publishSection() {
        const draft = (ui.guildDraft ??= { title: '', kind: 'explorar', rank: 'F', reward: '', rewardItems: '', description: '', requirements: '', conditions: '', maxTakers: '1', deadlineDays: '' });
        const bind = (el, key) => { el.addEventListener('input', () => { draft[key] = el.value; update(); }); return el; };
        const field = (label, control) => h('label', { class: 'field' }, label, control);
        const input = (key, props = {}) => bind(h('input', { value: draft[key], ...props }), key);
        const area = (key, props = {}) => bind(h('textarea', { rows: '3', ...props }, draft[key]), key);
        const select = (key, options) => {
            const el = h('select', {}, options.map(([v, l]) => h('option', { value: v, selected: draft[key] === v }, l)));
            el.addEventListener('change', () => { draft[key] = el.value; update(); });
            return el;
        };
        const summary = h('p', { class: 'small' });
        const commission = view.prestige.commission;
        function update() {
            const reward = Math.round(Number(draft.reward || 0) * PO());
            const min = service.guild.minReward(draft.rank);
            const fee = Math.ceil(reward * commission);
            replace(summary, `Se te cobra ahora: ${formatCp(reward + fee)} (recompensa en depósito ${formatCp(reward)} + comisión ${formatCp(fee)}). Mínimo para ${rankLabel(draft.rank)}: ${formatCp(min)}.`);
        }
        update();
        const submit = async () => {
            const res = await run(service.guild.publish(shopId, { ...draft, reward: Math.round(Number(draft.reward || 0) * PO()) }));
            if (res) { ui.guildDraft = null; ui.guildTab = 'tablon'; rerender(); }
        };
        return h('section', { class: 'guild-section guild-publish' },
            h('p', { class: 'small muted' }, 'Tu misión aparece en el tablón de este piso. La recompensa queda en depósito en el Gremio: los aventureros la cobran aquí cuando la marques como completada. Si nadie la acepta (o vence), puedes retirarla y recuperar el depósito; la comisión no se devuelve.'),
            field('Título', input('title', { maxlength: '80', placeholder: 'Ej.: Escolta hasta la Pradera' })),
            h('div', { class: 'field-row' },
                field('Tipo', select('kind', kinds.map((k) => [k.id, `${k.icon} ${k.label}`]))),
                field('Rango (dificultad)', select('rank', ranks.map((r) => [r.id, `${r.id} · ${r.summary}`]))),
                field('Plazas', input('maxTakers', { type: 'number', min: '1', max: '6' })),
                field('Plazo (días, opcional)', input('deadlineDays', { type: 'number', min: '0', max: '90' }))),
            h('div', { class: 'field-row' },
                field('Recompensa (po)', input('reward', { type: 'number', min: '0', step: '0.01' })),
                field('Además (objetos, favores…)', input('rewardItems', { maxlength: '300', placeholder: 'Opcional: los entregas tú en persona' }))),
            field('Descripción', area('description', { maxlength: '1500', placeholder: 'Qué hay que hacer, dónde y por qué.' })),
            field('Requisitos', area('requirements', { maxlength: '400', rows: '2', placeholder: 'Ej.: alguien con Supervivencia; al menos dos aventureros.' })),
            field('Condiciones especiales', area('conditions', { maxlength: '400', rows: '2', placeholder: 'Ej.: sin matar a la criatura; entregar antes del anochecer.' })),
            summary,
            h('div', { class: 'talk-controls' }, h('button', { class: 'btn btn-primary', disabled: !view.hasCharacter, onclick: submit }, 'Publicar en el tablón')));
    }

    // ── DM ──
    function dmSection() {
        const holders = view.holders;
        const rankSelect = (charId, name, current) => {
            const el = h('select', { 'aria-label': `Rango de ${name}` }, [h('option', { value: '' }, 'Sin licencia'), ...ranks.map((r) => h('option', { value: r.id, selected: current === r.id }, r.label))]);
            el.addEventListener('change', () => run(service.guild.setRank(charId, el.value || null, name, view.floor)));
            return el;
        };
        const me = service.state.characterId && !holders.some((x) => x.charId === service.state.characterId)
            ? [{ charId: service.state.characterId, name: service.state.character?.identity?.name || 'Personaje', rank: null, reputation: '', completed: 0, points: 0 }] : [];
        return h('section', { class: 'guild-section' },
            h('p', { class: 'small muted' }, 'Como DM decides cuándo una misión del Gremio está cumplida (botones del tablón) y puedes conceder o retirar licencias sin examen. Aquí aparecen los aventureros que ya pasaron por algún Gremio.'),
            [...holders, ...me].length
                ? h('table', { class: 'guild-ranks' }, h('thead', {}, h('tr', {}, h('th', {}, 'Aventurero'), h('th', {}, 'Reputación'), h('th', {}, 'Rango'))),
                    h('tbody', {}, [...holders, ...me].map((x) => h('tr', {}, h('td', {}, x.name), h('td', { class: 'small' }, `${x.reputation} · ${x.completed} misiones`), h('td', {}, rankSelect(x.charId, x.name, x.rank))))))
                : h('p', { class: 'muted small' }, 'Todavía nadie se registró en el Gremio.'));
    }
}
