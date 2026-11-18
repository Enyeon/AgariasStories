-- Stories of Agarias · Campañas fase 3 (AgSt 1.26): Mundo, sesiones y
-- capítulos, e intercambio de objetos y monedas entre PJ.
--
-- Cambio ADITIVO e idempotente (requiere 20261118000000_campanas_jugadores.sql).
-- No modifica datos existentes. Recrea events_list y session_start con un
-- parámetro opcional más (las llamadas antiguas siguen funcionando).
--
-- Mundo (campaign_world): lugares, PNJ, facciones, misiones, pistas y notas.
--   reveal = 'oculto'  → sólo el DM (aún no descubierto)
--            'todos'   → toda la campaña
--            'algunos' → los miembros de revealed_to (y el DM)
--            'autor'   → nota privada de un jugador: SÓLO su autor (ni el DM)
--   `secret` (notas del DM) nunca sale del servidor para quien no es DM.
--   Al descubrir algo o cerrar una misión se anota en el registro.
--
-- Nota: el «Mundo de la Tienda» (regiones, facciones y eventos económicos del
-- Homebrew) sigue en campaign_content; esto es el mundo narrativo.

-- ── Mundo ───────────────────────────────────────────────────────────────────

create table if not exists agarias.campaign_world (
  campaign_id text not null references agarias.campaigns(id) on delete cascade,
  entry_id text not null check (entry_id ~ '^[a-z0-9]{6,24}$'),
  kind text not null check (kind in ('lugar','pnj','faccion','mision','pista','nota')),
  title text not null check (char_length(title) between 1 and 120),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 20000),
  secret jsonb not null default '{}'::jsonb check (jsonb_typeof(secret) = 'object' and octet_length(secret::text) <= 20000),
  author text not null default 'dm' check (author in ('dm','jugador')),
  member_id text,
  reveal text not null default 'oculto' check (reveal in ('oculto','todos','algunos','autor')),
  revealed_to text[] not null default '{}',
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, entry_id)
);
alter table agarias.campaign_world enable row level security;

create or replace function agarias.world_json(w agarias.campaign_world, with_secret boolean)
returns jsonb language sql immutable set search_path = pg_catalog, agarias as $$
  select jsonb_build_object('entryId', w.entry_id, 'kind', w.kind, 'title', w.title, 'data', w.data,
    'author', w.author, 'memberId', w.member_id, 'reveal', w.reveal,
    'revealedTo', case when with_secret then to_jsonb(w.revealed_to) end,
    'revealedAt', w.revealed_at, 'updatedAt', w.updated_at, 'createdAt', w.created_at)
  || case when with_secret then jsonb_build_object('secret', w.secret) else '{}'::jsonb end
$$;

create or replace function agarias.world_kind_label(kind text)
returns text language sql immutable as $$
  select case kind when 'lugar' then 'lugar' when 'pnj' then 'personaje' when 'faccion' then 'facción'
    when 'mision' then 'misión' when 'pista' then 'pista' else 'nota' end
$$;

