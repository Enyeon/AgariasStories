/**
 * Diálogo de negociación: conversación con el vendedor.
 *
 * Muestra el ánimo (cara), la paciencia (velas), el historial de la charla y
 * las opciones del jugador: ofertas (con deslizador y atajos), tácticas con su
 * habilidad y riesgo, aceptar o irse. Si se cierra sin terminar, la
 * negociación queda guardada y se puede retomar ese mismo día.
 */

import { formatCp } from '../../domain/money.js';
import { getRarity, itemIcon } from '../../domain/shop/catalog.js';
import { h, replace, coins } from './dom.js';

export async function openNegotiation({ service, shopId, itemId, side, qty = 1, onToast, onBuy, onSell }) {
    const { ctx } = service;
    const started = await service.startNegotiation(shopId, itemId, side, qty);
    if (started.error) {
        onToast?.(started.error, 'error');
        return;
    }
    let session = started.session;
    const keeper = ctx.keepers.get(session.keeperId);
    const item = ctx.item(itemId);
    const rarity = getRarity(item.rarity);
    const step = service.negotiationStep(session.id);
    const buy = side === 'buy';

    let offer = suggestedOffer();
    let pendingTactic = null; // táctica esperando la tirada manual o el tema
    let busy = false;

    const logList = h('ol', { class: 'neg-log', 'aria-live': 'polite' });
    const keeperCol = h('div', { class: 'neg-keeper', style: { '--accent': keeper.accent } });
    const controls = h('div', { class: 'neg-controls' });
    const dialog = h(
        'dialog',
        { class: 'shop-dialog negotiation', 'aria-label': `Negociación con ${keeper.name}` },
        h(
            'header',
            { class: 'neg-header', style: { '--rarity': rarity.color } },
            h('span', { class: 'neg-item-icon', 'aria-hidden': 'true' }, itemIcon(item)),
            h('div', {}, h('small', {}, buy ? 'Regateando la compra de' : 'Regateando la venta de'), h('h2', {}, `${item.name}${session.qty > 1 ? ` × ${session.qty}` : ''}`)),
            h('button', { class: 'btn btn-icon', 'aria-label': 'Cerrar (la negociación queda en pausa)', title: 'Cerrar: podrás retomarla hoy', onclick: () => dialog.close() }, '✕'),
        ),
        h('div', { class: 'neg-body' }, keeperCol, h('div', { class: 'neg-talk' }, logList), controls),
    );
    dialog.addEventListener('close', () => dialog.remove());
    document.querySelector('.shop-root')?.append(dialog);
    dialog.showModal();

    /** Propuesta inicial del deslizador: un 15 % menos al principio; luego, acercarse un tercio. */
    function suggestedOffer() {
        if (session.lastOffer === null) return snap(buy ? session.ask * 0.85 : session.ask * 1.15);
        const next = session.lastOffer + (session.ask - session.lastOffer) * 0.35;
        const snapped = snap(next);
        return snapped === session.lastOffer ? snap(session.lastOffer + (buy ? step : -step)) : snapped;
    }
    function snap(v) {
        return Math.max(1, Math.round(v / step) * step);
    }
    function bounds() {
        return buy
            ? { min: snap(session.list * 0.45), max: session.ask }
            : { min: session.ask, max: snap(session.list * 1.8) };
    }

    function renderKeeperCol() {
        const mood = session.moodInfo;
        const candles = Array.from({ length: session.maxPatience }, (_, i) => h('span', { class: ['candle', i < session.patience ? 'lit' : 'out'], 'aria-hidden': 'true' }));
        const rel = service.relation(keeper.id);
        replace(
            keeperCol,
            h('div', { class: ['neg-portrait', `mood-${mood.id}`] }, h('span', { class: 'neg-portrait-icon', 'aria-hidden': 'true' }, keeper.portrait), h('span', { class: 'neg-face', title: mood.label }, mood.face)),
            h('b', { class: 'neg-name' }, keeper.name),
            h('p', { class: 'neg-mood' }, 'Ánimo: ', h('b', {}, mood.label)),
            h('div', { class: 'neg-patience', role: 'img', 'aria-label': `Paciencia: ${Math.max(0, session.patience)} de ${session.maxPatience}` }, h('small', {}, 'Paciencia'), h('div', { class: 'candles' }, candles)),
            rel.known.traits.length || rel.known.likes.length
                ? h(
                    'ul',
                    { class: 'neg-known' },
                    rel.known.likes.map((id) => h('li', {}, '💚 ', ctx.topics.get(id)?.label ?? id)),
                    rel.known.dislikes.map((id) => h('li', {}, '💢 ', ctx.topics.get(id)?.label ?? id)),
                    rel.known.traits.map((t) => h('li', {}, '👁️ ', t)),
                )
                : null,
        );
    }

    function renderLog() {
        replace(
            logList,
            session.log.map((entry) =>
                h(
                    'li',
                    { class: ['msg', `msg-${entry.who}`, entry.tone && `tone-${entry.tone}`] },
                    entry.who === 'keeper' ? h('span', { class: 'msg-avatar', 'aria-hidden': 'true' }, keeper.portrait) : null,
                    entry.roll ? h('span', { class: ['die', entry.roll.crit && `crit-${entry.roll.crit}`], 'aria-hidden': 'true' }, String(entry.roll.d20)) : null,
                    h('p', {}, entry.text),
                ),
            ),
        );
        logList.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }

    function priceRow(label, amount, extra) {
        return h('div', { class: 'neg-price' }, h('small', {}, label), coins(amount), extra ?? null);
    }

    function renderControls() {
        if (session.status === 'deal') return renderDeal();
        if (session.status === 'failed' || session.status === 'left') return renderEnd();

        const { min, max } = bounds();
        offer = Math.min(max, Math.max(min, offer));
        const out = h('output', { class: 'offer-value' }, coins(offer, { size: 'lg' }));
        const setOffer = (v) => {
            offer = Math.min(max, Math.max(min, snap(v)));
            slider.value = String(offer);
            replace(out, coins(offer, { size: 'lg' }));
            const holding = session.lastOffer !== null && (buy ? offer <= session.lastOffer : offer >= session.lastOffer);
            offerBtn.textContent = offer === session.ask
                ? `Aceptar ${formatCp(offer)}`
                : holding
                    ? `Mantenerte en ${formatCp(offer)}`
                    : buy ? `Ofrecer ${formatCp(offer)}` : `Pedir ${formatCp(offer)}`;
            holdNote.hidden = !holding || offer === session.ask;
        };
        const holdNote = h('p', { class: 'hold-note', hidden: true }, 'No mejoras tu oferta anterior: mantenerte firme le gasta paciencia.');
        const slider = h('input', { type: 'range', class: 'offer-slider', min: String(min), max: String(max), step: String(step), value: String(offer), 'aria-label': buy ? 'Tu oferta por unidad' : 'Lo que pides por unidad', oninput: (e) => setOffer(Number(e.target.value)) });
        const offerBtn = h('button', { class: 'btn btn-primary', disabled: busy || session.status === 'final', onclick: () => run({ type: 'offer', amount: offer }) }, '');
        const shortcut = (label, value) => h('button', { class: 'chip', type: 'button', onclick: () => setOffer(value) }, label);
        const halfway = session.lastOffer ? snap((session.lastOffer + session.ask) / 2) : null;

        const final = session.status === 'final';
        const est = session.revealed?.estimate;
        const prices = h(
            'div',
            { class: 'neg-prices' },
            priceRow(buy ? 'Pide' : 'Te ofrece', session.ask, session.ask !== session.list ? h('s', { class: 'muted small' }, formatCp(session.list)) : null),
            session.lastOffer ? priceRow(buy ? 'Tu última oferta' : 'Tu último pedido', session.lastOffer) : null,
            est ? h('div', { class: 'neg-price insight' }, h('small', {}, '👁️ Tu intuición'), h('span', {}, `${formatCp(est[0])} – ${formatCp(est[1])}`)) : null,
        );

        const tactics = service.tactics(session.id);
        const tacticGrid = h(
            'div',
            { class: 'tactics', role: 'group', 'aria-label': 'Tácticas' },
            tactics.map((t) =>
                h(
                    'button',
                    {
                        class: ['tactic', t.risky && 'risky', pendingTactic?.id === t.id && 'active'],
                        disabled: busy || Boolean(t.disabled),
                        title: t.disabled ?? t.hint,
                        onclick: () => chooseTactic(t),
                    },
                    h('span', { class: 'tactic-icon', 'aria-hidden': 'true' }, t.icon),
                    h('span', { class: 'tactic-label' }, t.label),
                    h('small', {}, t.skillLabel ? `${t.skillLabel} ${t.modifier >= 0 ? '+' : ''}${t.modifier}` : t.free ? 'Gratis' : 'Sin tirada', t.risky ? ' · arriesgado' : ''),
                ),
            ),
        );

        replace(
            controls,
            prices,
            final
                ? h('p', { class: 'final-note' }, '🕯️ Se le acabó la paciencia: es su última oferta. Acéptala o vete.')
                : h(
                    'div',
                    { class: 'offer-box' },
                    h('div', { class: 'offer-head' }, h('small', {}, buy ? 'Tu oferta por unidad' : 'Lo que pides por unidad'), out),
                    slider,
                    h(
                        'div',
                        { class: 'chips' },
                        shortcut(buy ? '−5 %' : '+5 %', buy ? session.ask * 0.95 : session.ask * 1.05),
                        shortcut(buy ? '−10 %' : '+10 %', buy ? session.ask * 0.9 : session.ask * 1.1),
                        shortcut(buy ? '−20 %' : '+20 %', buy ? session.ask * 0.8 : session.ask * 1.2),
                        halfway && halfway !== session.ask ? shortcut('A mitad de camino', halfway) : null,
                    ),
                    offerBtn,
                    holdNote,
                ),
            final ? null : pendingPanel(),
            final ? null : h('details', { class: 'tactics-wrap', open: true }, h('summary', {}, 'Tácticas'), tacticGrid),
            h(
                'div',
                { class: 'neg-footer' },
                h('button', { class: 'btn btn-accept', disabled: busy, onclick: () => run({ type: 'accept' }) }, `Aceptar ${formatCp(session.ask)}`),
                h('button', { class: 'btn btn-ghost', disabled: busy, onclick: () => run({ type: 'leave' }) }, 'Irse'),
            ),
        );
        setOffer(offer);
    }

    function pendingPanel() {
        if (!pendingTactic) return null;
        const t = pendingTactic;
        if (t.id === 'chat' && !t.topic) {
            return h(
                'div',
                { class: 'pending' },
                h('p', {}, '¿De qué le hablas?'),
                h(
                    'div',
                    { class: 'topics' },
                    (t.topics ?? []).map((topic) =>
                        h('button', { class: ['chip', topic.known && `known-${topic.known}`], onclick: () => { pendingTactic = { ...t, topic: topic.id }; maybeRoll(); } }, h('span', { 'aria-hidden': 'true' }, topic.icon), topic.label, topic.known === 'like' ? ' 💚' : topic.known === 'dislike' ? ' 💢' : ''),
                    ),
                ),
                h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { pendingTactic = null; renderControls(); } }, 'Cancelar'),
            );
        }
        // Tirada manual
        const input = h('input', { type: 'number', min: '1', max: '20', class: 'roll-input', 'aria-label': 'Resultado del d20', placeholder: 'd20' });
        return h(
            'form',
            {
                class: 'pending',
                onsubmit: (e) => {
                    e.preventDefault();
                    const roll = Math.trunc(Number(input.value));
                    if (!(roll >= 1 && roll <= 20)) {
                        input.setCustomValidity('Escribe un número del 1 al 20');
                        input.reportValidity();
                        return;
                    }
                    const action = { type: 'tactic', id: t.id, topic: t.topic, roll };
                    pendingTactic = null;
                    run(action);
                },
            },
            h('p', {}, `🎲 Tira 1d20 para ${t.skillLabel} (${t.modifier >= 0 ? '+' : ''}${t.modifier}) y escribe el resultado del dado:`),
            h('div', { class: 'roll-row' }, input, h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, 'Confirmar'), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { pendingTactic = null; renderControls(); } }, 'Cancelar')),
        );
    }

    function chooseTactic(t) {
        if (t.id === 'chat') {
            pendingTactic = { ...t };
            renderControls();
            return;
        }
        pendingTactic = { ...t };
        maybeRoll();
    }

    function maybeRoll() {
        const t = pendingTactic;
        const manual = service.state.prefs.rollMode === 'manual' && t.skill;
        if (manual) {
            renderControls();
            controls.querySelector('.roll-input')?.focus();
            return;
        }
        pendingTactic = null;
        run({ type: 'tactic', id: t.id, topic: t.topic });
    }

    async function run(action) {
        if (busy) return;
        busy = true;
        renderControls();
        const result = await service.negotiate(session.id, action);
        busy = false;
        if (result.error) {
            onToast?.(result.error, 'error');
            renderControls();
            return;
        }
        session = result.session;
        if (action.type === 'offer') offer = suggestedOffer();
        render();
    }

    function renderDeal() {
        const unit = session.finalUnit;
        const total = unit * session.qty;
        const saved = Math.abs(session.list - unit) * session.qty;
        replace(
            controls,
            h(
                'div',
                { class: 'deal-result' },
                h('p', { class: 'deal-title' }, '🤝 ¡Trato hecho!'),
                h('div', { class: 'neg-price' }, h('small', {}, 'Precio pactado por unidad'), coins(unit, { size: 'lg' })),
                saved > 0 ? h('p', { class: 'good small' }, buy ? `Ahorras ${formatCp(saved)} respecto al precio de lista.` : `Ganas ${formatCp(saved)} más de lo que ofrecía.`) : null,
                h('p', { class: 'muted small' }, 'El trato vale hasta el final del día de hoy.'),
                h(
                    'div',
                    { class: 'neg-footer' },
                    h('button', { class: 'btn btn-primary', onclick: async () => { dialog.close(); buy ? await onBuy?.(session.qty) : await onSell?.(session.qty); } }, buy ? `Pagar ${formatCp(total)}` : `Entregar y cobrar ${formatCp(total)}`),
                    h('button', { class: 'btn btn-ghost', onclick: () => dialog.close() }, 'Más tarde'),
                ),
            ),
        );
    }

    function renderEnd() {
        const failed = session.status === 'failed';
        replace(
            controls,
            h(
                'div',
                { class: 'deal-result' },
                h('p', { class: 'deal-title' }, failed ? '💢 La negociación se rompió' : '🚪 Te fuiste sin trato'),
                h('p', { class: 'muted small' }, failed ? 'No querrá volver a negociar esto hoy. Puedes comprar a precio de lista o volver otro día.' : 'Puedes comprar a precio de lista o intentarlo de nuevo mañana.'),
                h('div', { class: 'neg-footer' }, h('button', { class: 'btn btn-primary', onclick: () => dialog.close() }, 'Volver a la tienda')),
            ),
        );
    }

    function render() {
        renderKeeperCol();
        renderLog();
        renderControls();
    }
    render();
}
