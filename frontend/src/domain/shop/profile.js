/**
 * Perfil del jugador tal como lo ve un comerciante.
 *
 * `buildProfile` resume la ficha (raza, clase, trasfondo, alineamiento,
 * personalidad, origen y facciones). Es puro: los nombres llegan por
 * `lookups` (el servicio pasa los de data/index.js), así el dominio no
 * importa datos de la app.
 *
 * `perceivedProfile` aplica la VISIBILIDAD: la raza y la clase se ven a
 * simple vista; el trasfondo, el origen, las facciones y los ideales sólo
 * cuentan si se los contaste (o si le mentiste y te creyó).
 */

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Familias de una raza (por nombre, sin tildes). */
export function raceFamilies(name, families = []) {
    const n = norm(name);
    if (!n) return [];
    return families.filter((f) => (f.match ?? []).some((m) => n.includes(norm(m))) && !(f.not ?? []).some((m) => n.includes(norm(m)))).map((f) => f.id);
}

const AXES = { legal: 'legal', caotico: 'caotico', bueno: 'bueno', malo: 'malvado', malvado: 'malvado' };

/** «Legal bueno» → ['legal', 'bueno']; «Neutral» → ['neutral']. */
export function alignmentAxes(name) {
    const words = norm(name).split(/\s+/).filter(Boolean);
    const axes = words.map((w) => AXES[w] ?? (w === 'neutral' ? 'neutral' : null)).filter(Boolean);
    return [...new Set(axes)];
}

/**
 * @param {object} character ficha normalizada
 * @param {{ raceName?: Function, className?: Function, backgroundName?: Function, families?: object[] }} lookups
 */
export function buildProfile(character, lookups = {}) {
    if (!character) return null;
    const { raceName = (k) => k ?? '', className = (k) => k ?? '', backgroundName = () => '', families = [] } = lookups;
    const race = raceName(character.race?.key) || '';
    const classKeys = [...new Set((character.levels ?? []).map((l) => l.classKey).filter(Boolean))];
    const bg = character.background ?? {};
    const bgName = backgroundName(bg) || '';
    const alignment = character.identity?.alignment ?? '';
    const p = character.personality ?? null;
    const aff = character.affiliations ?? null;
    return {
        name: character.identity?.name?.trim() || 'Forastero',
        race: { key: character.race?.key ?? null, name: race, families: raceFamilies(race, families) },
        classes: classKeys.map((k) => norm(className(k) || k)),
        // `set`: conjunto de rasgos de personalidad elegido (p. ej. «marinero»), cuenta como trasfondo.
        background: { key: bg.key ?? null, name: bgName, norm: norm(bgName || bg.key), set: p?.set ?? null },
        alignment: { name: alignment, axes: alignmentAxes(alignment) },
        origin: aff?.origin || null,
        factions: (aff?.factions ?? []).map((f) => (typeof f === 'string' ? f : f.id)).filter(Boolean),
        personality: p
            ? { ideal: p.ideal?.text ?? '', bond: p.bond?.text ?? '', flaw: p.flaw?.text ?? '', traits: (p.traits ?? []).map((t) => t?.text).filter(Boolean) }
            : { ideal: '', bond: '', flaw: '', traits: [] },
    };
}

/** Lo que el comerciante sabe (o cree saber) de ti. */
export function perceivedProfile(profile, rel) {
    if (!profile) return null;
    const told = rel?.told ?? {};
    const claims = rel?.claims ?? {};
    const toldFactions = (told.factions ?? []).filter((id) => profile.factions.includes(id));
    return {
        name: profile.name,
        race: profile.race,
        classes: profile.classes,
        background: told.background ? profile.background : claims.background ? { key: claims.background, name: claims.background, norm: norm(claims.background), claimed: true } : null,
        origin: told.origin ? profile.origin : claims.origin ?? null,
        factions: [...new Set([...toldFactions, ...(claims.factions ?? [])])],
        alignment: told.ideal ? profile.alignment : null,
        personality: {
            ideal: told.ideal ? profile.personality.ideal : '',
            bond: told.bond ? profile.personality.bond : '',
            flaw: told.flaw ? profile.personality.flaw : '',
        },
    };
}

/** Qué puede contar el jugador de sí mismo (sólo lo que existe en su ficha). */
export function tellableTopics(profile, factionsMap = new Map(), regionsMap = new Map()) {
    if (!profile) return [];
    const out = [];
    if (profile.background.name || profile.background.key || profile.background.set) out.push({ id: 'background', label: `Tu trasfondo (${profile.background.name || profile.background.key || profile.background.set})`, icon: '📜' });
    if (profile.origin) out.push({ id: 'origin', label: `De dónde vienes (${regionsMap.get(profile.origin)?.name ?? profile.origin})`, icon: '🧭' });
    for (const id of profile.factions) out.push({ id: `faction:${id}`, label: `Que perteneces a ${factionsMap.get(id)?.name ?? id}`, icon: factionsMap.get(id)?.icon ?? '🏳️' });
    if (profile.personality.ideal) out.push({ id: 'ideal', label: 'Tus ideales', icon: '✨', detail: profile.personality.ideal });
    if (profile.personality.bond) out.push({ id: 'bond', label: 'Tus vínculos', icon: '🔗', detail: profile.personality.bond });
    if (profile.personality.flaw) out.push({ id: 'flaw', label: 'Tus defectos', icon: '🩹', detail: profile.personality.flaw });
    return out;
}

/** ¿Cumple el perfil percibido esta condición `when`? (todas las claves deben cumplirse) */
export function matchesWhen(when, { perceived, rel, world, charId = null, activeEventIds = [] }) {
    if (!when || typeof when !== 'object') return true;
    for (const [key, raw] of Object.entries(when)) {
        const values = Array.isArray(raw) ? raw : [raw];
        switch (key) {
            case 'race':
                if (!perceived || !values.some((v) => perceived.race.families.includes(v) || norm(perceived.race.name) === norm(v))) return false;
                break;
            case 'class':
                if (!perceived || !values.some((v) => perceived.classes.some((c) => c.includes(norm(v))))) return false;
                break;
            case 'background':
                if (!perceived?.background || !values.some((v) => {
                    const b = perceived.background;
                    return norm(b.key) === norm(v) || b.set === v || b.norm.includes(norm(v).replace(/-/g, ' '));
                })) return false;
                break;
            case 'faction':
                if (!perceived || !values.some((v) => perceived.factions.includes(v))) return false;
                break;
            case 'origin':
                if (!perceived?.origin || !values.includes(perceived.origin)) return false;
                break;
            case 'alignment':
                if (!perceived?.alignment || !values.some((v) => perceived.alignment.axes.includes(norm(v)) || norm(perceived.alignment.name) === norm(v))) return false;
                break;
            case 'event':
                if (!values.some((v) => activeEventIds.includes(v))) return false;
                break;
            case 'memory':
                if (!values.some((v) => (rel?.memory?.[v]?.n ?? 0) > 0)) return false;
                break;
            case 'standing': {
                const s = raw ?? {};
                const value = world?.standing?.[charId ?? "_"]?.[s.faction] ?? 0;
                if (s.min !== undefined && value < s.min) return false;
                if (s.max !== undefined && value > s.max) return false;
                break;
            }
            default:
                return false; // condición desconocida: no se aplica (mejor que aplicarla mal)
        }
    }
    return true;
}
