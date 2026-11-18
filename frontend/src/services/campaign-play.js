// Campañas en juego: miembros, PJ por campaña, registro y herramientas del DM.
//
// Las claves salen de las membresías guardadas en este dispositivo
// (services/homebrew.js). Las fichas de los PJ de campaña son COPIAS: el
// personaje original del jugador no se toca. La copia vive en el servidor y,
// en el dispositivo del jugador, también como un personaje más (id cp_…) que
// se abre en la ficha y en la Tienda como cualquier otro.

import { campaignApi as defaultApi, ApiError } from './api.js';
import { createDocument, campaignCopyId } from './characters.js';
import { parseDocument } from '../domain/validation.js';
import { pcSummary } from '../domain/campaign-play.js';

const MESSAGES = {
  forbidden: 'No tienes permiso para hacer eso en esta campaña (o tu acceso está pendiente o fue retirado).',
  not_found: 'No se encontró en la campaña (pudo eliminarse).',
  conflict: 'La ficha cambió mientras tanto. Inténtalo de nuevo.',
  payload_too_large: 'Se alcanzó el límite de la campaña (miembros, PJ o tamaño).',
  rate_limited: 'Hay demasiadas solicitudes pendientes en esta campaña. Pide al DM que las revise.',
  invalid: 'Los datos no son válidos.',
  server_not_ready: 'El servidor todavía no tiene las campañas con jugadores: hay que aplicar la migración 20261118000000_campanas_jugadores.sql en Supabase.',
};

/** Error con un texto para la persona usuaria (las RPC devuelven códigos). */
export function campaignError(err) {
  if (err instanceof ApiError && MESSAGES[err.code]) return Object.assign(new ApiError(err.code, MESSAGES[err.code], err.status), { userMessage: MESSAGES[err.code] });
  return err;
}
const wrap = (p) => p.catch((err) => { throw campaignError(err); });

