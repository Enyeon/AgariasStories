import { describe, it, expect } from 'vitest';
import { createRpc } from '../src/services/api.js';

const reply = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });

describe('errores RPC de Supabase', () => {
  it('función inexistente (migración sin aplicar) → mensaje claro', async () => {
    const rpc = createRpc({ url: 'https://x.supabase.co', key: 'k', fetchImpl: reply(404, { code: 'PGRST202', message: 'Could not find the function public.share_create(document) in the schema cache' }) });
    await expect(rpc('share_create', {})).rejects.toMatchObject({ code: 'server_not_ready' });
  });
  it('código de negocio conocido se conserva', async () => {
    const rpc = createRpc({ url: 'https://x.supabase.co', key: 'k', fetchImpl: reply(400, { code: 'P0001', message: 'not_found' }) });
    await expect(rpc('share_get', {})).rejects.toMatchObject({ code: 'not_found' });
  });
});
