/**
 * Vista principal de la Tienda.
 *
 * mountShopView(root, service) → { destroy }
 * Solo habla con el servicio (shop-service.js); no conoce la persistencia ni
 * las fórmulas. La negociación vive en negotiation-dialog.js.
 */

import { CATEGORIES, getCategory, getRarity, getSub, itemIcon, searchKey } from '../../domain/shop/catalog.js';
import { coinsInCp, formatCp } from '../../domain/money.js';
import { activeEvents, eventIntensity } from '../../domain/shop/pricing.js';
import { priceBreakdown } from '../../domain/shop/transactions.js';
import { h, replace, coins, pct, sparkline, debounce } from './dom.js';
import { toast as appToast } from '../../ui/feedback.js';
import { openNegotiation } from './negotiation-dialog.js';

const SORTS = [
    { id: 'default', label: 'Destacados' },
    { id: 'price-asc', label: 'Más baratos' },
    { id: 'price-desc', label: 'Más caros' },
    { id: 'name', label: 'Nombre' },
    { id: 'falling', label: 'Bajaron de precio' },
];

const REL_LEVELS = [
    { min: 60, label: 'Amistad', tone: 'good' },
    { min: 25, label: 'Cordial', tone: 'good' },
    { min: -24, label: 'Neutral', tone: 'neutral' },
    { min: -59, label: 'Desconfianza', tone: 'bad' },
    { min: -101, label: 'Hostilidad', tone: 'bad' },
];

/**
 * @param {{ onCharacterChange?: (id: string) => void }} [opts]
 */