export function createCampaignPlay({ api = defaultApi, homebrew, characters }) {
  const keyOf = (id) => {
    const key = homebrew.membership(id)?.key;
    if (!key) throw campaignError(new ApiError('forbidden', MESSAGES.forbidden));
    return key;
  };
  const dmKey = (id) => {
    const m = homebrew.membership(id);
    if (m?.role !== 'dm') throw campaignError(new ApiError('forbidden', MESSAGES.forbidden));
    return m.key;
  };
  const ownerKey = (id) => {
    const key = homebrew.ownerKey(id);
    if (!key) throw campaignError(new ApiError('forbidden', MESSAGES.forbidden));
    return key;
  };

  /** Adaptador para services/characters.js (copias de PJ guardadas en el dispositivo). */
  const pcRemote = {
    get: (campaignId, pcId) => wrap(api.pcGet(campaignId, ownerKey(campaignId), pcId)),
    save: (campaignId, pcId, payload) => wrap(api.pcSave(campaignId, ownerKey(campaignId), pcId, payload)),
  };

  /**
   * Aplica una herramienta del DM a un PJ: lee la última versión, aplica `fn`
   * (→ { character, events } | { error }) y guarda con control de revisión.
   * Si alguien guardó a la vez, vuelve a leer y repite (una vez).
   */
  async function dmApply(campaignId, pcId, fn) {
    const key = dmKey(campaignId);
    for (let attempt = 0; attempt < 2; attempt++) {
      const remote = await wrap(api.pcGet(campaignId, key, pcId));
      const { character } = parseDocument(remote.document);
      const res = fn(character);
      if (res.error) return res;
      try {
        const saved = await api.pcSave(campaignId, key, pcId, {
          document: createDocument(res.character), summary: pcSummary(res.character), revision: remote.revision, events: res.events ?? [],
        });
        return { ...res, revision: saved.revision };
      } catch (err) {
        if (err instanceof ApiError && err.code === 'conflict' && attempt === 0) continue;
        throw campaignError(err);
      }
    }
    return { error: MESSAGES.conflict };
  }

  async function pcMeta(campaignId, pcId, key, change) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remote = await wrap(api.pcGet(campaignId, key, pcId));
      try {
        return await api.pcSave(campaignId, key, pcId, { revision: remote.revision, ...change });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'conflict' && attempt === 0) continue;
        throw campaignError(err);
      }
    }
    return null;
  }

  return {
    pcRemote,

    me: (id) => wrap(api.me(id, homebrew.ownerKey(id))),
    roster: (id) => wrap(api.roster(id, keyOf(id))),
    events: (id, opts) => wrap(api.events(id, keyOf(id), opts)),
    addEvent: (id, event) => wrap(api.eventAdd(id, keyOf(id), event)),
    pcGet: (id, pcId) => wrap(api.pcGet(id, homebrew.ownerKey(id) ?? keyOf(id), pcId)),

    // DM
    approveMember: (id, memberId) => wrap(api.memberUpdate(id, dmKey(id), memberId, { status: 'activo' })),
    expelMember: (id, memberId) => wrap(api.memberUpdate(id, dmKey(id), memberId, { status: 'expulsado' })),
    removeMember: (id, memberId) => wrap(api.memberUpdate(id, dmKey(id), memberId, { status: 'eliminar' })),
    setMemberRole: (id, memberId, role) => wrap(api.memberUpdate(id, dmKey(id), memberId, { role })),
    setOpenInvite: (id, open) => wrap(api.setAccess(id, dmKey(id), open)),
    reviewPc: (id, pcId, status) => wrap(api.pcReview(id, dmKey(id), pcId, status)),
    setPcState: (id, pcId, state) => pcMeta(id, pcId, dmKey(id), { state }),
    startSession: (id, title, chapterId = null) => wrap(api.sessionStart(id, dmKey(id), title, chapterId)),
    sessions: (id) => wrap(api.sessionsList(id, keyOf(id))),
    saveChapter: (id, chapter) => wrap(api.chapterUpsert(id, dmKey(id), chapter)),
    updateSession: (id, sessionId, fields) => wrap(api.sessionUpdate(id, dmKey(id), sessionId, fields)),

    // Mundo
    world: (id) => wrap(api.worldList(id, keyOf(id))),
    saveWorld: (id, entry) => wrap(api.worldUpsert(id, keyOf(id), entry)),
    deleteWorld: (id, entryId) => wrap(api.worldDelete(id, keyOf(id), entryId)),

    /**
     * Da un objeto (índice + nombre) y/o monedas ({cp,sp,gp,pp}) de la copia
     * local de un PJ a otro PJ de la campaña. Antes se sube lo pendiente; luego
     * el servidor cambia las dos fichas a la vez y aquí se trae la nueva versión.
     */
    async transfer(recordId, toPc, { itemIndex = null, itemName = null, qty = 1, coins = null } = {}) {
      let opened = await characters.open(recordId);
      let pc = opened?.record.pc;
      if (!pc) throw campaignError(new ApiError('not_found', MESSAGES.not_found));
      if (pc.dirty) {
        await characters.save(opened.record, opened.character);
        opened = await characters.open(recordId);
        pc = opened.record.pc;
      }
      const res = await wrap(api.pcTransfer(pc.campaignId, ownerKey(pc.campaignId), { fromPc: pc.pcId, toPc, revision: pc.revision, itemIndex, itemName, qty, coins }));
      await characters.refreshCopy(recordId);
      return res;
    },
    endSession: (id) => wrap(api.sessionEnd(id, dmKey(id))),
    dmApply,

    /** El dueño (o el DM) cambia quién ve la ficha completa. */
    setPcPrivacy: (id, pcId, privacy) => pcMeta(id, pcId, homebrew.membership(id)?.role === 'dm' ? dmKey(id) : ownerKey(id), { privacy }),

    /**
     * Vincula una COPIA de un personaje de este dispositivo a la campaña. El
     * original no cambia; la copia queda en «Tus personajes» con la insignia de
     * la campaña y es la que usan la Tienda y el DM.
     */
    async linkCharacter(campaignId, recordId) {
      const opened = await characters.open(recordId);
      if (!opened) throw Object.assign(new Error('Personaje no encontrado.'), { userMessage: 'Ese personaje ya no existe en este dispositivo.' });
      const m = homebrew.membership(campaignId);
      const copy = structuredClone(opened.character);
      copy.campaign = { id: campaignId, name: m?.name ?? '' };
      const res = await wrap(api.pcLink(campaignId, ownerKey(campaignId), createDocument(copy), pcSummary(copy)));
      return characters.adoptCampaignCopy({ campaignId, campaignName: m?.name ?? '', pcId: res.pcId, revision: res.revision, status: res.status, updatedAt: res.updatedAt }, copy);
    },

    /** Descarga en este dispositivo la copia de un PJ propio (p. ej. desde otro dispositivo). */
    async openMine(campaignId, pcId) {
      const local = await characters.open(campaignCopyId(campaignId, pcId)).catch(() => null);
      if (local) {
        await characters.refreshCopy(local.record.id).catch(() => null);
        return local.record.id;
      }
      const remote = await wrap(api.pcGet(campaignId, ownerKey(campaignId), pcId));
      const { character } = parseDocument(remote.document);
      const rec = await characters.adoptCampaignCopy({
        campaignId, campaignName: homebrew.membership(campaignId)?.name ?? '', pcId, revision: remote.revision,
        status: remote.status, state: remote.state, privacy: remote.privacy, updatedAt: remote.updatedAt,
      }, character);
      return rec.id;
    },
  };
}
