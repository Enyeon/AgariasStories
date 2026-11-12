/**
 * Pestaña «Conversar»: todo lo que se puede hacer con un comerciante además de
 * comprar y vender (contarle cosas, rumores, rondas, regalos, favores,
 * secretos… y robar, si te atreves).
 *
 * Solo habla con el servicio. Lo que pasa se muestra como diálogo.
 */

import { h, replace, coins } from './dom.js';
import { formatCp } from '../../domain/money.js';
import { itemIcon, RARITY_INDEX } from '../../domain/shop/catalog.js';
import { DRINK_COST } from '../../domain/shop/talk.js';
import { productOptions } from '../../content/world-options.js';

const STEAL_MAX_PRICE = 5000;

/**
 * @param {HTMLElement} container
 * @param {{ service: object, keeperId: string, ui: object, toast: Function, rerender: Function }} opts
 */
export function renderTalk(container, { service, keeperId, ui, toast, rerender }) {
    const s = service.merchant(keeperId);
    if (!s) return replace(container);
    const k = s.keeper;
    const who = k.short ?? k.name;
    const used = new Set(s.usedToday);
    const manual = service.state.prefs.rollMode === 'manual';
    const open = s.status.open;
    const ctx = service.ctx;
    const log = ui.talkLog?.keeperId === keeperId ? ui.talkLog.lines : [];

    const rollInput = manual ? h('input', { type: 'number', min: '1', max: '20', class: 'qty-input talk-roll', placeholder: 'd20', 'aria-label': 'Tu tirada de d20', value: ui.manualRoll ?? '' , oninput: (e) => { ui.manualRoll = e.target.value; } }) : null;
    const roll = () => {
        const n = Number(ui.manualRoll);
        return Number.isInteger(n) && n >= 1 && n <= 20 ? n : undefined;
    };

    async function run(action, params = {}, { needsRoll = false } = {}) {
        if (needsRoll && manual && !roll()) return toast('Escribe primero tu tirada de d20.', 'error');
        const res = await service.talk(action, keeperId, { ...params, roll: roll() });
        if (res.error) return toast(res.error, 'error');
        ui.manualRoll = '';
        ui.talkLog = { keeperId, lines: res.result?.lines ?? [] };
        if (res.result?.canPay) ui.rumorPrice = { keeperId, price: res.result.price };
        else if (action === 'rumor') ui.rumorPrice = null;
        const delta = (res.result?.after ?? 0) - (res.result?.before ?? 0);
        if (delta) toast(`${who}: ${delta > 0 ? 'te aprecia más' : 'te aprecia menos'} (${res.result.tier.icon} ${res.result.tier.label}).`, delta > 0 ? 'success' : 'info');
        // El servicio ya repintó al emitir 'talk'; se repinta otra vez para mostrar el diálogo.
        rerender?.();
    }

    const usedTitle = (id) => (used.has(id) ? 'Ya lo hiciste hoy con este comerciante.' : '');
    const card = (icon, title, desc, ...controls) => h('article', { class: 'talk-card' }, h('header', {}, h('span', { 'aria-hidden': 'true' }, icon), h('b', {}, title)), desc ? h('p', { class: 'muted small' }, desc) : null, h('div', { class: 'talk-controls' }, controls));

    // ── Contarle algo de ti ──
    const tellSelect = h('select', { class: 'sort-select', 'aria-label': 'Qué le cuentas' }, s.tellable.map((t) => h('option', { value: t.id }, `${t.icon} ${t.label}`)));
    const tellCard = card('🗣️', 'Contarle algo de ti', s.tellable.length ? 'Tu trasfondo, tu origen, tus facciones o tus ideales: puede gustarle… o no.' : 'Ya le contaste todo lo que figura en tu ficha (Historia → trasfondo, personalidad, origen y facciones).',
        s.tellable.length ? tellSelect : null,
        s.tellable.length ? h('button', { class: 'btn btn-sm', disabled: !open, onclick: () => run('tell', { topic: tellSelect.value }) }, 'Contar') : null);

    // ── Historia, leerle, rumores, ronda ──
    const storyCard = card('📖', 'Contar una historia', 'Interpretación o Persuasión. A los amantes de las historias les encanta.',
        h('button', { class: 'btn btn-sm', disabled: !open || used.has('story'), title: usedTitle('story'), onclick: () => run('story', {}, { needsRoll: true }) }, 'Contar'));
    const readCard = card('👁️', 'Leerle', 'Perspicacia: descubre qué piensa de verdad y qué tipo de persona es.',
        h('button', { class: 'btn btn-sm', disabled: !open || used.has('read'), title: usedTitle('read'), onclick: () => run('read', {}, { needsRoll: true }) }, 'Observar'));
    const price = ui.rumorPrice?.keeperId === keeperId ? ui.rumorPrice.price : null;
    const rumorCard = card('👂', 'Preguntar por rumores', s.rumorsLeft ? 'Lo que cuente depende de cuánto confíe en ti.' : 'No parece saber nada nuevo.',
        h('button', { class: 'btn btn-sm', disabled: !open || used.has('rumor') || !s.rumorsLeft, title: usedTitle('rumor'), onclick: () => run('rumor') }, '¿Qué se cuenta?'),
        price ? h('button', { class: 'btn btn-sm btn-haggle', disabled: !open || used.has('rumor-paid'), onclick: () => run('rumor', { pay: true }) }, 'Pagar ', coins(price, { size: 'sm' })) : null);
    const drinkCard = card('🍺', 'Invitar a una jarra', `Te cuesta ${formatCp(DRINK_COST)}. Con una jarra en la mano, la gente habla.`,
        h('button', { class: 'btn btn-sm', disabled: !open || used.has('drink'), title: usedTitle('drink'), onclick: () => run('drink') }, 'Invitar'));

    // ── Regalar ──
    const giftable = service.giftable(keeperId).filter((g) => g.units > 0);
    const giftSelect = h('select', { class: 'sort-select', 'aria-label': 'Qué le regalas' }, giftable.map((g) => h('option', { value: g.item.id }, `${itemIcon(g.item)} ${g.item.name} (${g.units})`)));
    const giftCard = card('🎁', 'Hacerle un regalo', giftable.length ? 'Un objeto de tu inventario. Cada cual tiene sus gustos.' : 'No tienes nada en el inventario que puedas regalar.',
        giftable.length ? giftSelect : null,
        giftable.length ? h('button', { class: 'btn btn-sm', disabled: !open || used.has('gift'), title: usedTitle('gift'), onclick: () => run('gift', { itemId: giftSelect.value }) }, 'Regalar') : null);

    // ── Mentir ──
    const lieTopic = h('select', { class: 'sort-select', 'aria-label': 'Sobre qué mientes' },
        h('option', { value: 'faction' }, 'Que perteneces a…'), h('option', { value: 'origin' }, 'Que vienes de…'), h('option', { value: 'background' }, 'Que tu oficio es…'));
    const lieValue = h('select', { class: 'sort-select', 'aria-label': 'La mentira' });
    const fillLie = () => {
        const opts = lieTopic.value === 'faction'
            ? [...ctx.factions.values()].map((f) => [f.id, `${f.icon} ${f.name}`])
            : lieTopic.value === 'origin'
                ? [...ctx.regions.values()].map((r) => [r.id, `${r.icon} ${r.name}`])
                : [['soldado', 'Soldado'], ['noble', 'Noble'], ['sabio', 'Sabio'], ['criminal', 'Criminal'], ['marinero', 'Marinero'], ['artesano', 'Artesano gremial'], ['acolito', 'Acólito'], ['forastero', 'Forastero']];
        replace(lieValue, opts.map(([v, l]) => h('option', { value: v }, l)));
    };
    lieTopic.addEventListener('change', fillLie);
    fillLie();
    const lieCard = card('🎭', 'Mentirle', 'Engaño. Si te cree, te tratará según la mentira; si te pilla, lo recordará.',
        lieTopic, lieValue,
        h('button', { class: 'btn btn-sm', disabled: !open || used.has('lie'), title: usedTitle('lie'), onclick: () => run('lie', { topic: lieTopic.value, value: lieValue.value }, { needsRoll: true }) }, 'Mentir'));

    // ── Robar ──
    const stock = service.state.world.shops[s.shop?.id]?.stock ?? {};
    const stealable = Object.entries(stock)
        .map(([id, e]) => ({ item: ctx.item(id), entry: e }))
        .filter(({ item, entry }) => item && !entry.requires && (entry.unlimited || entry.qty > 0) && item.price <= STEAL_MAX_PRICE && RARITY_INDEX[item.rarity] <= RARITY_INDEX.uncommon)
        .sort((a, b) => b.item.price - a.item.price)
        .slice(0, 30);
    const stealSelect = h('select', { class: 'sort-select', 'aria-label': 'Qué intentas robar' }, stealable.map(({ item }) => h('option', { value: item.id }, `${itemIcon(item)} ${item.name}`)));
    const stealCard = h('article', { class: 'talk-card danger' },
        h('header', {}, h('span', { 'aria-hidden': 'true' }, '🧤'), h('b', {}, 'Robar del mostrador')),
        h('p', { class: 'muted small' }, 'Juego de Manos. Si te pillan, no querrá saber nada de ti en una semana… y no lo olvidará.'),
        h('div', { class: 'talk-controls' }, stealable.length ? stealSelect : h('span', { class: 'muted small' }, 'Nada al alcance.'),
            stealable.length ? h('button', { class: 'btn btn-sm btn-danger', disabled: !open || used.has('steal'), title: usedTitle('steal'), onclick: () => run('steal', { itemId: stealSelect.value }, { needsRoll: true }) }, 'Intentarlo') : null));

    // ── Ofertas del comerciante ──
    const offers = s.offers.map((o) => {
        let actions = [];
        if (o.id === 'drink-invite') actions = [
            h('button', { class: 'btn btn-sm btn-accept', onclick: () => run('drink', { accept: true }) }, 'Aceptar'),
            h('button', { class: 'btn btn-sm btn-primary', title: `Pagas tú la ronda (${formatCp(DRINK_COST)}) antes de que saque la bolsa`, onclick: () => run('drink', { accept: true, payFirst: true }) }, 'Aceptar y pagar tú la ronda'),
        ];
        if (o.id === 'small-gift') actions = [h('button', { class: 'btn btn-sm btn-accept', onclick: () => run('claimGift') }, 'Aceptar el regalo')];
        if (o.id === 'favor') actions = [h('button', { class: 'btn btn-sm', onclick: () => run('acceptFavor', { favorId: o.favorId }) }, 'Escuchar y aceptar')];
        if (o.id === 'secret') actions = [h('button', { class: 'btn btn-sm btn-accept', onclick: () => run('secret', { secretId: o.secretId }) }, 'Escuchar')];
        return h('li', { class: 'talk-offer' }, h('span', { 'aria-hidden': 'true' }, o.icon), h('span', {}, o.label), h('span', { class: 'talk-offer-actions' }, actions));
    });

    // ── Favores ──
    const canDm = service.canControlTime;
    const favors = s.favors.map((f) => {
        const st = f.state?.status;
        const label = st === 'active' ? (f.state.due ? `En curso · hasta el día ${f.state.due}` : 'En curso') : st === 'done' ? 'Cumplido' : st === 'failed' ? 'Incumplido' : f.lockedByTier ? `Necesita más confianza (${f.minTier ?? 'Neutral'})` : 'Disponible';
        const item = f.item ? ctx.item(f.item) : null;
        const actions = [];
        if (f.available) actions.push(h('button', { class: 'btn btn-sm', disabled: !open, onclick: () => run('acceptFavor', { favorId: f.id }) }, 'Aceptar'));
        if (st === 'active' && f.kind === 'deliver') actions.push(h('button', { class: 'btn btn-sm btn-accept', disabled: !open, onclick: () => run('deliverFavor', { favorId: f.id }) }, `Entregar ${f.qty ?? 1} × ${item?.name ?? f.item}`));
        if (st === 'active' && f.kind === 'task' && canDm) actions.push(h('button', { class: 'btn btn-sm btn-accept', title: 'DM: dar por cumplido', onclick: async () => {
            const res = await service.dm('completeFavor', { keeperId, favorId: f.id });
            if (res.error) toast(res.error, 'error');
            else {
                ui.talkLog = { keeperId, lines: res.result?.lines ?? [] };
                rerender?.();
            }
        } }, '✔ Cumplido (DM)'));
        if (st === 'active') actions.push(h('button', { class: 'btn btn-sm btn-ghost', onclick: () => run('abandonFavor', { favorId: f.id }) }, 'Renunciar'));
        const hidden = !st && f.lockedByTier;
        return h('li', { class: ['talk-favor', st && `is-${st}`] },
            h('div', {}, h('b', {}, hidden ? 'Un asunto que aún no te confía' : f.title), h('small', { class: 'muted' }, ` · ${label}`), !hidden ? h('p', { class: 'small' }, f.text) : null),
            actions.length ? h('div', { class: 'talk-controls' }, actions) : null);
    });

    // ── Contratación ──
    let hireSection = null;
    if (s.contract) {
        const c = s.contract;
        const opts = productOptions();
        const chosen = new Set(c.products ?? []);
        const productSelect = h('select', { class: 'sort-select', 'aria-label': 'Producto extra' }, h('option', { value: '' }, '— Añadir un producto que venda —'), Object.entries(opts).filter(([k]) => !chosen.has(k)).map(([k, l]) => h('option', { value: k }, l)));
        const setProducts = async (list) => {
            const res = await service.setContractProducts(keeperId, list);
            if (res.error) toast(res.error, 'error');
        };
        hireSection = h('section', { class: 'talk-section' }, h('h3', {}, '📜 Trabaja para ti'),
            h('div', { class: 'talk-card' },
                h('p', { class: 'small' }, `Desde el día ${c.since}${c.location ? ` · trasladado a ${ctx.location(c.location)?.name ?? c.location}` : ''} · salario ${formatCp(c.wage)}/día${c.upkeep ? ` + local ${formatCp(c.upkeep)}/día` : ''} · te llevas el ${Math.round((c.share ?? 0.5) * 100)} % del beneficio.`),
                h('p', {}, 'Saldo: ', c.balance >= 0 ? h('b', { class: 'tone-good' }, `te debe ${formatCp(c.balance)}`) : h('b', { class: 'tone-bad' }, `le debes ${formatCp(-c.balance)}`),
                    c.balance < 0 ? h('small', { class: 'muted' }, ' (si la deuda crece demasiado, renunciará)') : null),
                c.log?.length ? h('p', { class: 'small muted' }, 'Últimos días: ', c.log.slice(0, 5).map((l) => `día ${l.day}: +${formatCp(l.profit)} −${formatCp(l.costs)}`).join(' · ')) : null,
                h('div', { class: 'talk-controls' },
                    h('button', { class: 'btn btn-sm btn-primary', disabled: !c.balance, onclick: async () => {
                        const res = await service.settleContract(keeperId);
                        toast(res.error ?? res.result.text, res.error ? 'error' : 'success');
                    } }, c.balance >= 0 ? 'Cobrar' : 'Pagar'),
                    h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
                        const res = await service.dismissContract(keeperId);
                        toast(res.error ?? `${who} vuelve a trabajar por su cuenta.`, res.error ? 'error' : 'info');
                    } }, 'Despedir')),
                h('p', { class: 'small' }, 'Productos que le pides vender además de lo suyo: ', (c.products ?? []).length ? (c.products ?? []).map((k) => h('button', { class: 'tag', title: 'Quitar', onclick: () => setProducts(c.products.filter((x) => x !== k)) }, `${opts[k] ?? k} ✕`)) : h('span', { class: 'muted' }, 'ninguno')),
                h('div', { class: 'talk-controls' }, productSelect, h('button', { class: 'btn btn-sm', onclick: () => productSelect.value && setProducts([...(c.products ?? []), productSelect.value]) }, 'Añadir'))));
    } else if (s.hire && (s.hire.available || s.hire.reason !== `${who} no trabaja para nadie más que para sí mismo.`)) {
        const places = s.hire.mobile ? service.map().flatMap((r) => r.locations.map((l) => [l.id, `${r.name} · ${l.name}`])) : [];
        const where = h('select', { class: 'sort-select', 'aria-label': 'Dónde trabajará' }, h('option', { value: '' }, 'Donde está ahora'), places.map(([id, l]) => h('option', { value: id }, l)));
        hireSection = h('section', { class: 'talk-section' }, h('h3', {}, '📜 Contratar'),
            h('div', { class: 'talk-card' },
                h('p', { class: 'small' }, `Prima: ${formatCp(s.hire.fee)} · salario ${formatCp(s.hire.wage)}/día · tú te llevas la mitad del beneficio de su tienda. Las cuentas se liquidan cuando le visitas.${s.hire.mobile ? ' Acepta trasladarse.' : ' No quiere mudarse.'}`),
                s.hire.available
                    ? h('div', { class: 'talk-controls' }, s.hire.mobile ? where : null, h('button', { class: 'btn btn-sm btn-primary', disabled: !open, onclick: async () => {
                        const res = await service.hire(keeperId, where.value || null);
                        if (res.error) return toast(res.error, 'error');
                        ui.talkLog = { keeperId, lines: res.result?.lines ?? [] };
                        rerender?.();
                    } }, 'Contratar'))
                    : h('p', { class: 'muted small' }, s.hire.reason)));
    }

    // ── Secretos ──
    const secrets = s.secrets.map((x) => h('li', { class: ['talk-secret', x.known && 'is-known'] },
        h('div', {}, h('b', {}, x.known ? `🔓 ${x.title}` : '🔒 Algo que no cuenta'), x.known ? h('p', { class: 'small' }, x.text) : h('p', { class: 'muted small' }, x.hint)),
        !x.known && x.how === 'investigate'
            ? h('button', { class: 'btn btn-sm', disabled: !open || used.has(`secret:${x.id}`), title: usedTitle(`secret:${x.id}`), onclick: () => run('secret', { secretId: x.id }, { needsRoll: true }) }, 'Investigar')
            : !x.known && x.how === 'trust' && x.ready ? h('button', { class: 'btn btn-sm btn-accept', onclick: () => run('secret', { secretId: x.id }) }, 'Escuchar') : null));

    replace(
        container,
        !open ? h('div', { class: 'closed-sign' }, h('span', { 'aria-hidden': 'true' }, '🚪'), h('div', {}, h('b', {}, `${who} no atiende ahora`), h('p', {}, s.status.reason ?? ''))) : null,
        s.disposition.refuses ? h('div', { class: 'closed-sign' }, h('span', { 'aria-hidden': 'true' }, '😠'), h('div', {}, h('b', {}, 'No quiere tratos contigo'), h('p', {}, s.disposition.refuses))) : null,
        log.length
            ? h('section', { class: 'talk-log', 'aria-live': 'polite' }, log.map((l) => h('p', { class: ['talk-line', `from-${l.who}`, l.tone && `tone-${l.tone}`] }, l.who === 'keeper' ? h('b', {}, `${who}: `) : null, l.text)))
            : h('p', { class: 'talk-intro muted' }, `Hablar también es comerciar: lo que hagas aquí cambia cómo te trata ${who}, sus precios y lo que está dispuesto a contarte.`),
        manual ? h('p', { class: 'talk-manual small' }, '🎲 Tiras tú: ', rollInput, h('span', { class: 'muted' }, ' (escribe el d20 antes de una acción con tirada)')) : null,
        offers.length ? h('section', { class: 'talk-section' }, h('h3', {}, '✨ ', who, ' te propone'), h('ul', { class: 'talk-offers' }, offers)) : null,
        h('section', { class: 'talk-grid' }, tellCard, storyCard, readCard, rumorCard, drinkCard, giftCard, lieCard, stealCard),
        favors.length ? h('section', { class: 'talk-section' }, h('h3', {}, '🤝 Favores'), h('ul', { class: 'talk-list' }, favors)) : null,
        hireSection,
        secrets.length ? h('section', { class: 'talk-section' }, h('h3', {}, '🤫 Secretos'), h('ul', { class: 'talk-list' }, secrets)) : null,
    );
}
