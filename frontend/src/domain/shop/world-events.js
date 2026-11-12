/**
 * Eventos del mundo activos (los usan precios, simulación, presencia y trato).
 * Un evento entra y sale de forma gradual (intensidad 0..1).
 */

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

export function eventIntensity(evState, day, ramp = 2) {
    if (day < evState.start || day > evState.end) return 0;
    const rampIn = (day - evState.start + 1) / ramp;
    const rampOut = (evState.end - day + 1) / ramp;
    return clamp(Math.min(rampIn, rampOut), 0, 1);
}

export function activeEvents(world, ctx, day = world.day) {
    return world.events
        .map((state) => ({ state, def: ctx.events.get(state.id), intensity: eventIntensity(state, day) }))
        .filter((e) => e.def && e.intensity > 0);
}

/** ¿Afecta el evento a esta región? (sin `regions` = a todas) */
export function eventReaches(def, regionId) {
    return !def.regions?.length || (regionId && def.regions.includes(regionId));
}
