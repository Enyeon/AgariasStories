// Ficha de una campaña: lo que el DM cuenta de ella (sinopsis, tipo, estilo,
// jugadores, niveles, horario, normas…). Vive en el servidor junto a la
// campaña (`agarias.campaigns.details`) y la ven todos sus miembros.
// Aquí sólo se valida la forma; el servidor vuelve a comprobar el tamaño.

export const CAMPAIGN_SYSTEMS = Object.freeze({ 'dnd5e-2014': 'D&D 5e (2014)', 'dnd5e-2024': 'D&D 5e (2024)', mixto: 'D&D 5e (mezcla 2014/2024)', otro: 'Otro sistema' });
export const CAMPAIGN_KINDS = Object.freeze({ campana: 'Campaña larga', aventura: 'Aventura corta (varias sesiones)', oneshot: 'One-shot (una sesión)', westmarches: 'West Marches (mesa abierta)', otra: 'Otra' });
export const CAMPAIGN_STYLES = Object.freeze({
  combate: '⚔️ Combate', exploracion: '🧭 Exploración', social: '🎭 Rol e interpretación', intriga: '🕵️ Intriga', misterio: '🔎 Misterio',
  terror: '🕯️ Terror', humor: '😄 Humor', politica: '👑 Política', supervivencia: '🏕️ Supervivencia', comercio: '💰 Comercio',
});
export const CAMPAIGN_TONES = Object.freeze({ heroico: 'Heroico', epico: 'Épico', oscuro: 'Oscuro', realista: 'Realista', desenfadado: 'Desenfadado' });
export const CAMPAIGN_MODALITIES = Object.freeze({ presencial: 'Presencial', online: 'En línea', mixta: 'Mixta' });
export const CAMPAIGN_STATUS = Object.freeze({ preparacion: '📝 En preparación', reclutando: '📣 Buscando jugadores', curso: '▶️ En curso', pausada: '⏸️ En pausa', terminada: '🏁 Terminada' });

const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : ''); // eslint-disable-line no-control-regex
const int = (v, min, max) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
const oneOf = (v, map) => (Object.hasOwn(map, v) ? v : null);
const lines = (v, maxItems, maxLen) => [...new Set((Array.isArray(v) ? v : String(v ?? '').split('\n')).map((x) => str(x, maxLen)).filter(Boolean))].slice(0, maxItems);
const ID = /^[a-z0-9][a-z0-9:_/-]{0,100}$/;

/** Normaliza la ficha. Devuelve {} si no hay nada (el servidor guarda '{}' por defecto). */
export function normalizeCampaignDetails(src) {
  const s = src && typeof src === 'object' ? src : {};
  let minPlayers = int(s.players?.min, 1, 12);
  let maxPlayers = int(s.players?.max, 1, 12);
  if (minPlayers && maxPlayers && minPlayers > maxPlayers) [minPlayers, maxPlayers] = [maxPlayers, minPlayers];
  let startLevel = int(s.levels?.start, 1, 20);
  let maxLevel = int(s.levels?.max, 1, 20);
  if (startLevel && maxLevel && startLevel > maxLevel) [startLevel, maxLevel] = [maxLevel, startLevel];
  const out = {
    synopsis: str(s.synopsis, 3000),
    setting: str(s.setting, 120),
    system: oneOf(s.system, CAMPAIGN_SYSTEMS),
    kind: oneOf(s.kind, CAMPAIGN_KINDS),
    status: oneOf(s.status, CAMPAIGN_STATUS),
    styles: [...new Set(Array.isArray(s.styles) ? s.styles : [])].filter((x) => Object.hasOwn(CAMPAIGN_STYLES, x)),
    tone: oneOf(s.tone, CAMPAIGN_TONES),
    modality: oneOf(s.modality, CAMPAIGN_MODALITIES),
    platform: str(s.platform, 80),
    schedule: str(s.schedule, 120),
    players: { min: minPlayers, max: maxPlayers },
    levels: { start: startLevel, max: maxLevel },
    dmName: str(s.dmName, 60),
    startLocation: typeof s.startLocation === 'string' && ID.test(s.startLocation) ? s.startLocation : null,
    houseRules: str(s.houseRules, 4000),
    safety: { lines: lines(s.safety?.lines, 20, 120), veils: lines(s.safety?.veils, 20, 120) },
  };
  // Quita lo vacío para que la ficha se guarde compacta.
  const clean = {};
  for (const [k, v] of Object.entries(out)) {
    if (v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const inner = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && !(Array.isArray(x) && !x.length)));
      if (Object.keys(inner).length) clean[k] = inner;
      continue;
    }
    clean[k] = v;
  }
  return clean;
}

/** Resumen corto para listas: «Campaña larga · En curso · 3–5 jugadores · nivel 1–10». */
export function campaignSummary(details) {
  const d = details ?? {};
  const players = d.players?.min || d.players?.max
    ? `${d.players.min ?? '?'}${d.players.max && d.players.max !== d.players.min ? `–${d.players.max}` : ''} jugadores`
    : null;
  const levels = d.levels?.start ? `nivel ${d.levels.start}${d.levels.max && d.levels.max !== d.levels.start ? `–${d.levels.max}` : ''}` : null;
  return [CAMPAIGN_KINDS[d.kind], CAMPAIGN_STATUS[d.status], players, levels].filter(Boolean).join(' · ');
}
