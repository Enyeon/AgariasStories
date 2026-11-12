/**
 * Aleatoriedad determinista para la Tienda.
 *
 * Toda la simulación usa generadores con semilla derivada de (semilla del mundo,
 * tienda, día, ...). Así el mismo mundo produce siempre el mismo resultado:
 * se puede reproducir, depurar y, más adelante, verificar en el servidor.
 */

/** Hash de cadena → entero de 32 bits (cyrb53 recortado). */
export function hashString(input) {
    const str = String(input);
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i += 1) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
}

/** Generador mulberry32: devuelve una función que produce floats en [0, 1). */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Crea un RNG con utilidades a partir de varias claves. */
export function createRng(...keys) {
    const next = mulberry32(hashString(keys.join('|')));
    return {
        next,
        /** Entero en [min, max] (ambos incluidos). */
        int(min, max) {
            return min + Math.floor(next() * (max - min + 1));
        },
        /** Float en [min, max). */
        range(min, max) {
            return min + next() * (max - min);
        },
        chance(probability) {
            return next() < probability;
        },
        pick(list) {
            return list.length ? list[Math.floor(next() * list.length)] : undefined;
        },
        /** Elige según pesos: [{ weight, ... }]. */
        weighted(list, weightOf = (entry) => entry.weight ?? 1) {
            const total = list.reduce((sum, entry) => sum + Math.max(0, weightOf(entry)), 0);
            if (total <= 0) return undefined;
            let roll = next() * total;
            for (const entry of list) {
                roll -= Math.max(0, weightOf(entry));
                if (roll < 0) return entry;
            }
            return list[list.length - 1];
        },
        shuffle(list) {
            const copy = list.slice();
            for (let i = copy.length - 1; i > 0; i -= 1) {
                const j = Math.floor(next() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        },
        /** Muestra de Poisson (Knuth); suficiente para tasas pequeñas. */
        poisson(lambda) {
            if (!(lambda > 0)) return 0;
            if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * (next() + next() + next() - 1.5) * 2));
            const limit = Math.exp(-lambda);
            let k = 0;
            let p = 1;
            do {
                k += 1;
                p *= next();
            } while (p > limit);
            return k - 1;
        },
    };
}

/**
 * Ruido de valor 1D suave (interpolación coseno). Devuelve un valor en [-1, 1]
 * que cambia lentamente con `t`: ideal para tendencias de mercado creíbles.
 */
export function smoothNoise(seedKey, t) {
    const i = Math.floor(t);
    const frac = t - i;
    const a = mulberry32(hashString(`${seedKey}|${i}`))() * 2 - 1;
    const b = mulberry32(hashString(`${seedKey}|${i + 1}`))() * 2 - 1;
    const w = (1 - Math.cos(frac * Math.PI)) / 2;
    return a * (1 - w) + b * w;
}