/** Lo que el que pregunta puede ver del Mundo. */
create or replace function public.world_list(campaign_id text, key text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, agarias as $$
declare
  a jsonb := agarias.active_actor(campaign_id, key);
  is_dm boolean := a->>'role' = 'dm';
  me text := a->>'memberId';
  out jsonb;
begin
  select coalesce(jsonb_agg(agarias.world_json(w, is_dm) order by w.kind, lower(w.title)), '[]'::jsonb) into out
    from agarias.campaign_world w
   where w.campaign_id = world_list.campaign_id
     and (case
            when w.reveal = 'autor' then me is not null and w.member_id = me
            when is_dm then true
            when w.reveal = 'todos' then true
            when w.reveal = 'algunos' then me is not null and me = any(w.revealed_to)
            else w.author = 'jugador' and me is not null and w.member_id = me
          end);
  return jsonb_build_object('entries', out);
end $$;

/**
 * Crea o edita una entrada. El DM: cualquiera de las suyas. Un miembro: sólo
 * sus notas (privadas o compartidas). Descubrir algo o cerrar una misión se
 * anota en el registro.
 */
create or replace function public.world_upsert(campaign_id text, key text, entry_id text, kind text, title text,
                                               data jsonb default '{}'::jsonb, secret jsonb default '{}'::jsonb,
                                               reveal text default null, revealed_to text[] default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare
  a jsonb := agarias.active_actor(campaign_id, key);
  is_dm boolean := a->>'role' = 'dm';
  me text := a->>'memberId';
  eid text := coalesce(entry_id, agarias.short_id());
  prev agarias.campaign_world;
  w agarias.campaign_world;
  new_reveal text;
  new_to text[];
  label text;
  m text;
  q_prev text;
  q_new text;
begin
  if not is_dm and me is null then perform agarias.fail('forbidden'); end if;
  if kind is null or kind not in ('lugar','pnj','faccion','mision','pista','nota') then perform agarias.fail('invalid'); end if;
  if char_length(btrim(coalesce(title, ''))) = 0 then perform agarias.fail('invalid'); end if;
  if data is null or jsonb_typeof(data) <> 'object' then data := '{}'::jsonb; end if;
  if secret is null or jsonb_typeof(secret) <> 'object' then secret := '{}'::jsonb; end if;

  select * into prev from agarias.campaign_world t where t.campaign_id = world_upsert.campaign_id and t.entry_id = eid for update;
  if found then
    if prev.kind <> world_upsert.kind then perform agarias.fail('invalid'); end if;
    if prev.author = 'dm' and not is_dm then perform agarias.fail('forbidden'); end if;
    if prev.author = 'jugador' and prev.member_id is distinct from me then perform agarias.fail('forbidden'); end if;
  elsif (select count(*) from agarias.campaign_world t where t.campaign_id = world_upsert.campaign_id) >= 1500 then
    perform agarias.fail('payload_too_large');
  end if;

  if is_dm and coalesce(prev.author, 'dm') = 'dm' then
    new_reveal := coalesce(reveal, prev.reveal, 'oculto');
    if new_reveal not in ('oculto','todos','algunos') then perform agarias.fail('invalid'); end if;
    new_to := case when new_reveal = 'algunos' then coalesce(revealed_to, prev.revealed_to, '{}') else '{}' end;
    -- Sólo miembros reales de la campaña.
    select coalesce(array_agg(x), '{}') into new_to from unnest(new_to) x
     where exists (select 1 from agarias.campaign_members cm where cm.campaign_id = world_upsert.campaign_id and cm.member_id = x);
  else
    -- Notas de jugador (también si el DM escribe una nota propia: autor = él).
    if world_upsert.kind <> 'nota' then perform agarias.fail('forbidden'); end if;
    new_reveal := coalesce(reveal, prev.reveal, 'autor');
    if new_reveal not in ('autor','todos') then perform agarias.fail('invalid'); end if;
    new_to := '{}';
    secret := '{}'::jsonb;
  end if;

  insert into agarias.campaign_world as t (campaign_id, entry_id, kind, title, data, secret, author, member_id, reveal, revealed_to, revealed_at)
  values (world_upsert.campaign_id, eid, world_upsert.kind, left(btrim(title), 120), data, secret,
          case when is_dm then 'dm' else 'jugador' end, case when is_dm then null else me end,
          new_reveal, new_to, case when new_reveal in ('todos','algunos') then now() end)
  on conflict on constraint campaign_world_pkey do update
     set title = excluded.title, data = excluded.data,
         secret = case when t.author = 'dm' then excluded.secret else '{}'::jsonb end,
         reveal = excluded.reveal, revealed_to = excluded.revealed_to,
         revealed_at = case when excluded.reveal in ('todos','algunos') and t.reveal not in ('todos','algunos') then now() else t.revealed_at end,
         updated_at = now()
  returning * into w;

  -- Registro: descubrimientos y misiones (sólo entradas del DM).
  if w.author = 'dm' then
    label := agarias.world_kind_label(w.kind);
    if w.reveal = 'todos' and coalesce(prev.reveal, 'oculto') <> 'todos' then
      perform agarias.log_event(w.campaign_id, null, null, 'dm', 'descubrimiento',
        'Descubren ' || case when w.kind = 'mision' then 'la misión' else 'un ' || label end || ': ' || w.title || '.',
        jsonb_build_object('entryId', w.entry_id, 'kind', w.kind), 'publico');
    elsif w.reveal = 'algunos' then
      foreach m in array w.revealed_to loop
        if prev.entry_id is null or prev.reveal <> 'algunos' or not (m = any(prev.revealed_to)) then
          perform agarias.log_event(w.campaign_id, null, m, 'dm', 'descubrimiento',
            'Descubres ' || case when w.kind = 'mision' then 'la misión' else 'un ' || label end || ': ' || w.title || '.',
            jsonb_build_object('entryId', w.entry_id, 'kind', w.kind), 'privado');
        end if;
      end loop;
    end if;
    q_prev := prev.data->'quest'->>'status';
    q_new := w.data->'quest'->>'status';
    if w.kind = 'mision' and w.reveal = 'todos' and prev.entry_id is not null and q_new is distinct from q_prev
       and q_new in ('completada','fallida') then
      perform agarias.log_event(w.campaign_id, null, null, 'dm', 'mision',
        'Misión ' || case when q_new = 'completada' then 'completada' else 'fallida' end || ': ' || w.title || '.',
        jsonb_build_object('entryId', w.entry_id, 'status', q_new), 'publico');
    end if;
  end if;
  return agarias.world_json(w, is_dm);
end $$;

create or replace function public.world_delete(campaign_id text, key text, entry_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare
  a jsonb := agarias.active_actor(campaign_id, key);
  w agarias.campaign_world;
begin
  select * into w from agarias.campaign_world t where t.campaign_id = world_delete.campaign_id and t.entry_id = world_delete.entry_id for update;
  if not found then perform agarias.fail('not_found'); end if;
  if not ((w.author = 'dm' and a->>'role' = 'dm') or (w.author = 'jugador' and w.member_id = a->>'memberId')) then
    perform agarias.fail('forbidden');
  end if;
  delete from agarias.campaign_world t where t.campaign_id = w.campaign_id and t.entry_id = w.entry_id;
  return jsonb_build_object('entryId', w.entry_id, 'deleted', true);
end $$;

-- ── Sesiones y capítulos ────────────────────────────────────────────────────

create table if not exists agarias.campaign_chapters (
  campaign_id text not null references agarias.campaigns(id) on delete cascade,
  chapter_id int not null,
  title text not null check (char_length(title) between 1 and 120),
  summary text not null default '' check (char_length(summary) <= 4000),
  created_at timestamptz not null default now(),
  primary key (campaign_id, chapter_id)
);
alter table agarias.campaign_chapters enable row level security;

alter table agarias.campaign_sessions add column if not exists chapter_id int;
alter table agarias.campaign_sessions add column if not exists summary text not null default '';
alter table agarias.campaign_sessions add column if not exists dm_notes text not null default '';
do $$ begin
  alter table agarias.campaign_sessions add constraint campaign_sessions_summary_len check (char_length(summary) <= 4000 and char_length(dm_notes) <= 4000);
exception when duplicate_object then null; end $$;

/** Capítulos y sesiones (las notas del DM sólo para el DM). */
create or replace function public.sessions_list(campaign_id text, key text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, agarias as $$
declare
  a jsonb := agarias.active_actor(campaign_id, key);
  is_dm boolean := a->>'role' = 'dm';
  chapters jsonb;
  sessions jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('chapterId', c.chapter_id, 'title', c.title, 'summary', c.summary, 'createdAt', c.created_at)
           order by c.chapter_id), '[]'::jsonb) into chapters
    from agarias.campaign_chapters c where c.campaign_id = sessions_list.campaign_id;
  select coalesce(jsonb_agg(jsonb_build_object('sessionId', s.session_id, 'title', s.title, 'chapterId', s.chapter_id,
           'summary', s.summary, 'dmNotes', case when is_dm then s.dm_notes end, 'startedAt', s.started_at, 'endedAt', s.ended_at,
           'events', (select count(*) from agarias.campaign_events e where e.campaign_id = s.campaign_id and e.session_id = s.session_id
                       and (is_dm or e.visibility = 'publico')))
           order by s.session_id), '[]'::jsonb) into sessions
    from agarias.campaign_sessions s where s.campaign_id = sessions_list.campaign_id;
  return jsonb_build_object('chapters', chapters, 'sessions', sessions, 'current', agarias.open_session(campaign_id));
end $$;

create or replace function public.chapter_upsert(campaign_id text, dm_key text, chapter_id int default null, title text default '', summary text default '')
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare n int := chapter_id;
begin
  if agarias.role_for(campaign_id, dm_key) <> 'dm' then perform agarias.fail('forbidden'); end if;
  if char_length(btrim(coalesce(title, ''))) = 0 or char_length(title) > 120 or char_length(coalesce(summary, '')) > 4000 then perform agarias.fail('invalid'); end if;
  if n is null then
    if (select count(*) from agarias.campaign_chapters c where c.campaign_id = chapter_upsert.campaign_id) >= 200 then perform agarias.fail('payload_too_large'); end if;
    select coalesce(max(c.chapter_id), 0) + 1 into n from agarias.campaign_chapters c where c.campaign_id = chapter_upsert.campaign_id;
    insert into agarias.campaign_chapters (campaign_id, chapter_id, title, summary) values (chapter_upsert.campaign_id, n, btrim(title), coalesce(summary, ''));
    perform agarias.log_event(chapter_upsert.campaign_id, null, null, 'sistema', 'capitulo', 'Comienza el capítulo ' || n || ': ' || btrim(title) || '.', '{}'::jsonb, 'publico');
  else
    update agarias.campaign_chapters c set title = btrim(chapter_upsert.title), summary = coalesce(chapter_upsert.summary, '')
     where c.campaign_id = chapter_upsert.campaign_id and c.chapter_id = n;
    if not found then perform agarias.fail('not_found'); end if;
  end if;
  return jsonb_build_object('chapterId', n);
end $$;

create or replace function public.session_update(campaign_id text, dm_key text, session_id int, title text, summary text default '',
                                                  dm_notes text default '', chapter_id int default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
begin
  if agarias.role_for(campaign_id, dm_key) <> 'dm' then perform agarias.fail('forbidden'); end if;
  if char_length(coalesce(title, '')) > 120 or char_length(coalesce(summary, '')) > 4000 or char_length(coalesce(dm_notes, '')) > 4000 then perform agarias.fail('invalid'); end if;
  if chapter_id is not null and not exists (select 1 from agarias.campaign_chapters c where c.campaign_id = session_update.campaign_id and c.chapter_id = session_update.chapter_id) then
    perform agarias.fail('not_found');
  end if;
  update agarias.campaign_sessions s set title = btrim(coalesce(session_update.title, '')), summary = coalesce(session_update.summary, ''),
         dm_notes = coalesce(session_update.dm_notes, ''), chapter_id = session_update.chapter_id
   where s.campaign_id = session_update.campaign_id and s.session_id = session_update.session_id;
  if not found then perform agarias.fail('not_found'); end if;
  return jsonb_build_object('sessionId', session_id);
end $$;

-- Empezar sesión: ahora queda en el último capítulo (o en el indicado).
drop function if exists public.session_start(text, text, text);
create or replace function public.session_start(campaign_id text, dm_key text, title text default '', chapter_id int default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare
  n int;
  ch int := chapter_id;
begin
  if agarias.role_for(campaign_id, dm_key) <> 'dm' then perform agarias.fail('forbidden'); end if;
  if char_length(coalesce(title, '')) > 120 then perform agarias.fail('invalid'); end if;
  if ch is null then select max(c.chapter_id) into ch from agarias.campaign_chapters c where c.campaign_id = session_start.campaign_id; end if;
  update agarias.campaign_sessions s set ended_at = now() where s.campaign_id = session_start.campaign_id and s.ended_at is null;
  select coalesce(max(s.session_id), 0) + 1 into n from agarias.campaign_sessions s where s.campaign_id = session_start.campaign_id;
  insert into agarias.campaign_sessions (campaign_id, session_id, title, chapter_id) values (session_start.campaign_id, n, btrim(coalesce(title, '')), ch);
  perform agarias.log_event(session_start.campaign_id, null, null, 'sistema', 'sesion',
    'Empieza la sesión ' || n || coalesce(nullif(': ' || btrim(coalesce(title, '')), ': '), '') || '.', '{}'::jsonb, 'publico');
  return jsonb_build_object('session', n, 'chapterId', ch);
end $$;

-- Registro: ahora también se puede filtrar por sesión.
drop function if exists public.events_list(text, text, bigint, text, int);
create or replace function public.events_list(campaign_id text, key text, before_id bigint default null, pc_id text default null,
                                              lim int default 50, session int default null)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, agarias as $$
declare
  a jsonb := agarias.active_actor(campaign_id, key);
  is_dm boolean := a->>'role' = 'dm';
  me text := a->>'memberId';
  out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'pcId', e.pc_id, 'memberId', e.member_id, 'author', e.author, 'kind', e.kind, 'text', e.text,
           'data', e.data, 'visibility', e.visibility, 'day', e.day, 'sessionId', e.session_id, 'createdAt', e.created_at)
           order by e.id desc), '[]'::jsonb)
    into out
    from (select * from agarias.campaign_events e
           where e.campaign_id = events_list.campaign_id
             and (before_id is null or e.id < before_id)
             and (events_list.pc_id is null or e.pc_id = events_list.pc_id)
             and (events_list.session is null or e.session_id = events_list.session)
             and (is_dm or e.visibility = 'publico'
                  or (me is not null and e.member_id = me and (e.visibility = 'privado' or (e.visibility = 'dm' and e.author = 'jugador'))))
           order by e.id desc
           limit greatest(1, least(coalesce(lim, 50), 200))) e;
  return jsonb_build_object('events', out);
end $$;

-- ── Intercambio entre PJ ────────────────────────────────────────────────────

/** Nombre normalizado para juntar objetos iguales. */
create or replace function agarias.item_key(it jsonb)
returns text language sql immutable as $$
  select lower(btrim(coalesce(it->>'name', ''))) || '|' || coalesce(it->>'ref', '')
$$;

/**
 * Da objetos y/o monedas de un PJ a otro de la misma campaña, de forma
 * atómica (las dos fichas a la vez). Lo hace el dueño del PJ que da (o el DM).
 *   item_index/item_name: objeto del inventario (el nombre se comprueba);
 *   coins: {cp,sp,gp,pp} por denominación (mismo sistema de monedas).
 * `expected_revision`: revisión de la ficha del que da (para no pisar cambios).
 */
create or replace function public.pc_transfer(campaign_id text, key text, from_pc text, to_pc text, expected_revision int,
                                              item_index int default null, item_name text default null, qty int default 1,
                                              coins jsonb default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare
  a jsonb := agarias.active_actor(campaign_id, key);
  is_dm boolean := a->>'role' = 'dm';
  me text := a->>'memberId';
  src agarias.campaign_characters;
  dst agarias.campaign_characters;
  s_items jsonb;
  d_items jsonb;
  it jsonb;
  have int;
  give int;
  k text;
  i int;
  found_at int;
  s_coins jsonb;
  d_coins jsonb;
  c text;
  n bigint;
  parts text[] := '{}';
  what text;
  s_name text;
  d_name text;
begin
  if from_pc = to_pc then perform agarias.fail('invalid'); end if;
  -- Bloqueo en orden fijo para no interbloquear dos intercambios cruzados.
  perform 1 from agarias.campaign_characters t where t.campaign_id = pc_transfer.campaign_id and t.pc_id in (from_pc, to_pc) order by t.pc_id for update;
  select * into src from agarias.campaign_characters t where t.campaign_id = pc_transfer.campaign_id and t.pc_id = from_pc;
  if not found then perform agarias.fail('not_found'); end if;
  select * into dst from agarias.campaign_characters t where t.campaign_id = pc_transfer.campaign_id and t.pc_id = to_pc;
  if not found then perform agarias.fail('not_found'); end if;
  if not is_dm and not (me is not null and src.member_id = me and a->>'role' = 'jugador') then perform agarias.fail('forbidden'); end if;
  if src.status <> 'activo' or dst.status <> 'activo' then perform agarias.fail('forbidden'); end if;
  if not is_dm and src.state = 'muerto' then perform agarias.fail('forbidden'); end if;
  if expected_revision is null or expected_revision <> src.revision then perform agarias.fail('conflict'); end if;

  s_name := coalesce(nullif(src.summary->>'name', ''), 'Un PJ');
  d_name := coalesce(nullif(dst.summary->>'name', ''), 'otro PJ');
  s_items := coalesce(src.document->'character'->'equipment'->'items', '[]'::jsonb);
  d_items := coalesce(dst.document->'character'->'equipment'->'items', '[]'::jsonb);

  if item_index is not null then
    it := s_items->item_index;
    if it is null or lower(btrim(it->>'name')) <> lower(btrim(coalesce(item_name, ''))) then perform agarias.fail('conflict'); end if;
    have := greatest(coalesce((it->>'quantity')::int, 1), 0);
    give := least(greatest(coalesce(qty, 1), 1), have);
    if give < 1 then perform agarias.fail('invalid'); end if;
    -- Del que da: resta o quita la línea.
    if give >= have then
      s_items := s_items - item_index;
    else
      s_items := jsonb_set(s_items, array[item_index::text, 'quantity'], to_jsonb(have - give));
    end if;
    -- Al que recibe: se suma a uno igual sin equipar; si no, línea nueva (sin equipar ni sintonizar).
    k := agarias.item_key(it);
    found_at := null;
    for i in 0 .. jsonb_array_length(d_items) - 1 loop
      if agarias.item_key(d_items->i) = k and coalesce((d_items->i->>'equipped')::boolean, false) = false then found_at := i; exit; end if;
    end loop;
    if found_at is not null then
      d_items := jsonb_set(d_items, array[found_at::text, 'quantity'], to_jsonb(coalesce((d_items->found_at->>'quantity')::int, 1) + give));
    else
      if jsonb_array_length(d_items) >= 500 then perform agarias.fail('payload_too_large'); end if;
      d_items := d_items || jsonb_build_array((it - 'equipped' - 'attuned') || jsonb_build_object('quantity', give));
    end if;
    parts := parts || ((case when give > 1 then give || '× ' else '' end) || btrim(it->>'name'));
  end if;

  if coins is not null and jsonb_typeof(coins) = 'object' then
    s_coins := coalesce(src.document->'character'->'equipment'->'coins', '{}'::jsonb);
    d_coins := coalesce(dst.document->'character'->'equipment'->'coins', '{}'::jsonb);
    if coalesce(s_coins->>'system', 'dnd') <> coalesce(d_coins->>'system', 'dnd') then perform agarias.fail('invalid'); end if;
    foreach c in array array['pp','gp','sp','cp'] loop
      n := greatest(coalesce((coins->>c)::bigint, 0), 0);
      continue when n = 0;
      if coalesce((s_coins->>c)::bigint, 0) < n then perform agarias.fail('invalid'); end if;
      s_coins := jsonb_set(s_coins, array[c], to_jsonb(coalesce((s_coins->>c)::bigint, 0) - n));
      d_coins := jsonb_set(d_coins, array[c], to_jsonb(coalesce((d_coins->>c)::bigint, 0) + n));
      parts := parts || (n || ' ' || case c when 'pp' then 'ppt' when 'gp' then 'po' when 'sp' then 'pp' else 'pc' end);
    end loop;
  end if;
  if coalesce(array_length(parts, 1), 0) = 0 then perform agarias.fail('invalid'); end if;

  update agarias.campaign_characters t
     set document = jsonb_set(case when s_coins is null then t.document else jsonb_set(t.document, '{character,equipment,coins}', s_coins) end,
                              '{character,equipment,items}', s_items),
         revision = t.revision + 1, updated_at = now()
   where t.campaign_id = src.campaign_id and t.pc_id = src.pc_id returning * into src;
  update agarias.campaign_characters t
     set document = jsonb_set(case when d_coins is null then t.document else jsonb_set(t.document, '{character,equipment,coins}', d_coins) end,
                              '{character,equipment,items}', d_items),
         revision = t.revision + 1, updated_at = now()
   where t.campaign_id = dst.campaign_id and t.pc_id = dst.pc_id returning * into dst;

  what := array_to_string(parts, ', ');
  perform agarias.log_event(src.campaign_id, src.pc_id, src.member_id, case when is_dm then 'dm' else 'jugador' end, 'objeto',
    s_name || ' da ' || what || ' a ' || d_name || '.', jsonb_build_object('to', dst.pc_id), 'privado');
  perform agarias.log_event(dst.campaign_id, dst.pc_id, dst.member_id, case when is_dm then 'dm' else 'jugador' end, 'objeto',
    d_name || ' recibe ' || what || ' de ' || s_name || '.', jsonb_build_object('from', src.pc_id), 'privado');
  return jsonb_build_object('fromRevision', src.revision, 'toRevision', dst.revision, 'given', what);
end $$;

-- ── Permisos ────────────────────────────────────────────────────────────────

do $$
declare f text;
begin
  foreach f in array array['agarias.world_json(agarias.campaign_world,boolean)', 'agarias.world_kind_label(text)', 'agarias.item_key(jsonb)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array[
    'world_list(text,text)', 'world_upsert(text,text,text,text,text,jsonb,jsonb,text,text[])', 'world_delete(text,text,text)',
    'sessions_list(text,text)', 'chapter_upsert(text,text,int,text,text)', 'session_update(text,text,int,text,text,text,int)',
    'session_start(text,text,text,int)', 'events_list(text,text,bigint,text,int,int)',
    'pc_transfer(text,text,text,text,int,int,text,int,jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function public.%s to anon, authenticated', f);
    end if;
  end loop;
end $$;
