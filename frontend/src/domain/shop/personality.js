/**
 * Personalidad de los comerciantes: rasgos numéricos + arquetipos.
 *
 * Los arquetipos (data/shop/personalities.json) suman deltas a los rasgos y
 * activan comportamientos de un CATÁLOGO CERRADO (FLAGS). El motor sólo conoce
 * estos comportamientos; los datos los combinan como quieran, así que un
 * comerciante nuevo (oficial u Homebrew) no necesita código.
 */

export const FLAGS = Object.freeze({
    spontaneousDiscount: 'A veces rebaja porque sí',
    smallGifts: 'Hace pequeños regalos a quien le cae bien',
    loyaltyDiscount: 'Premia a los clientes fieles',
    exploitDesperation: 'Sube el precio si te nota desesperado',
    strangerWary: 'Desconfía de los desconocidos',
    demandsGuarantee: 'Pide garantías en compras caras',
    proud: 'Se ofende si le discuten el precio',
    sellsInformation: 'Vende información',
    bribable: 'El dinero le abre la boca',
    gossip: 'Cuenta rumores con facilidad',
    truthful: 'Nunca miente',
    hatesLiars: 'Detesta a los mentirosos',
    liar: 'Miente con naturalidad',
    drinks: 'Le gusta compartir una jarra',
    grudges: 'No olvida una ofensa',
    forgiving: 'Perdona pronto',
    lovesStories: 'Adora las buenas historias',
});

export const TRAIT_KEYS = Object.freeze(['greed', 'patience', 'pride', 'warmth', 'shrewdness']);
const DEFAULT_TRAITS = Object.freeze({ greed: 0.5, patience: 0.5, pride: 0.5, warmth: 0.5, shrewdness: 0.5 });

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function archetypesOf(ctx, keeper) {
    return (keeper?.archetypes ?? []).map((id) => ctx.archetypes?.get(id)).filter(Boolean);
}

/** Rasgos efectivos (base + arquetipos), en 0..1. */
export function effectiveTraits(ctx, keeper) {
    const out = { ...DEFAULT_TRAITS, ...(keeper?.baseTraits ?? keeper?.traits ?? {}) };
    for (const a of archetypesOf(ctx, keeper)) {
        for (const [k, v] of Object.entries(a.traits ?? {})) if (k in out) out[k] = out[k] + v;
    }
    for (const k of TRAIT_KEYS) out[k] = clamp01(Number(out[k]) || 0);
    return out;
}

export function flagsOf(ctx, keeper) {
    const set = new Set(keeper?.flags ?? []);
    for (const a of archetypesOf(ctx, keeper)) for (const f of a.flags ?? []) set.add(f);
    return set;
}

export function hasFlag(ctx, keeper, flag) {
    return flagsOf(ctx, keeper).has(flag);
}

/** Nombre visible: el disfraz hasta que se descubre quién es. */
export function displayKeeper(keeper, rel) {
    if (!keeper?.disguise) return keeper;
    if (rel?.secrets?.includes(keeper.disguise.revealedBy)) return keeper;
    return { ...keeper, name: keeper.disguise.name, short: keeper.disguise.short ?? keeper.disguise.name, portrait: keeper.disguise.portrait ?? keeper.portrait, title: keeper.disguise.title ?? keeper.title, bio: keeper.disguise.bio ?? 'Nadie sabe quién es.', disguised: true };
}
