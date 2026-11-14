/**
 * Panel «🌍 Mundo» del DM: regiones, facciones, comerciantes y eventos de la
 * Tienda, con lo que cada uno tiene conectado (quién está dónde, qué facción
 * opera en qué región, qué eventos afectan a cada sitio) y botones para crear
 * o editar cualquiera de ellos — también los oficiales — con el editor Homebrew.
 *
 * Sólo lo ve el DM (en local, el dueño del dispositivo). Lo que guarda va al
 * paquete de la campaña ya publicado, o al Homebrew local.
 */

import { h, replace } from './dom.js';
import { openContentEditor } from '../components/content-editor.js';
import { setWorldEditingPack } from '../../content/world-options.js';
import { CONTENT_TYPES } from '../../content/schema.js';

const TABS = [
    { id: 'carpeta', label: '📁 Carpeta del DM' },
    { id: 'region', label: '🗺️ Regiones' },
    { id: 'faccion', label: '🏳️ Facciones' },
    { id: 'mercader', label: '🧑‍💼 Comerciantes' },
    { id: 'evento', label: '📰 Eventos' },
];

export function openWorldAdmin(root, service, { toast }) {
    let tab = 'carpeta';
    const body = h('div', { class: 'world-admin' });
    const dialog = h(
        'dialog',
        { class: 'shop-dialog world-dialog wide', 'aria-label': 'Mundo de la Tienda' },
        h('header', {}, h('h2', {}, '🌍 Mundo de la Tienda'), h('button', { class: 'btn btn-icon', 'aria-label': 'Cerrar', onclick: () => dialog.close() }, '✕')),
        h('div', { class: 'world-dialog-body' }, body),
    );
    dialog.addEventListener('close', () => dialog.remove());
    root.querySelector('.shop-root').append(dialog);
    dialog.showModal();

    async function edit(type, id = null) {
        setWorldEditingPack(service.worldPackId());
        const current = id ? service.worldEditorData(type, id) : null;
        const label = CONTENT_TYPES[type].label.toLowerCase();
        dialog.close();
        const item = await openContentEditor(type, current?.data ?? null, {
            title: id ? `Editar ${label}: ${current?.data?.name ?? id}` : `Nuevo: ${label}`,
            note: current && !current.homebrew && current.data?.base
                ? 'Estás modificando un elemento oficial: se guarda como una capa del DM encima del original (con el mismo identificador, así no se pierden relaciones ni memoria). Para volver al original, retira esta entrada en Homebrew.'
                : 'Se guarda publicado en el mundo de tu campaña (o en tu Homebrew local si no hay campaña).',
            draftKey: `mundo:${type}:${id ?? 'nuevo'}`,
        });
        if (item) {
            const res = await service.saveWorld(type, item, current?.contentId ?? null);
            if (res.error) toast(res.error, 'error');
            else toast(`«${item.name}» guardado en el mundo.`, 'success');
        }
        openWorldAdmin(root, service, { toast }).select(tab);
    }

    /** Editor de una tienda de la carpeta (nueva, copia o existente) en el paquete indicado. */
    async function editShop(folder, contentId = null, preset = null) {
        setWorldEditingPack(folder.id);
        const current = contentId ? service.dmShopData(folder.id, contentId) : preset;
        dialog.close();
        const item = await openContentEditor('mercader', current, {
            title: contentId ? `Editar tienda: ${current?.shopName || current?.name}` : `Nueva tienda en ${folder.name}`,
            note: `Se guarda en la carpeta «${folder.name}». ${folder.kind === 'campaign' ? 'Sólo existe en esa campaña: los jugadores la ven al entrar en su mercado.' : 'Sólo existe en este dispositivo.'} No cambia nada oficial.`,
            draftKey: `carpeta:${folder.id}:${contentId ?? (preset?.copyOf ? `copia-${preset.copyOf}` : 'nueva')}`,
        });
        if (item) {
            const res = await service.saveWorld('mercader', item, contentId, folder.id);
            if (res.error) toast(res.error, 'error');
            else toast(`«${item.shopName || item.name}» guardada en ${folder.name}.`, 'success');
        }
        openWorldAdmin(root, service, { toast }).select('carpeta');
    }

    function renderFolder() {
        const folders = service.dmFolders();
        const officials = service.officialMerchants();
        if (!folders.length) return h('p', { class: 'muted' }, 'Aún no eres DM de ninguna campaña en este dispositivo. Crea una en Homebrew → Campañas.');
        return h('div', { class: 'dm-folders' },
            h('p', { class: 'muted small admin-intro' }, 'Tus tiendas propias, separadas de lo oficial. Cada carpeta es una campaña: sus tiendas sólo existen en ella y las ven sus jugadores. Para cambiar una tienda oficial en el mundo abierto, usa la pestaña «🧑‍💼 Comerciantes».'),
            folders.map((f) => {
                const copyPick = h('select', { class: 'sort-select', 'aria-label': 'Tienda oficial que copiar' },
                    h('option', { value: '' }, '📄 Copiar una tienda oficial…'),
                    officials.filter((o) => o.shop).map((o) => h('option', { value: o.id }, `${o.shop} (${o.name})`)));
                copyPick.addEventListener('change', () => {
                    if (copyPick.value) editShop(f, null, service.officialCopy(copyPick.value));
                });
                const shopCard = (s, modified = false) => h('article', { class: 'admin-card' },
                    h('header', {},
                        h('b', {}, `${s.shopIcon} ${s.shopName}`),
                        modified ? h('span', { class: 'tag' }, `Modifica a ${s.base}`) : s.copyOf ? h('span', { class: 'tag' }, `Copia de ${s.copyOf}`) : h('span', { class: 'tag' }, 'Propia'),
                        s.status !== 'publicado' ? h('span', { class: 'tag warn' }, s.status) : null,
                        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => editShop(f, s.contentId) }, '✏️ Editar')),
                    h('p', { class: 'small muted' }, `${s.portrait} ${s.name} · 📍 ${s.location}`, s.extras ? ` · ${s.extras} productos añadidos` : '', s.prices ? ` · ${s.prices} precios propios` : ''),
                    modified ? null : h('button', { class: 'btn btn-sm btn-ghost', onclick: async (e) => {
                        const b = e.currentTarget;
                        if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = '¿Seguro? Pulsa otra vez'; return; }
                        const res = await service.retireDmShop(f.id, s.ref);
                        toast(res.error ?? 'Tienda retirada.', res.error ? 'error' : 'success');
                        render();
                    } }, '🗑️ Retirar'));
                return h('section', { class: ['dm-folder', f.current && 'is-current'] },
                    h('header', { class: 'dm-folder-head' },
                        h('h3', {}, `${f.kind === 'campaign' ? '🎲' : '💾'} ${f.name}`),
                        f.current ? h('span', { class: 'tag' }, 'Abierta ahora') : f.kind === 'campaign'
                            ? h('button', { class: 'btn btn-sm btn-ghost', title: 'Entrar al mercado de esta campaña como DM', onclick: async () => { dialog.close(); await service.enterCampaignAsDm(f.id); toast(`Mercado de ${f.name} abierto como DM.`, 'success'); } }, '🏪 Abrir su mercado')
                            : null),
                    h('div', { class: 'admin-actions' },
                        h('button', { class: 'btn btn-sm btn-primary', onclick: () => editShop(f) }, '➕ Nueva tienda'),
                        copyPick),
                    f.shops.length ? h('div', { class: 'admin-grid' }, f.shops.map((s) => shopCard(s))) : h('p', { class: 'small muted' }, 'Todavía no hay tiendas propias en esta carpeta.'),
                    f.modified.length ? h('details', { class: 'small' }, h('summary', {}, `Comerciantes oficiales modificados aquí (${f.modified.length})`), h('div', { class: 'admin-grid' }, f.modified.map((s) => shopCard(s, true)))) : null);
            }));
    }

    const editBtn = (type, id) => h('button', { class: 'btn btn-sm btn-ghost', onclick: () => edit(type, id) }, '✏️ Editar');
    const badge = (x) => (x?.homebrew ? h('span', { class: 'tag' }, x.kinds?.includes('modificado') || x.base ? 'Modificado' : 'Homebrew') : null);

    function render() {
        const o = service.worldOverview();
        const tabs = h('nav', { class: 'admin-tabs', role: 'tablist' }, TABS.map((t) => h('button', { class: ['tab', t.id === tab && 'active'], role: 'tab', 'aria-selected': String(t.id === tab), onclick: () => { tab = t.id; render(); } }, t.label)));
        if (tab === 'carpeta') {
            replace(body, tabs, renderFolder());
            return;
        }
        const add = h('button', { class: 'btn btn-sm btn-primary', onclick: () => edit(tab) }, `➕ Nuevo: ${CONTENT_TYPES[tab].label.toLowerCase()}`);
        let list;
        if (tab === 'region') {
            list = o.regions.map(({ region: r, factions, merchants, events }) => h(
                'article',
                { class: 'admin-card' },
                h('header', {}, h('b', {}, `${r.icon} ${r.name}`), badge(r), editBtn('region', r.id)),
                h('p', { class: 'small muted' }, [r.type || r.economy?.kind, `peligro ${r.danger ?? 0}/5`, (r.races ?? []).length ? `razas: ${r.races.join(', ')}` : null].filter(Boolean).join(' · ')),
                factions.length ? h('p', { class: 'small' }, 'Facciones: ', factions.map((f) => `${f.icon} ${f.name}`).join(', ')) : null,
                h('p', { class: 'small' }, `Lugares: ${(r.locations ?? []).map((l) => `${l.icon} ${l.name}${l.hidden ? ' (oculto)' : ''}`).join(', ') || '—'}`),
                h('p', { class: 'small' }, `Comerciantes hoy: ${merchants.map((m) => `${m.keeper.portrait} ${m.keeper.short ?? m.keeper.name}`).join(', ') || 'nadie'}`),
                events.length ? h('p', { class: 'small warn' }, 'Eventos activos: ', events.map((e) => `${e.icon} ${e.name}`).join(', ')) : null,
                (r.economy?.modifiers ?? []).length ? h('details', { class: 'small' }, h('summary', {}, `Economía (${r.economy.modifiers.length} reglas)`), h('ul', {}, r.economy.modifiers.map((m) => h('li', {}, `${m.pct > 0 ? '+' : ''}${Math.round(m.pct * 100)} % · ${m.label}`)))) : null,
            ));
        } else if (tab === 'faccion') {
            list = o.factions.map(({ faction: f, merchants, allies, rivals }) => h(
                'article',
                { class: 'admin-card' },
                h('header', {}, h('b', {}, `${f.icon} ${f.name}`), badge(f), editBtn('faccion', f.id)),
                f.ideology ? h('p', { class: 'small' }, `«${f.ideology}»`) : null,
                h('p', { class: 'small muted' }, [allies.length ? `aliados: ${allies.join(', ')}` : null, rivals.length ? `rivales: ${rivals.join(', ')}` : null, (f.goods ?? []).length ? `mercancías: ${f.goods.join(', ')}` : null].filter(Boolean).join(' · ') || 'Sin aliados ni rivales.'),
                h('p', { class: 'small' }, `Comerciantes: ${merchants.map((m) => `${m.keeper.portrait} ${m.keeper.short ?? m.keeper.name}`).join(', ') || 'ninguno'}`),
            ));
        } else if (tab === 'mercader') {
            list = o.merchants.map(({ keeper: k, location, profession, contract }) => h(
                'article',
                { class: 'admin-card' },
                h('header', {}, h('b', {}, `${k.portrait} ${k.name}`), badge(k), editBtn('mercader', k.id)),
                h('p', { class: 'small muted' }, [k.title, profession ? `${profession.icon} ${profession.label}` : null, k.race, k.faction ? o.factions.find((x) => x.faction.id === k.faction)?.faction.name : null].filter(Boolean).join(' · ')),
                h('p', { class: 'small' }, location ? `📍 ${location.name}` : '🐪 De viaje', k.schedule?.hoursLabel ? ` · ${k.schedule.hoursLabel}` : '', k.schedule?.events?.length ? ' · sólo en eventos' : '', k.secret ? ' · secreto' : '', contract ? ' · contratado' : ''),
                h('p', { class: 'small muted' }, [k.negotiation?.enabled === false ? 'no regatea' : null, k.hire?.enabled ? 'contratable' : null, k.reputation?.refuseEnemies ? 'rechaza a enemigos de su facción' : null, (k.attitudes ?? []).length ? `${k.attitudes.length} actitudes` : null].filter(Boolean).join(' · ')),
                k.secret ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
                    const res = await service.dm('reveal', { keeperId: k.id });
                    toast(res.error ?? `${k.short ?? k.name} ya es visible para este personaje.`, res.error ? 'error' : 'success');
                } }, '👁️ Revelar a este personaje') : null,
            ));
        } else {
            list = o.events.map((e) => h(
                'article',
                { class: 'admin-card' },
                h('header', {}, h('b', {}, `${e.icon} ${e.name}`), badge(e), editBtn('evento', e.id)),
                h('p', { class: 'small muted' }, [e.manual ? 'sólo manual' : 'aleatorio', e.regions?.length ? `regiones: ${e.regions.join(', ')}` : 'todas las regiones', `${e.duration?.[0] ?? '?'}–${e.duration?.[1] ?? '?'} días`].join(' · ')),
                e.notice ? h('p', { class: 'small' }, e.notice) : null,
            ));
        }
        replace(
            body,
            tabs,
            h('p', { class: 'muted small admin-intro' }, `🏛️ Mundo abierto: ${service.market.name}. Aquí puedes modificar también lo oficial (como una capa encima, sin borrarlo). `, 'Todo está conectado: la región da economía, razas y peligro; la facción, reputación y mercancías; el comerciante, personalidad, prejuicios, horarios y catálogo. Lo que cambies aquí lo verán todos los jugadores de la campaña.'),
            o.problems.length ? h('details', { class: 'admin-problems' }, h('summary', {}, `⚠️ ${o.problems.length} referencias rotas`), h('ul', {}, o.problems.map((p) => h('li', { class: 'small' }, p)))) : null,
            h('div', { class: 'admin-actions' }, add),
            h('div', { class: 'admin-grid' }, list),
        );
    }
    render();
    return { select(id) { tab = id; render(); } };
}