export function mountShopView(root, service, { onCharacterChange } = {}) {
    // El catálogo depende del personaje (Homebrew de su campaña): se refresca al cambiar.
    let ctx = service.ctx;
    const ui = {
        shopId: ctx.shopList[0]?.id,
        tab: 'buy',
        category: 'all',
        sub: null,
        search: '',
        sort: 'default',
        onlyAffordable: false,
        selectedItemId: null,
        qty: 1,
        detailOpen: false,
    };

    // ── Estructura fija ──
    const header = h('header', { class: 'shop-header' });
    const signs = h('nav', { class: 'shop-signs', 'aria-label': 'Tiendas del mercado' });
    const keeperPanel = h('aside', { class: 'keeper-panel', 'aria-label': 'Vendedor' });
    const tabs = h('div', { class: 'shop-tabs', role: 'tablist' });
    const toolbar = h('div', { class: 'shop-toolbar' });
    const content = h('div', { class: 'shop-content' });
    const main = h('section', { class: 'shop-main' }, tabs, toolbar, content);
    const detail = h('aside', { class: 'detail-panel', 'aria-label': 'Detalle del objeto' });
    const scrim = h('div', { class: 'detail-scrim', onclick: () => closeDetail() });
    const body = h('div', { class: 'shop-body' }, keeperPanel, main, detail);
    replace(root, h('div', { class: 'shop-root' }, header, signs, body, scrim));
    root.classList.add('shop-host');

    const searchInput = h('input', {
        type: 'search',
        class: 'shop-search',
        placeholder: 'Buscar en el estante…',
        'aria-label': 'Buscar objetos',
        oninput: debounce((e) => {
            ui.search = e.target.value;
            renderContent();
        }, 120),
    });

    // ── Utilidades ──
    const state = () => service.state;
    const shop = () => ctx.shop(ui.shopId);
    const keeper = () => ctx.keeperOf(ui.shopId);
    const funds = () => (state().character ? coinsInCp(state().character.equipment.coins) : 0);

    function toast(text, kind = 'info') {
        appToast(text, { type: kind });
    }

    function stockLabel(entry) {
        const day = state().world.day;
        if (!entry) return { text: '—', tone: 'muted' };
        if (entry.unlimited) return { text: 'Abundante', tone: 'ok' };
        if (entry.qty === 0) {
            if (entry.incoming) {
                const d = entry.incoming.day - day;
                return { text: d <= 1 ? 'Agotado · llega mañana' : `Agotado · llega en ${d} días`, tone: 'out' };
            }
            return { text: 'Agotado', tone: 'out' };
        }
        if (entry.rotating) {
            const d = entry.expires - day;
            return { text: d <= 2 ? 'Pieza única · se irá pronto' : 'Pieza única', tone: 'rare' };
        }
        if (entry.consigned) return { text: `De segunda mano · ${entry.qty}`, tone: 'ok' };
        if (entry.qty <= Math.max(1, Math.floor(entry.target * 0.34))) return { text: entry.qty === 1 ? 'Último' : `Últimos ${entry.qty}`, tone: 'low' };
        return { text: `${entry.qty} en estante`, tone: 'ok' };
    }

    function relationLevel(rep) {
        return REL_LEVELS.find((l) => rep >= l.min) ?? REL_LEVELS[2];
    }

    // ── Cabecera: día, eventos, personaje, bolsa ──
    function renderHeader() {
        const s = state();
        const events = activeEvents(s.world, ctx);
        const characterSelect = h(
            'select',
            {
                class: 'char-select',
                'aria-label': 'Personaje que compra',
                onchange: (e) => {
                    service.selectCharacter(e.target.value);
                    onCharacterChange?.(e.target.value);
                },
            },
            s.characters.map((c) => h('option', { value: c.id, selected: c.id === s.characterId }, c.name)),
        );
        const character = s.character;
        const canTime = service.canControlTime;
        const timeHint = s.scope.kind === 'campaign' ? 'Sólo el DM de la campaña puede pasar el tiempo.' : '';
        replace(
            header,
            h(
                'div',
                { class: 'market-title' },
                h('span', { class: 'market-crest', 'aria-hidden': 'true' }, '⚖️'),
                h(
                    'div',
                    {},
                    h('h1', {}, service.market.name),
                    h(
                        'p',
                        { class: 'market-sub' },
                        s.scope.kind === 'campaign'
                            ? h('span', { class: 'scope-badge', title: 'Existencias, eventos y registro de compras compartidos en Supabase por toda la campaña.' }, s.offline ? '⚠ Sin conexión · sólo lectura' : `🌐 Compartido por la campaña · ${s.role === 'dm' ? 'DM' : 'jugador'}`)
                            : h('span', { class: 'scope-badge', title: 'Este personaje no pertenece a una campaña: el mercado se guarda en este dispositivo.' }, '💾 Mercado de este dispositivo'),
                        s.scope.kind === 'campaign' ? h('button', { class: 'link', onclick: () => service.refresh(), title: 'Ver lo que compraron los demás' }, '↻ Actualizar') : null,
                        s.notice ? h('span', { class: 'scope-badge warn', title: s.notice }, '⚠ ', s.notice) : null,
                    ),
                ),
            ),
            h(
                'div',
                { class: 'market-day' },
                h('div', { class: 'day-badge', title: 'Día de juego' }, h('span', { class: 'day-sun', 'aria-hidden': 'true' }, '☀'), h('span', {}, 'Día '), h('b', {}, String(s.world.day))),
                h('button', { class: 'btn btn-ghost', disabled: !canTime, onclick: () => advance(1), title: canTime ? 'Avanza un día: otros clientes compran, llegan pedidos y cambian los eventos.' : timeHint }, 'Pasar el día'),
                h('button', { class: 'btn btn-ghost', disabled: !canTime, onclick: () => advance(7), title: canTime ? '' : timeHint }, '+7 días'),
                events.length
                    ? h('div', { class: 'event-chips', 'aria-label': 'Eventos activos' }, events.map(({ def }) => h('span', { class: 'event-chip', title: def.notice }, h('span', { 'aria-hidden': 'true' }, def.icon), def.name)))
                    : null,
            ),
            h(
                'div',
                { class: 'market-char' },
                h('label', { class: 'char-picker' }, h('span', { class: 'sr-only' }, 'Personaje'), characterSelect),
                character ? h('div', { class: 'purse', title: 'Monedas del personaje (las de su ficha)' }, h('span', { class: 'purse-icon', 'aria-hidden': 'true' }, '👛'), coins(coinsInCp(character.equipment.coins))) : null,
                character ? h('a', { class: 'btn btn-ghost', href: `/editar/${encodeURIComponent(s.characterId)}`, 'data-link': true, title: 'Abrir la ficha: inventario, monedas y Taller' }, '📜 Ficha') : null,
                h('button', { class: 'btn btn-icon', title: 'Opciones', 'aria-label': 'Opciones de la tienda', onclick: openSettings }, '⚙'),
            ),
        );
    }

    // ── Letreros de tiendas ──
    function renderSigns() {
        replace(
            signs,
            ctx.shopList.map((s) => {
                const k = ctx.keepers.get(s.keeperId);
                const status = service.shopStatus(s.id);
                return h(
                    'button',
                    {
                        class: ['shop-sign', s.id === ui.shopId && 'active', status.closed && 'closed'],
                        style: { '--accent': k?.accent ?? '#c9a45c' },
                        'aria-pressed': String(s.id === ui.shopId),
                        onclick: () => selectShop(s.id),
                    },
                    h('span', { class: 'sign-icon', 'aria-hidden': 'true' }, s.icon),
                    h('span', { class: 'sign-text' }, h('b', {}, s.name), h('small', {}, status.closed ? `Cerrado · ${status.closedBy.name}` : s.kind)),
                );
            }),
        );
    }

    // ── Panel del vendedor ──
    function renderKeeper() {
        const k = keeper();
        const s = shop();
        if (!k || !s) return replace(keeperPanel);
        const rel = service.relation(k.id);
        const level = relationLevel(rel.rep);
        const status = service.shopStatus(s.id);
        const known = rel.known;
        const topic = (id) => ctx.topics.get(id);
        const events = activeEvents(state().world, ctx);
        const world = state().world;

        replace(
            keeperPanel,
            h(
                'div',
                { class: 'keeper-card', style: { '--accent': k.accent } },
                h('div', { class: 'keeper-portrait', 'aria-hidden': 'true' }, k.portrait),
                h('div', { class: 'keeper-id' }, h('h2', {}, k.name), h('p', { class: 'keeper-title' }, k.title)),
                h('blockquote', { class: 'speech' }, status.closed ? `(${status.closedBy.notice})` : service.welcomeLine(s.id)),
                h(
                    'div',
                    { class: 'relation' },
                    h('div', { class: 'relation-head' }, h('span', {}, 'Relación'), h('b', { class: `tone-${level.tone}` }, level.label)),
                    h('div', { class: 'relation-bar', role: 'meter', 'aria-valuemin': '-100', 'aria-valuemax': '100', 'aria-valuenow': String(rel.rep), 'aria-label': 'Relación con el vendedor' }, h('span', { style: { left: `${(rel.rep + 100) / 2}%` } })),
                    rel.deals ? h('p', { class: 'muted small' }, `${rel.deals} ${rel.deals === 1 ? 'trato cerrado' : 'tratos cerrados'} con ${k.short ?? k.name}.`) : null,
                ),
                h('p', { class: 'keeper-bio' }, k.bio),
                h(
                    'details',
                    { class: 'known', open: true },
                    h('summary', {}, 'Lo que sabes de ' + (k.short ?? k.name)),
                    known.likes.length || known.dislikes.length || known.traits.length
                        ? h(
                            'ul',
                            {},
                            known.likes.map((id) => h('li', { class: 'like' }, h('span', { 'aria-hidden': 'true' }, '💚 '), `Le gusta hablar de ${topic(id)?.label.toLowerCase() ?? id}.`)),
                            known.dislikes.map((id) => h('li', { class: 'dislike' }, h('span', { 'aria-hidden': 'true' }, '💢 '), `No soporta hablar de ${topic(id)?.label.toLowerCase() ?? id}.`)),
                            known.traits.map((t) => h('li', {}, h('span', { 'aria-hidden': 'true' }, '👁️ '), t)),
                        )
                        : h('p', { class: 'muted small' }, 'Aún no sabes mucho. Durante una negociación, charla o intenta leer sus intenciones: lo que descubras quedará anotado aquí.'),
                ),
            ),
            h('div', { class: 'shop-blurb' }, h('p', {}, s.description), h('p', { class: 'cash' }, 'Caja de hoy: ', coins(world.shops[s.id]?.cash ?? 0, { size: 'sm' }))),
            h(
                'section',
                { class: 'notice-board', 'aria-label': 'Tablón de anuncios' },
                h('h3', {}, '📌 Tablón de anuncios'),
                events.length
                    ? events.map(({ def, state: ev }) => {
                        const phase = world.day <= ev.start ? 'Empieza' : world.day >= ev.end ? 'Último día' : eventIntensity(ev, world.day) < 1 ? 'Amainando' : 'En curso';
                        return h('article', { class: 'notice' }, h('header', {}, h('span', { 'aria-hidden': 'true' }, def.icon), h('b', {}, def.name), h('small', {}, phase)), h('p', {}, def.notice));
                    })
                    : h('p', { class: 'muted small' }, 'Nada fuera de lo común. Un día tranquilo en el mercado.'),
            ),
        );
    }

    // ── Pestañas y barra de herramientas ──
    function renderTabs() {
        const tab = (id, label) => h('button', { role: 'tab', class: ['tab', ui.tab === id && 'active'], 'aria-selected': String(ui.tab === id), onclick: () => setTab(id) }, label);
        replace(tabs, tab('buy', '🛒 Comprar'), tab('sell', '💰 Vender'), tab('ledger', '📒 Registro'));
    }

    function stockedItems() {
        const stock = state().world.shops[ui.shopId]?.stock ?? {};
        return Object.keys(stock).map((id) => ctx.item(id)).filter(Boolean);
    }

    function renderToolbar() {
        if (ui.tab !== 'buy') return replace(toolbar);
        const items = stockedItems();
        const counts = new Map();
        for (const it of items) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
        const cats = CATEGORIES.filter((c) => counts.has(c.id));
        const chip = (id, label, icon, count, active, onclick) => h('button', { class: ['chip', active && 'active'], onclick, 'aria-pressed': String(active) }, icon ? h('span', { 'aria-hidden': 'true' }, icon) : null, label, count !== undefined ? h('small', {}, count) : null);
        const subs = ui.category !== 'all' ? getCategory(ui.category)?.subs.filter((s) => items.some((i) => i.category === ui.category && i.sub === s.id)) ?? [] : [];
        searchInput.value = ui.search;
        replace(
            toolbar,
            h(
                'div',
                { class: 'toolbar-row' },
                h('label', { class: 'search-wrap' }, h('span', { 'aria-hidden': 'true' }, '🔍'), searchInput),
                h('select', { class: 'sort-select', 'aria-label': 'Ordenar', onchange: (e) => { ui.sort = e.target.value; renderContent(); } }, SORTS.map((s) => h('option', { value: s.id, selected: s.id === ui.sort }, s.label))),
                h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: ui.onlyAffordable, onchange: (e) => { ui.onlyAffordable = e.target.checked; renderContent(); } }), 'Solo lo que puedo pagar'),
            ),
            h(
                'div',
                { class: 'chips', role: 'group', 'aria-label': 'Categorías' },
                chip('all', 'Todo', '✦', items.length, ui.category === 'all', () => setCategory('all')),
                cats.map((c) => chip(c.id, c.label, c.icon, counts.get(c.id), ui.category === c.id, () => setCategory(c.id))),
            ),
            subs.length > 1
                ? h('div', { class: 'chips chips-sub', role: 'group', 'aria-label': 'Subcategorías' }, chip(null, 'Todas', null, undefined, !ui.sub, () => setSub(null)), subs.map((s) => chip(s.id, s.label, s.icon, undefined, ui.sub === s.id, () => setSub(s.id))))
                : null,
        );
    }

    // ── Contenido ──
    function renderContent() {
        if (ui.tab === 'buy') return renderGrid();
        if (ui.tab === 'sell') return renderSell();
        return renderLedger();
    }

    function filteredItems() {
        const s = shop();
        const q = searchKey(ui.search.trim());
        const money = funds();
        let rows = stockedItems()
            .filter((i) => ui.category === 'all' || i.category === ui.category)
            .filter((i) => !ui.sub || i.sub === ui.sub)
            .filter((i) => !q || searchKey(`${i.name} ${i.desc} ${getSub(i.category, i.sub)?.label ?? ''}`).includes(q))
            .map((item) => ({ item, quote: service.quoteBuy(ui.shopId, item.id) }))
            .filter((r) => r.quote);
        if (ui.onlyAffordable) rows = rows.filter((r) => r.quote.unit <= money);
        const specialty = (r) => ((s.specialties ?? []).includes(r.item.category) ? 0 : 1);
        const catOrder = (r) => CATEGORIES.findIndex((c) => c.id === r.item.category);
        const available = (r) => (r.quote.available > 0 ? 0 : 1);
        const sorters = {
            default: (a, b) => available(a) - available(b) || Number(Boolean(b.quote.entry.rotating)) - Number(Boolean(a.quote.entry.rotating)) || specialty(a) - specialty(b) || catOrder(a) - catOrder(b) || a.item.price - b.item.price,
            'price-asc': (a, b) => a.quote.unit - b.quote.unit,
            'price-desc': (a, b) => b.quote.unit - a.quote.unit,
            name: (a, b) => a.item.name.localeCompare(b.item.name, 'es'),
            falling: (a, b) => a.quote.trend.dir - b.quote.trend.dir || (a.quote.trend.current / a.quote.trend.prev) - (b.quote.trend.current / b.quote.trend.prev),
        };
        return rows.sort(sorters[ui.sort] ?? sorters.default);
    }

    function closedNotice() {
        const status = service.shopStatus(ui.shopId);
        if (!status.closed) return null;
        return h('div', { class: 'closed-sign' }, h('span', { 'aria-hidden': 'true' }, '🚫'), h('div', {}, h('b', {}, 'Cerrado'), h('p', {}, `${status.closedBy.name}. ${status.closedBy.notice}`)));
    }

    function renderGrid() {
        const rows = filteredItems();
        const money = funds();
        const closed = closedNotice();
        if (!rows.length) {
            return replace(content, closed, h('div', { class: 'empty' }, h('span', { 'aria-hidden': 'true' }, '🕸️'), h('p', {}, ui.search || ui.category !== 'all' || ui.onlyAffordable ? 'Nada en el estante coincide con la búsqueda.' : 'Los estantes están vacíos.')));
        }
        replace(
            content,
            closed,
            h(
                'ul',
                { class: 'item-grid' },
                rows.map(({ item, quote }) => {
                    const rarity = getRarity(item.rarity);
                    const stock = stockLabel(quote.entry);
                    const soldOut = quote.available === 0;
                    const affordable = quote.unit <= money;
                    return h(
                        'li',
                        {},
                        h(
                            'button',
                            {
                                class: ['item-card', soldOut && 'sold-out', ui.selectedItemId === item.id && 'selected', quote.entry.rotating && 'is-rotating'],
                                style: { '--rarity': rarity.color },
                                onclick: () => selectItem(item.id),
                                'aria-label': `${item.name}, ${rarity.label}, ${formatCp(quote.unit)}${soldOut ? ', agotado' : ''}`,
                            },
                            h('span', { class: 'item-icon', 'aria-hidden': 'true' }, itemIcon(item)),
                            h(
                                'span',
                                { class: 'item-body' },
                                h('span', { class: 'item-name' }, item.name),
                                h('span', { class: 'item-meta' }, h('span', { class: 'rarity-dot' }), rarity.label, ' · ', getSub(item.category, item.sub)?.label ?? ''),
                                h('span', { class: ['stock', `stock-${stock.tone}`] }, stock.text),
                            ),
                            h(
                                'span',
                                { class: ['item-price', !affordable && 'too-expensive'] },
                                quote.deal ? h('span', { class: 'deal-badge' }, 'Trato') : null,
                                coins(quote.unit),
                                trendMark(quote.trend),
                            ),
                        ),
                    );
                }),
            ),
        );
    }

    function trendMark(trend) {
        if (!trend.dir) return null;
        const diff = Math.round(((trend.current - trend.prev) / trend.prev) * 100);
        if (!diff) return null;
        return h('span', { class: ['trend', trend.dir > 0 ? 'up' : 'down'], title: `Ayer: ${formatCp(trend.prev)}` }, trend.dir > 0 ? '▲' : '▼', ` ${Math.abs(diff)} %`);
    }

    function renderSell() {
        const s = shop();
        const closed = closedNotice();
        const rows = service.sellableItems(ui.shopId);
        const cash = state().world.shops[s.id]?.cash ?? 0;
        if (!state().character) return replace(content, h('div', { class: 'empty' }, h('p', {}, 'Elige un personaje para vender.')));
        const interested = rows.filter((r) => r.quote.unit);
        const others = rows.filter((r) => !r.quote.unit);
        const row = (r) => {
            const qtyInput = h('input', { type: 'number', min: '1', max: String(Math.max(1, r.units)), value: '1', class: 'qty-input', 'aria-label': `Cantidad de ${r.entry.name}` });
            const rarity = r.item ? getRarity(r.item.rarity) : null;
            const haggle = r.item && r.quote.unit ? service.haggleState(ui.shopId, r.item.id, 'sell', Math.max(1, r.units)) : null;
            return h(
                'li',
                { class: ['sell-row', !r.quote.unit && 'muted-row'], style: rarity ? { '--rarity': rarity.color } : {} },
                h('span', { class: 'item-icon', 'aria-hidden': 'true' }, r.item ? itemIcon(r.item) : '❔'),
                h(
                    'div',
                    { class: 'sell-info' },
                    h('b', {}, r.entry.name),
                    h('small', {}, `Tienes ${r.entry.qty}${r.item?.bundle ? ` (lotes de ${r.item.bundle})` : ''}`),
                    r.quote.unit ? h('small', { class: 'muted' }, r.quote.factors.filter((f) => f.key !== 'tasa').slice(0, 1).map((f) => f.label)) : null,
                ),
                r.quote.unit
                    ? h(
                        'div',
                        { class: 'sell-actions' },
                        h('span', { class: 'sell-offer' }, r.quote.deal ? h('span', { class: 'deal-badge' }, 'Trato') : null, coins(r.quote.unit), h('small', {}, 'c/u')),
                        r.units > 1 ? qtyInput : null,
                        h('button', { class: 'btn btn-primary btn-sm', disabled: Boolean(closed) || r.units < 1, onclick: () => doSell(r.item.id, Number(qtyInput.value) || 1) }, 'Vender'),
                        h('button', { class: 'btn btn-ghost btn-sm', disabled: !haggle?.ok, title: haggle?.ok ? 'Negociar el precio' : haggle?.message, onclick: () => haggleSell(r.item.id, Number(qtyInput.value) || 1) }, 'Regatear'),
                    )
                    : h('span', { class: 'muted small' }, r.quote.reason === 'unknown-item' ? 'No sabe qué valor darle.' : 'No le interesa.'),
            );
        };
        replace(
            content,
            closed,
            h('div', { class: 'sell-head' }, h('p', {}, `${keeper()?.short ?? 'El vendedor'} tiene en caja `, coins(cash, { size: 'sm' }), ' para comprar hoy.')),
            interested.length ? h('ul', { class: 'sell-list' }, interested.map(row)) : h('div', { class: 'empty' }, h('p', {}, 'No tienes nada que le interese a esta tienda.')),
            others.length ? h('details', { class: 'sell-others' }, h('summary', {}, `Otros objetos (${others.length}) que no le interesan`), h('ul', { class: 'sell-list' }, others.map(row))) : null,
        );
    }

    function renderLedger() {
        const s = state();
        const everyone = s.scope.kind === 'campaign' && s.role === 'dm';
        const entries = everyone ? s.world.ledger : s.world.ledger.filter((e) => e.charId === s.characterId);
        if (!entries.length) return replace(content, h('div', { class: 'empty' }, h('span', { 'aria-hidden': 'true' }, '📒'), h('p', {}, 'Aún no hay compras ni ventas registradas para este personaje.')));
        replace(
            content,
            h(
                'table',
                { class: 'ledger' },
                h('thead', {}, h('tr', {}, h('th', {}, 'Día'), everyone ? h('th', {}, 'Personaje') : null, h('th', {}, 'Tienda'), h('th', {}, 'Operación'), h('th', { class: 'num' }, 'Total'))),
                h(
                    'tbody',
                    {},
                    entries.map((e) =>
                        h(
                            'tr',
                            {},
                            h('td', {}, String(e.day)),
                            everyone ? h('td', {}, e.charName || '—') : null,
                            h('td', {}, ctx.shop(e.shopId)?.name ?? e.shopId),
                            h('td', {}, `${e.side === 'buy' ? (everyone ? 'Compra' : 'Compraste') : (everyone ? 'Venta' : 'Vendiste')} ${e.qty} × ${e.name}`, e.negotiated ? h('span', { class: 'deal-badge', title: e.saved ? `Ganaste ${formatCp(e.saved)} negociando` : '' }, 'Negociado') : null),
                            h('td', { class: ['num', e.side === 'buy' ? 'neg' : 'pos'] }, `${e.side === 'buy' ? '−' : '+'}${formatCp(e.total)}`),
                        ),
                    ),
                ),
            ),
        );
    }

    // ── Detalle ──
    function renderDetail() {
        const item = ui.selectedItemId ? ctx.item(ui.selectedItemId) : null;
        const quote = item ? service.quoteBuy(ui.shopId, item.id) : null;
        detail.classList.toggle('open', ui.detailOpen && Boolean(quote));
        scrim.classList.toggle('open', ui.detailOpen && Boolean(quote));
        if (!item || !quote) {
            return replace(detail, h('div', { class: 'detail-empty' }, h('span', { 'aria-hidden': 'true' }, '🔎'), h('p', {}, 'Elige un objeto del estante para examinarlo, ver por qué cuesta lo que cuesta y regatear.')));
        }
        const rarity = getRarity(item.rarity);
        const world = state().world;
        const entry = quote.entry;
        const stock = stockLabel(entry);
        const maxQty = Number.isFinite(quote.available) ? quote.available : 99;
        ui.qty = Math.max(1, Math.min(ui.qty, Math.max(1, maxQty)));
        const breakdown = priceBreakdown(quote, ui.qty);
        const money = funds();
        const status = service.shopStatus(ui.shopId);
        const haggle = service.haggleState(ui.shopId, item.id, 'buy', ui.qty);
        const history = world.shops[ui.shopId].history?.[item.id] ?? [];
        const others = ctx.shopList
            .filter((s) => s.id !== ui.shopId)
            .map((s) => ({ shop: s, quote: service.quoteBuy(s.id, item.id) }))
            .filter((r) => r.quote);

        const qtyControl = h(
            'div',
            { class: 'qty' },
            h('button', { class: 'btn btn-icon', 'aria-label': 'Menos', disabled: ui.qty <= 1, onclick: () => setQty(ui.qty - 1) }, '−'),
            h('input', { type: 'number', min: '1', max: String(maxQty), value: String(ui.qty), 'aria-label': 'Cantidad', onchange: (e) => setQty(Number(e.target.value) || 1) }),
            h('button', { class: 'btn btn-icon', 'aria-label': 'Más', disabled: ui.qty >= maxQty, onclick: () => setQty(ui.qty + 1) }, '+'),
        );
        let extra = null;
        if (entry.incoming && entry.qty > 0) {
            const d = Math.max(1, entry.incoming.day - world.day);
            extra = `Hay un pedido en camino (${entry.incoming.qty}) que llega ${d === 1 ? 'mañana' : `en ${d} días`}.`;
        }
        if (entry.rotating) extra = `No es mercancía habitual: ${Math.max(0, entry.expires - world.day) <= 2 ? 'podría desaparecer en cualquier momento' : `seguirá aquí unos ${entry.expires - world.day} días, si nadie la compra antes`}.`;

        replace(
            detail,
            h('button', { class: 'detail-close btn btn-icon', 'aria-label': 'Cerrar detalle', onclick: closeDetail }, '✕'),
            h(
                'div',
                { class: 'detail-head', style: { '--rarity': rarity.color } },
                h('span', { class: 'detail-icon', 'aria-hidden': 'true' }, itemIcon(item)),
                h('div', {}, h('h2', {}, item.name), h('p', { class: 'rarity-tag' }, h('span', { class: 'rarity-dot' }), rarity.label, ' · ', getCategory(item.category)?.label, ' · ', getSub(item.category, item.sub)?.label)),
            ),
            item.desc ? h('p', { class: 'detail-desc' }, item.desc) : null,
            Object.keys(item.props).length || item.weight !== null
                ? h(
                    'dl',
                    { class: 'props' },
                    Object.entries(item.props).map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]),
                    item.weight !== null ? [h('dt', {}, 'Peso'), h('dd', {}, item.weight ? `${String(item.weight).replace('.', ',')} lb` : 'Insignificante')] : null,
                    item.bundle ? [h('dt', {}, 'Lote'), h('dd', {}, `${item.bundle} unidades`)] : null,
                )
                : null,
            h('p', { class: ['stock-line', `stock-${stock.tone}`] }, stock.text, extra ? h('small', {}, extra) : null),

            h(
                'section',
                { class: 'price-box' },
                h(
                    'div',
                    { class: 'price-main' },
                    h('div', {}, h('small', {}, quote.deal ? 'Precio pactado hoy' : 'Precio por unidad'), coins(quote.unit, { size: 'lg' })),
                    quote.deal ? h('s', { class: 'muted' }, formatCp(quote.listUnit)) : trendMark(quote.trend),
                ),
                h(
                    'details',
                    { class: 'why' },
                    h('summary', {}, '¿Por qué este precio?'),
                    h(
                        'ul',
                        { class: 'factors' },
                        h('li', { class: 'factor base' }, h('span', { 'aria-hidden': 'true' }, '📖'), h('span', {}, 'Valor de referencia'), h('b', {}, formatCp(item.price))),
                        quote.factors.map((f) => h('li', { class: ['factor', f.pct > 0 ? 'up' : 'down'] }, h('span', { 'aria-hidden': 'true' }, f.icon ?? '•'), h('span', {}, f.label), h('b', {}, pct(f.pct)))),
                    ),
                    h('div', { class: 'history' }, h('small', {}, 'Últimos días'), sparkline(history)),
                ),
                others.length
                    ? h(
                        'div',
                        { class: 'elsewhere' },
                        h('small', {}, 'En otras tiendas'),
                        h('ul', {}, others.map((r) => h('li', {}, h('button', { class: 'link', onclick: () => { selectShop(r.shop.id); selectItem(item.id); } }, r.shop.name), r.quote.available === 0 ? h('span', { class: 'muted' }, 'agotado') : coins(r.quote.listUnit, { size: 'sm' })))),
                    )
                    : null,
            ),

            h(
                'div',
                { class: 'buy-box' },
                maxQty > 1 ? qtyControl : null,
                h('div', { class: 'total' }, h('small', {}, 'Total'), coins(breakdown.total), breakdown.total > money ? h('small', { class: 'warn' }, `Te faltan ${formatCp(breakdown.total - money)}`) : null),
                breakdown.dealQty && breakdown.restQty ? h('small', { class: 'muted' }, `${breakdown.dealQty} al precio pactado y ${breakdown.restQty} a precio de lista.`) : null,
                h(
                    'div',
                    { class: 'buy-actions' },
                    h('button', { class: 'btn btn-primary', disabled: status.closed || quote.available === 0 || !state().character, onclick: () => doBuy(item.id, ui.qty) }, quote.available === 0 ? 'Agotado' : 'Comprar'),
                    h(
                        'button',
                        { class: 'btn btn-haggle', disabled: !haggle.ok || quote.available === 0 || status.closed, title: haggle.ok ? 'Habla con el vendedor para conseguir un mejor precio' : haggle.message, onclick: () => haggleBuy(item.id) },
                        haggle.resumable ? '💬 Retomar negociación' : '💬 Regatear',
                    ),
                ),
                !haggle.ok && quote.available !== 0 ? h('p', { class: 'muted small' }, haggle.message) : null,
            ),
        );
    }

    // ── Acciones ──
    function selectShop(id) {
        if (ui.shopId === id) return;
        ui.shopId = id;
        ui.category = 'all';
        ui.sub = null;
        ui.selectedItemId = null;
        ui.detailOpen = false;
        renderAll();
    }
    function setTab(tab) {
        ui.tab = tab;
        renderTabs();
        renderToolbar();
        renderContent();
    }
    function setCategory(id) {
        ui.category = id;
        ui.sub = null;
        renderToolbar();
        renderContent();
    }
    function setSub(id) {
        ui.sub = id;
        renderToolbar();
        renderContent();
    }
    function selectItem(id) {
        ui.selectedItemId = id;
        ui.qty = 1;
        ui.detailOpen = true;
        renderContent();
        renderDetail();
        if (window.matchMedia('(max-width: 1099px)').matches) detail.querySelector('.detail-close')?.focus();
    }
    function closeDetail() {
        ui.detailOpen = false;
        renderDetail();
    }
    function setQty(n) {
        ui.qty = Math.max(1, Math.trunc(n));
        renderDetail();
    }

    function cloudNote(cloud) {
        if (cloud === 'synced') return ' Copia en línea actualizada.';
        if (cloud === 'pending') return ' La copia en línea quedó pendiente: publícala desde la ficha.';
        return '';
    }

    async function doBuy(itemId, qty) {
        const result = await service.buy(ui.shopId, itemId, qty);
        if (result.error) return toast(result.error, 'error');
        const where = ctx.item(itemId).grant.kind === 'workshop-material' ? 'los materiales del Taller' : 'el inventario';
        toast(`Compraste ${qty} × ${ctx.item(itemId).name} por ${formatCp(result.ledger.total)}. Ya está en ${where} de ${state().character.identity.name || 'tu personaje'}.${cloudNote(result.cloud)}`, 'success');
    }
    async function doSell(itemId, qty) {
        const result = await service.sell(ui.shopId, itemId, qty);
        if (result.error) return toast(result.error, 'error');
        toast(`Vendiste ${qty} × ${ctx.item(itemId).name} por ${formatCp(result.ledger.total)}.${cloudNote(result.cloud)}`, 'success');
    }
    function haggleBuy(itemId) {
        openNegotiation({ service, shopId: ui.shopId, itemId, side: 'buy', qty: ui.qty, onToast: toast, onBuy: (qty) => doBuy(itemId, qty) });
    }
    function haggleSell(itemId, qty) {
        openNegotiation({ service, shopId: ui.shopId, itemId, side: 'sell', qty, onToast: toast, onSell: (q) => doSell(itemId, q) });
    }

    async function advance(days) {
        const res = await service.advanceDays(days);
        if (res.error) return toast(res.error, 'error');
        showReport(res.report, days);
    }

    /** Convierte el informe del día en frases: eventos y novedades primero, lo rutinario agrupado por tienda. */
    function summarize(report) {
        const lines = [];
        const name = (id) => ctx.item(id)?.name ?? id;
        const shopName = (id) => ctx.shop(id)?.name ?? id;
        const list = (names) => (names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} y ${names.length - 3} más`);
        for (const r of report) {
            const ev = r.eventId ? ctx.events.get(r.eventId) : null;
            if (r.type === 'event-start') lines.push({ icon: ev?.icon ?? '🔔', text: `${ev?.name}: ${ev?.notice}`, tone: 'event', order: 0 });
            if (r.type === 'event-end') lines.push({ icon: '✔️', text: `Terminó: ${ev?.name}.`, tone: 'muted', order: 3 });
            if (r.type === 'new-item') lines.push({ icon: '✨', text: `Nuevo en ${shopName(r.shopId)}: ${name(r.itemId)}.`, tone: 'rare', order: 1 });
            if (r.type === 'gone') lines.push({ icon: '💨', text: r.expired ? `${name(r.itemId)} ya no está en ${shopName(r.shopId)}: se lo llevaron a otro mercado.` : `Otro cliente compró ${name(r.itemId)} en ${shopName(r.shopId)}.`, tone: 'muted', order: 2 });
        }
        const byShop = (type) => {
            const map = new Map();
            for (const r of report.filter((x) => x.type === type)) map.set(r.shopId, [...(map.get(r.shopId) ?? []), r]);
            return map;
        };
        for (const [shopId, entries] of byShop('sold-out')) {
            lines.push({ icon: '🏃', text: `En ${shopName(shopId)} otros clientes agotaron: ${list(entries.map((e) => name(e.itemId)))}.`, tone: 'low', order: 4 });
        }
        for (const [shopId, entries] of byShop('arrival')) {
            lines.push({ icon: '📦', text: entries.length === 1 ? `${shopName(shopId)} recibió un lote de ${name(entries[0].itemId)}.` : `${shopName(shopId)} repuso ${entries.length} artículos (${list(entries.map((e) => name(e.itemId)))}).`, tone: 'ok', order: 5 });
        }
        return lines.sort((a, b) => a.order - b.order);
    }

    function showReport(report, days) {
        const lines = summarize(report);
        const shown = lines.slice(0, 16);
        const dialog = h(
            'dialog',
            { class: 'shop-dialog report-dialog', 'aria-label': 'Novedades del mercado' },
            h('header', {}, h('h2', {}, days === 1 ? `☀ Amanece el día ${state().world.day}` : `☀ Pasaron ${days} días · día ${state().world.day}`), h('button', { class: 'btn btn-icon', 'aria-label': 'Cerrar', onclick: () => dialog.close() }, '✕')),
            shown.length
                ? h('ul', { class: 'report' }, shown.map((d) => h('li', { class: `tone-${d.tone}` }, h('span', { 'aria-hidden': 'true' }, d.icon), d.text)))
                : h('p', { class: 'muted' }, 'Un día tranquilo: nada destacable en el mercado.'),
            lines.length > shown.length ? h('p', { class: 'muted small' }, `…y ${lines.length - shown.length} novedades más.`) : null,
            h('footer', {}, h('button', { class: 'btn btn-primary', onclick: () => dialog.close() }, 'Volver al mercado')),
        );
        dialog.addEventListener('close', () => dialog.remove());
        root.querySelector('.shop-root').append(dialog);
        dialog.showModal();
    }

    function openSettings() {
        const s = state();
        let confirmReset = false;
        const resetBtn = h('button', { class: 'btn btn-danger', onclick: async () => {
            if (!confirmReset) {
                confirmReset = true;
                resetBtn.textContent = '¿Seguro? Se pierden stock, relaciones y tratos. Pulsa otra vez.';
                return;
            }
            const res = await service.resetWorld();
            dialog.close();
            if (res?.error) toast(res.error, 'error');
            else toast('El mercado se reinició.', 'info');
        } }, 'Reiniciar el mercado');
        const dialog = h(
            'dialog',
            { class: 'shop-dialog settings-dialog', 'aria-label': 'Opciones de la tienda' },
            h('header', {}, h('h2', {}, '⚙ Opciones'), h('button', { class: 'btn btn-icon', 'aria-label': 'Cerrar', onclick: () => dialog.close() }, '✕')),
            h(
                'fieldset',
                {},
                h('legend', {}, 'Tiradas de habilidad al negociar'),
                h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'roll', checked: s.prefs.rollMode !== 'manual', onchange: () => service.setPref('rollMode', 'auto') }), 'Automáticas (la tienda tira el d20)'),
                h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'roll', checked: s.prefs.rollMode === 'manual', onchange: () => service.setPref('rollMode', 'manual') }), 'Las tiro yo (dados físicos)'),
            ),
            service.canControlTime
                ? h('fieldset', {}, h('legend', {}, 'Mercado'), h('p', { class: 'muted small' }, s.scope.kind === 'campaign' ? 'Reinicia el mercado de TODA la campaña: existencias, eventos, relaciones e historial. No toca las fichas ni sus monedas.' : 'Reinicia existencias, eventos, relaciones e historial de este dispositivo. No toca las fichas ni sus monedas.'), resetBtn)
                : null,
        );
        dialog.addEventListener('close', () => dialog.remove());
        root.querySelector('.shop-root').append(dialog);
        dialog.showModal();
    }

    function renderAll() {
        renderHeader();
        renderSigns();
        renderKeeper();
        renderTabs();
        renderToolbar();
        renderContent();
        renderDetail();
    }

    const unsubscribe = service.subscribe((_, change) => {
        if (change.type === 'error') toast(change.message, 'error');
        if (change.type === 'prefs') return;
        ctx = service.ctx;
        if (!ctx.shop(ui.shopId)) ui.shopId = ctx.shopList[0]?.id;
        if (ui.selectedItemId && !ctx.item(ui.selectedItemId)) ui.selectedItemId = null;
        if (change.type === 'negotiation') {
            // La negociación solo afecta a relación/detalle; evitar repintar todo.
            renderKeeper();
            renderDetail();
            if (ui.tab !== 'buy') renderContent();
            return;
        }
        renderAll();
    });

    const onKey = (e) => {
        if (e.key === 'Escape' && ui.detailOpen && !root.querySelector('dialog[open]')) closeDetail();
    };
    document.addEventListener('keydown', onKey);

    renderAll();
    return {
        destroy() {
            unsubscribe();
            document.removeEventListener('keydown', onKey);
            root.replaceChildren();
            root.classList.remove('shop-host');
        },
    };
}

