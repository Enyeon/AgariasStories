/**
 * Agrupa los datos estáticos que necesita el dominio (catálogo, tiendas,
 * vendedores, eventos, diálogos). Es inmutable y se pasa a todas las funciones:
 * el dominio no importa JSON ni toca el DOM.
 */
export function createShopContext({ catalog, shops = [], keepers = [], events = [], dialogue = {}, topics = [] }) {
    const shopMap = new Map(shops.map((s) => [s.id, s]));
    const keeperMap = new Map(keepers.map((k) => [k.id, k]));
    const eventMap = new Map(events.map((e) => [e.id, e]));
    const topicMap = new Map(topics.map((t) => [t.id, t]));
    const problems = [];
    for (const shop of shops) {
        if (!keeperMap.has(shop.keeperId)) problems.push(`La tienda «${shop.id}» apunta a un vendedor inexistente («${shop.keeperId}»).`);
    }
    return Object.freeze({
        catalog,
        dialogue,
        shops: shopMap,
        keepers: keeperMap,
        events: eventMap,
        topics: topicMap,
        shopList: shops,
        problems: [...(catalog.errors ?? []), ...problems],
        shop(id) {
            return shopMap.get(id) ?? null;
        },
        keeperOf(shopId) {
            return keeperMap.get(shopMap.get(shopId)?.keeperId) ?? null;
        },
        item(id) {
            return catalog.get(id);
        },
    });
}
