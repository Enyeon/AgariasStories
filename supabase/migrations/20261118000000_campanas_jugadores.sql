-- Stories of Agarias · Campañas con jugadores (AgSt 1.24).
--
-- Flujo: el DM crea la campaña → comparte el enlace de invitación → cada
-- jugador u observador pide entrar con su nombre y recibe una CLAVE PERSONAL
-- (sólo en su dispositivo) → elige su PJ → el DM aprueba al jugador y su PJ.
--
-- Cambio ADITIVO e idempotente. No borra ni reescribe datos:
--   * campaigns.open_invite: las campañas que YA existen quedan en `true`, así
--     el código de invitación sigue dando acceso de jugador como hasta ahora
--     (nadie pierde el acceso). Las campañas nuevas empiezan en `false`: el
--     código sólo sirve para PEDIR entrar y el DM aprueba a cada persona.
--   * Tablas nuevas: campaign_members, campaign_characters (copia del PJ por
--     campaña: el original del jugador no se toca), campaign_events (registro)
--     y campaign_sessions (preparada para sesiones y capítulos).
--   * role_for reconoce las claves personales; los observadores no pueden
--     guardar el mercado ni proponer Homebrew (se redefinen esas dos funciones
--     con la única diferencia de esa comprobación).
--
-- Privacidad del registro (campaign_events.visibility):
--   publico  → toda la campaña;
--   privado  → el jugador dueño del PJ (o autor) y el DM;
--   dm       → sólo el DM (si lo escribió un jugador, también su autor).

alter table agarias.campaigns add column if not exists open_invite boolean not null default true;
alter table agarias.campaigns alter column open_invite set default false;

create table if not exists agarias.campaign_members (
  campaign_id text not null references agarias.campaigns(id) on delete cascade,
  member_id text not null check (member_id ~ '^[a-z0-9]{6,24}$'),
  key_hash text not null,
  name text not null check (char_length(name) between 1 and 60),
  role text not null default 'jugador' check (role in ('jugador','observador')),
  status text not null default 'pendiente' check (status in ('pendiente','activo','expulsado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (campaign_id, member_id)
);
alter table agarias.campaign_members enable row level security;
create unique index if not exists campaign_members_key on agarias.campaign_members (campaign_id, key_hash);

create table if not exists agarias.campaign_characters (
  campaign_id text not null references agarias.campaigns(id) on delete cascade,
  pc_id text not null check (pc_id ~ '^[a-z0-9]{6,24}$'),
  member_id text,
  document jsonb not null,
  summary jsonb not null default '{}'::jsonb,
  status text not null default 'pendiente' check (status in ('pendiente','activo','desvinculado')),
  state text not null default 'vivo' check (state in ('vivo','muerto','retirado')),
  privacy text not null default 'resumen' check (privacy in ('publico','resumen','privado')),
  revision int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, pc_id)
);
alter table agarias.campaign_characters enable row level security;
create index if not exists campaign_characters_member on agarias.campaign_characters (campaign_id, member_id);

create table if not exists agarias.campaign_sessions (
  campaign_id text not null references agarias.campaigns(id) on delete cascade,
  session_id int not null,
  title text not null default '' check (char_length(title) <= 120),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (campaign_id, session_id)
);
alter table agarias.campaign_sessions enable row level security;

create table if not exists agarias.campaign_events (
  id bigint generated always as identity primary key,
  campaign_id text not null references agarias.campaigns(id) on delete cascade,
  pc_id text,
  member_id text,
  author text not null check (author in ('dm','jugador','sistema')),
  kind text not null check (kind ~ '^[a-z_]{2,24}$'),
  text text not null check (char_length(text) between 1 and 500),
  data jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 4000),
  visibility text not null default 'publico' check (visibility in ('publico','privado','dm')),
  day int,
  session_id int,
  created_at timestamptz not null default now()
);
alter table agarias.campaign_events enable row level security;
create index if not exists campaign_events_by_campaign on agarias.campaign_events (campaign_id, id desc);

-- ── Utilidades ──────────────────────────────────────────────────────────────

create or replace function agarias.short_id()
returns text language sql volatile set search_path = pg_catalog, agarias as $$
  select regexp_replace(lower(agarias.token(9)), '[^a-z0-9]', 'x', 'g')
$$;

/** Quién llama: {role: dm|jugador|observador, status, memberId|null, legacy}. Falla si la clave no vale. */
create or replace function agarias.actor(camp_id text, key text)
returns jsonb language plpgsql stable set search_path = pg_catalog, agarias as $$
declare
  c agarias.campaigns;
  m agarias.campaign_members;
begin
  select * into c from agarias.campaigns where id = camp_id;
  if not found then perform agarias.fail('not_found'); end if;
  if c.dm_key_hash = agarias.hash(key) then
    return jsonb_build_object('role', 'dm', 'status', 'activo', 'memberId', null, 'legacy', false);
  end if;
  select * into m from agarias.campaign_members cm where cm.campaign_id = camp_id and cm.key_hash = agarias.hash(key);
  if found then
    if m.status = 'expulsado' then perform agarias.fail('forbidden'); end if;
    return jsonb_build_object('role', m.role, 'status', m.status, 'memberId', m.member_id, 'name', m.name, 'legacy', false);
  end if;
  if c.open_invite and c.invite_hash = agarias.hash(key) then
    return jsonb_build_object('role', 'jugador', 'status', 'activo', 'memberId', null, 'legacy', true);
  end if;
  perform agarias.fail('forbidden');
  return null;
end $$;

/** Igual que antes, más claves personales. Sólo devuelve un rol a quien ya está aprobado. */
create or replace function agarias.role_for(camp_id text, key text)
returns text language plpgsql stable set search_path = pg_catalog, agarias as $$
declare a jsonb := agarias.actor(camp_id, key);
begin
  if a->>'status' <> 'activo' then perform agarias.fail('forbidden'); end if;
  return a->>'role';
end $$;

/** Actor aprobado (no pendiente). */
create or replace function agarias.active_actor(camp_id text, key text)
returns jsonb language plpgsql stable set search_path = pg_catalog, agarias as $$
declare a jsonb := agarias.actor(camp_id, key);
begin
  if a->>'status' <> 'activo' then perform agarias.fail('forbidden'); end if;
  return a;
end $$;

create or replace function agarias.check_summary(summary jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog as $$
begin
  if summary is null then return '{}'::jsonb; end if;
  if jsonb_typeof(summary) <> 'object' then perform agarias.fail('invalid'); end if;
  if octet_length(summary::text) > 4000 then perform agarias.fail('payload_too_large'); end if;
  return summary;
end $$;

create or replace function agarias.open_session(camp_id text)
returns int language sql stable set search_path = pg_catalog, agarias as $$
  select s.session_id from agarias.campaign_sessions s
   where s.campaign_id = camp_id and s.ended_at is null order by s.session_id desc limit 1
$$;

create or replace function agarias.log_event(camp_id text, pc text, member text, author text, kind text, txt text,
                                             data jsonb default '{}'::jsonb, visibility text default 'publico', day int default null)
returns bigint language plpgsql set search_path = pg_catalog, agarias as $$
declare new_id bigint;
begin
  if kind is null or kind !~ '^[a-z_]{2,24}$' then perform agarias.fail('invalid'); end if;
  if char_length(btrim(coalesce(txt, ''))) = 0 then perform agarias.fail('invalid'); end if;
  if visibility not in ('publico','privado','dm') then perform agarias.fail('invalid'); end if;
  if data is null or jsonb_typeof(data) <> 'object' then data := '{}'::jsonb; end if;
  if octet_length(data::text) > 4000 then perform agarias.fail('payload_too_large'); end if;
  insert into agarias.campaign_events (campaign_id, pc_id, member_id, author, kind, text, data, visibility, day, session_id)
  values (camp_id, pc, member, author, kind, left(btrim(txt), 500), data, visibility, day, agarias.open_session(camp_id))
  returning id into new_id;
  return new_id;
end $$;

/** El documento del PJ siempre apunta a su campaña (Homebrew y mercado de esa campaña). */
create or replace function agarias.pc_document(camp_id text, doc jsonb)
returns jsonb language plpgsql stable set search_path = pg_catalog, agarias as $$
declare
  c agarias.campaigns;
  d jsonb;
begin
  select * into c from agarias.campaigns where id = camp_id;
  if doc is null or jsonb_typeof(doc) <> 'object' or jsonb_typeof(doc->'character') <> 'object' then perform agarias.fail('invalid'); end if;
  d := jsonb_set(doc, '{character,campaign}', jsonb_build_object('id', c.id, 'name', c.name));
  perform agarias.check_document(d);
  return d;
end $$;

-- ── Observadores: ni guardan el mercado ni proponen Homebrew ───────────────

create or replace function public.shop_market_save(campaign_id text, key text, world jsonb, expected_revision int default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare
  r text := agarias.role_for(campaign_id, key);
  m agarias.shop_markets;
begin
  if r = 'observador' then perform agarias.fail('forbidden'); end if;
  perform agarias.check_market(world);
  select * into m from agarias.shop_markets sm where sm.campaign_id = shop_market_save.campaign_id for update;
  if not found then
    if coalesce(expected_revision, 0) <> 0 then perform agarias.fail('conflict'); end if;
    if r <> 'dm' and (coalesce(world->'reports', '[]'::jsonb) <> '[]'::jsonb or world ? 'progress') then perform agarias.fail('forbidden'); end if;
    insert into agarias.shop_markets (campaign_id, world) values (shop_market_save.campaign_id, world) returning * into m;
    return jsonb_build_object('revision', m.revision, 'updatedAt', m.updated_at);
  end if;
  if expected_revision is null or expected_revision <> m.revision then perform agarias.fail('conflict'); end if;
  if r <> 'dm' then
    if (world->>'day') is distinct from (m.world->>'day') or (world->>'seed') is distinct from (m.world->>'seed') then
      perform agarias.fail('forbidden');
    end if;
    if coalesce(world->'reports', '[]'::jsonb) is distinct from coalesce(m.world->'reports', '[]'::jsonb) then
      perform agarias.fail('forbidden');
    end if;
    if (world->'progress') is distinct from (m.world->'progress') then
      perform agarias.fail('forbidden');
    end if;
  end if;
  update agarias.shop_markets sm
     set world = shop_market_save.world, revision = sm.revision + 1, updated_at = now()
   where sm.campaign_id = shop_market_save.campaign_id returning * into m;
  return jsonb_build_object('revision', m.revision, 'updatedAt', m.updated_at);
end $$;

create or replace function public.content_upsert(campaign_id text, key text, type text, data jsonb, content_id text default null, status text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare
  r text := agarias.role_for(campaign_id, key);
  rules jsonb;
  cid text := coalesce(content_id, lower(regexp_replace(agarias.token(9), '[^a-zA-Z0-9]', 'x', 'g')));
  existing agarias.campaign_content;
  new_status text;
  row agarias.campaign_content;
begin
  if r = 'observador' then perform agarias.fail('forbidden'); end if;
  if type not in ('clase','raza','hechizo','dote','trasfondo','objeto','criatura','rasgo','extension','mercader','region','faccion','evento','otro') then perform agarias.fail('invalid'); end if;
  if data is null or jsonb_typeof(data) <> 'object' or char_length(coalesce(btrim(data->>'name'), '')) = 0 then perform agarias.fail('invalid'); end if;
  if octet_length(data::text) > 200000 then perform agarias.fail('payload_too_large'); end if;
  if (select count(*) from agarias.campaign_content where campaign_content.campaign_id = content_upsert.campaign_id) >= 1000
     and content_id is null then perform agarias.fail('payload_too_large'); end if;

  select c.rules into rules from agarias.campaigns c where c.id = campaign_id;
  select * into existing from agarias.campaign_content cc where cc.campaign_id = content_upsert.campaign_id and cc.content_id = cid;
  if found and existing.type <> content_upsert.type then perform agarias.fail('invalid'); end if;

  if content_upsert.type in ('mercader','region','faccion','evento') and r <> 'dm' then perform agarias.fail('forbidden'); end if;

  if r = 'dm' then
    new_status := coalesce(status, existing.status, 'borrador');
    if new_status not in ('borrador','propuesto','publicado','oculto','retirado') then perform agarias.fail('invalid'); end if;
  else
    if coalesce(rules->'homebrew'->>type, 'dm') <> 'propuestas' then perform agarias.fail('forbidden'); end if;
    if existing.content_id is not null and not (existing.author = 'jugador' and existing.status = 'propuesto') then
      perform agarias.fail('forbidden');
    end if;
    new_status := 'propuesto';
  end if;

  insert into agarias.campaign_content as t (campaign_id, content_id, type, status, author, data)
  values (content_upsert.campaign_id, cid, content_upsert.type, new_status, case when r = 'dm' then 'dm' else 'jugador' end, content_upsert.data)
  on conflict on constraint campaign_content_pkey do update
     set data = excluded.data,
         status = new_status,
         version = t.version + case when t.data is distinct from excluded.data and new_status in ('publicado','oculto') then 1 else 0 end,
         updated_at = now()
  returning * into row;
  return jsonb_build_object('contentId', row.content_id, 'version', row.version, 'status', row.status);
end $$;

-- ── Miembros ────────────────────────────────────────────────────────────────

/** Pedir entrar con el código de invitación. Devuelve la clave personal (sólo esta vez). */
create or replace function public.campaign_join(campaign_id text, invite_code text, name text, role text default 'jugador')
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare
  c agarias.campaigns;
  clean text := btrim(coalesce(name, ''));
  mid text := agarias.short_id();
  k text := agarias.token(24);
begin
  select * into c from agarias.campaigns t where t.id = campaign_join.campaign_id;
  if not found then perform agarias.fail('not_found'); end if;
  if c.invite_hash <> agarias.hash(invite_code) then perform agarias.fail('forbidden'); end if;
  if coalesce(role, '') not in ('jugador','observador') then perform agarias.fail('invalid'); end if;
  if char_length(clean) < 1 or char_length(clean) > 60 then perform agarias.fail('invalid'); end if;
  if (select count(*) from agarias.campaign_members m where m.campaign_id = c.id and m.status <> 'expulsado') >= 60 then
    perform agarias.fail('payload_too_large');
  end if;
  if (select count(*) from agarias.campaign_members m where m.campaign_id = c.id and m.status = 'pendiente') >= 20 then
    perform agarias.fail('rate_limited');
  end if;
  insert into agarias.campaign_members (campaign_id, member_id, key_hash, name, role)
  values (c.id, mid, agarias.hash(k), clean, campaign_join.role);
  return jsonb_build_object('id', c.id, 'name', c.name, 'memberId', mid, 'key', k, 'role', campaign_join.role, 'status', 'pendiente');
end $$;

/** ¿Quién soy en la campaña? Funciona también mientras la solicitud está pendiente. */
create or replace function public.campaign_me(campaign_id text, key text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare
  a jsonb := agarias.actor(campaign_id, key);
  c agarias.campaigns;
begin
  select * into c from agarias.campaigns t where t.id = campaign_me.campaign_id;
  if a->>'memberId' is not null then
    update agarias.campaign_members m set seen_at = now()
     where m.campaign_id = c.id and m.member_id = a->>'memberId';
  end if;
  return a || jsonb_build_object('id', c.id, 'campaignName', c.name, 'openInvite', c.open_invite,
                                 'session', agarias.open_session(c.id));
end $$;

/** Miembros y PJ de la campaña, filtrados según quién pregunta. */
create or replace function public.campaign_roster(campaign_id text, key text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, agarias as $$
declare
  a jsonb := agarias.active_actor(campaign_id, key);
  is_dm boolean := a->>'role' = 'dm';
  me text := a->>'memberId';
  members jsonb;
  pcs jsonb;
  c agarias.campaigns;
begin
  select * into c from agarias.campaigns t where t.id = campaign_roster.campaign_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'memberId', m.member_id, 'name', m.name, 'role', m.role, 'status', m.status,
           'createdAt', m.created_at, 'seenAt', case when is_dm then m.seen_at end) order by m.created_at), '[]'::jsonb)
    into members
    from agarias.campaign_members m
   where m.campaign_id = c.id and (is_dm or m.status = 'activo');
  select coalesce(jsonb_agg(jsonb_build_object(
           'pcId', p.pc_id, 'memberId', p.member_id, 'status', p.status, 'state', p.state, 'privacy', p.privacy,
           'revision', p.revision, 'updatedAt', p.updated_at, 'mine', me is not null and p.member_id = me,
           'summary', case when is_dm or p.member_id = me or p.privacy <> 'privado' then p.summary
                           else jsonb_build_object('name', p.summary->>'name') end) order by p.created_at), '[]'::jsonb)
    into pcs
    from agarias.campaign_characters p
   where p.campaign_id = c.id
     and (is_dm or (me is not null and p.member_id = me) or p.status = 'activo');
  return jsonb_build_object('role', a->>'role', 'memberId', me, 'openInvite', c.open_invite,
                            'session', agarias.open_session(c.id), 'members', members, 'characters', pcs);
end $$;

/** El DM aprueba, expulsa, elimina una solicitud o cambia el rol de alguien. */
create or replace function public.member_update(campaign_id text, dm_key text, member_id text, status text default null, role text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare m agarias.campaign_members;
begin
  if agarias.role_for(campaign_id, dm_key) <> 'dm' then perform agarias.fail('forbidden'); end if;
  select * into m from agarias.campaign_members t
   where t.campaign_id = member_update.campaign_id and t.member_id = member_update.member_id for update;
  if not found then perform agarias.fail('not_found'); end if;
  if status is not null and status not in ('activo','expulsado','eliminar') then perform agarias.fail('invalid'); end if;
  if role is not null and role not in ('jugador','observador') then perform agarias.fail('invalid'); end if;

  if status = 'eliminar' then
    -- Sólo solicitudes o expulsados; sus PJ quedan desvinculados (no se borra el historial).
    if m.status = 'activo' then perform agarias.fail('invalid'); end if;
    update agarias.campaign_characters p set status = 'desvinculado', member_id = null, updated_at = now()
     where p.campaign_id = m.campaign_id and p.member_id = m.member_id and p.status <> 'pendiente';
    delete from agarias.campaign_characters p
     where p.campaign_id = m.campaign_id and p.member_id = m.member_id and p.status = 'pendiente';
    delete from agarias.campaign_members t where t.campaign_id = m.campaign_id and t.member_id = m.member_id;
    return jsonb_build_object('memberId', m.member_id, 'deleted', true);
  end if;

  update agarias.campaign_members t
     set status = coalesce(member_update.status, t.status), role = coalesce(member_update.role, t.role), updated_at = now()
   where t.campaign_id = m.campaign_id and t.member_id = m.member_id returning * into m;
  if member_update.status = 'expulsado' then
    update agarias.campaign_characters p set status = 'desvinculado', updated_at = now()
     where p.campaign_id = m.campaign_id and p.member_id = m.member_id and p.status <> 'desvinculado';
    perform agarias.log_event(m.campaign_id, null, m.member_id, 'sistema', 'miembro', m.name || ' ya no forma parte de la campaña.', '{}'::jsonb, 'publico');
  elsif member_update.status = 'activo' then
    perform agarias.log_event(m.campaign_id, null, m.member_id, 'sistema', 'miembro',
      m.name || case when m.role = 'observador' then ' se unió como observador.' else ' se unió a la campaña.' end, '{}'::jsonb, 'publico');
  end if;
  return jsonb_build_object('memberId', m.member_id, 'name', m.name, 'role', m.role, 'status', m.status);
end $$;

/** ¿El código de invitación basta para entrar (modo antiguo) o el DM aprueba a cada uno? */
create or replace function public.campaign_set_access(campaign_id text, dm_key text, open_invite boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare c agarias.campaigns;
begin
  if agarias.role_for(campaign_id, dm_key) <> 'dm' then perform agarias.fail('forbidden'); end if;
  update agarias.campaigns t set open_invite = coalesce(campaign_set_access.open_invite, false), updated_at = now()
   where t.id = campaign_set_access.campaign_id returning * into c;
  return jsonb_build_object('openInvite', c.open_invite);
end $$;

-- ── PJ de la campaña ────────────────────────────────────────────────────────

/** Vincula una COPIA del PJ a la campaña. El de un jugador queda pendiente hasta que el DM lo apruebe. */
create or replace function public.pc_link(campaign_id text, key text, document jsonb, summary jsonb default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare
  a jsonb := agarias.actor(campaign_id, key);
  is_dm boolean := a->>'role' = 'dm';
  me text := a->>'memberId';
  pid text := agarias.short_id();
  p agarias.campaign_characters;
begin
  if not is_dm and (me is null or a->>'role' <> 'jugador') then perform agarias.fail('forbidden'); end if;
  if not is_dm and (select count(*) from agarias.campaign_characters t
                     where t.campaign_id = pc_link.campaign_id and t.member_id = me and t.status <> 'desvinculado') >= 3 then
    perform agarias.fail('payload_too_large');
  end if;
  if (select count(*) from agarias.campaign_characters t where t.campaign_id = pc_link.campaign_id) >= 100 then
    perform agarias.fail('payload_too_large');
  end if;
  insert into agarias.campaign_characters (campaign_id, pc_id, member_id, document, summary, status)
  values (pc_link.campaign_id, pid, me, agarias.pc_document(pc_link.campaign_id, document), agarias.check_summary(summary),
          case when is_dm then 'activo' else 'pendiente' end)
  returning * into p;
  if is_dm then
    perform agarias.log_event(p.campaign_id, p.pc_id, null, 'sistema', 'pj', coalesce(p.summary->>'name', 'Un PJ') || ' entra en la campaña.', '{}'::jsonb, 'publico');
  end if;
  return jsonb_build_object('pcId', p.pc_id, 'revision', p.revision, 'status', p.status, 'updatedAt', p.updated_at);
end $$;

/** El DM aprueba o desvincula un PJ (desvincular no borra nada). */
create or replace function public.pc_review(campaign_id text, dm_key text, pc_id text, status text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare p agarias.campaign_characters;
begin
  if agarias.role_for(campaign_id, dm_key) <> 'dm' then perform agarias.fail('forbidden'); end if;
  if status not in ('activo','desvinculado') then perform agarias.fail('invalid'); end if;
  update agarias.campaign_characters t set status = pc_review.status, updated_at = now()
   where t.campaign_id = pc_review.campaign_id and t.pc_id = pc_review.pc_id and t.status <> pc_review.status
   returning * into p;
  if not found then
    select * into p from agarias.campaign_characters t where t.campaign_id = pc_review.campaign_id and t.pc_id = pc_review.pc_id;
    if not found then perform agarias.fail('not_found'); end if;
    return jsonb_build_object('pcId', p.pc_id, 'status', p.status);
  end if;
  perform agarias.log_event(p.campaign_id, p.pc_id, p.member_id, 'sistema', 'pj',
    coalesce(p.summary->>'name', 'Un PJ') || case when p.status = 'activo' then ' entra en la campaña.' else ' deja la campaña.' end,
    '{}'::jsonb, 'publico');
  return jsonb_build_object('pcId', p.pc_id, 'status', p.status);
end $$;

/** Ficha de un PJ. Completa para el DM y su dueño; para los demás, según su privacidad. */
create or replace function public.pc_get(campaign_id text, key text, pc_id text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, agarias as $$
declare
  a jsonb := agarias.actor(campaign_id, key);
  is_dm boolean := a->>'role' = 'dm';
  me text := a->>'memberId';
  p agarias.campaign_characters;
  mine boolean;
  full_doc boolean;
begin
  select * into p from agarias.campaign_characters t where t.campaign_id = pc_get.campaign_id and t.pc_id = pc_get.pc_id;
  if not found then perform agarias.fail('not_found'); end if;
  mine := me is not null and p.member_id = me;
  -- Quien está pendiente sólo ve sus propios PJ.
  if not is_dm and not mine and (a->>'status' <> 'activo' or p.status <> 'activo') then perform agarias.fail('forbidden'); end if;
  full_doc := is_dm or mine or p.privacy = 'publico';
  return jsonb_build_object('pcId', p.pc_id, 'memberId', p.member_id, 'status', p.status, 'state', p.state, 'privacy', p.privacy,
    'revision', p.revision, 'updatedAt', p.updated_at, 'mine', mine,
    'summary', case when full_doc or p.privacy = 'resumen' then p.summary else jsonb_build_object('name', p.summary->>'name') end,
    'document', case when full_doc then p.document end);
end $$;

/**
 * Guarda la ficha del PJ de la campaña (su dueño o el DM) con control de
 * revisión, y añade en la MISMA transacción los acontecimientos del registro.
 * `document` null = sólo cambia el estado (vivo/muerto, sólo DM) o la privacidad.
 */
create or replace function public.pc_save(campaign_id text, key text, pc_id text, document jsonb, summary jsonb,
                                          expected_revision int, events jsonb default '[]'::jsonb,
                                          state text default null, privacy text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare
  a jsonb := agarias.actor(campaign_id, key);
  is_dm boolean := a->>'role' = 'dm';
  me text := a->>'memberId';
  p agarias.campaign_characters;
  e jsonb;
  vis text;
  name text;
  prev_state text;
begin
  select * into p from agarias.campaign_characters t where t.campaign_id = pc_save.campaign_id and t.pc_id = pc_save.pc_id for update;
  if not found then perform agarias.fail('not_found'); end if;
  prev_state := p.state;
  if not is_dm and not (me is not null and p.member_id = me and a->>'role' = 'jugador' and p.status <> 'desvinculado') then
    perform agarias.fail('forbidden');
  end if;
  if expected_revision is null or expected_revision <> p.revision then perform agarias.fail('conflict'); end if;
  if state is not null and (not is_dm or state not in ('vivo','muerto','retirado')) then perform agarias.fail('forbidden'); end if;
  if privacy is not null and privacy not in ('publico','resumen','privado') then perform agarias.fail('invalid'); end if;
  if events is null then events := '[]'::jsonb; end if;
  if jsonb_typeof(events) <> 'array' or jsonb_array_length(events) > 25 then perform agarias.fail('invalid'); end if;

  update agarias.campaign_characters t
     set document = case when pc_save.document is null then t.document else agarias.pc_document(t.campaign_id, pc_save.document) end,
         summary = case when pc_save.summary is null then t.summary else agarias.check_summary(pc_save.summary) end,
         state = coalesce(pc_save.state, t.state),
         privacy = coalesce(pc_save.privacy, t.privacy),
         revision = t.revision + 1,
         updated_at = now()
   where t.campaign_id = p.campaign_id and t.pc_id = p.pc_id
   returning * into p;

  name := coalesce(nullif(p.summary->>'name', ''), 'Un PJ');
  for e in select * from jsonb_array_elements(events) loop
    if jsonb_typeof(e) <> 'object' then perform agarias.fail('invalid'); end if;
    vis := coalesce(e->>'visibility', 'privado');
    perform agarias.log_event(p.campaign_id, p.pc_id, p.member_id, case when is_dm then 'dm' else 'jugador' end,
      e->>'kind', e->>'text', coalesce(e->'data', '{}'::jsonb), vis,
      case when jsonb_typeof(e->'day') = 'number' then (e->>'day')::int end);
  end loop;
  -- La muerte y el regreso a la vida se registran siempre (y nunca borran el historial).
  if p.state <> prev_state then
    perform agarias.log_event(p.campaign_id, p.pc_id, p.member_id, 'dm',
      case p.state when 'muerto' then 'muerte' when 'vivo' then 'revivir' else 'retiro' end,
      name || case p.state when 'muerto' then ' ha muerto.' when 'vivo' then ' vuelve a la vida.' else ' se retira de la aventura.' end,
      jsonb_build_object('from', prev_state, 'to', p.state), 'publico');
  end if;
  return jsonb_build_object('pcId', p.pc_id, 'revision', p.revision, 'updatedAt', p.updated_at, 'state', p.state, 'privacy', p.privacy);
end $$;

-- ── Registro de la campaña ─────────────────────────────────────────────────

/** Acontecimiento escrito a mano (DM: de cualquiera; jugador: suyo). */
create or replace function public.event_add(campaign_id text, key text, kind text, message text, data jsonb default null,
                                            pc_id text default null, visibility text default 'publico', day int default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare
  a jsonb := agarias.active_actor(campaign_id, key);
  is_dm boolean := a->>'role' = 'dm';
  me text := a->>'memberId';
  owner text;
  new_id bigint;
begin
  if a->>'role' = 'observador' or (not is_dm and me is null) then perform agarias.fail('forbidden'); end if;
  if pc_id is not null then
    select t.member_id into owner from agarias.campaign_characters t where t.campaign_id = event_add.campaign_id and t.pc_id = event_add.pc_id;
    if not found then perform agarias.fail('not_found'); end if;
    if not is_dm and owner is distinct from me then perform agarias.fail('forbidden'); end if;
  end if;
  new_id := agarias.log_event(event_add.campaign_id, event_add.pc_id, case when is_dm then owner else me end,
                              case when is_dm then 'dm' else 'jugador' end, kind, message, data, coalesce(visibility, 'publico'), day);
  return jsonb_build_object('id', new_id);
end $$;

/** Registro, del más reciente al más antiguo, filtrado por privacidad. */
create or replace function public.events_list(campaign_id text, key text, before_id bigint default null, pc_id text default null, lim int default 50)
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
             and (is_dm or e.visibility = 'publico'
                  or (me is not null and e.member_id = me and (e.visibility = 'privado' or (e.visibility = 'dm' and e.author = 'jugador'))))
           order by e.id desc
           limit greatest(1, least(coalesce(lim, 50), 200))) e;
  return jsonb_build_object('events', out);
end $$;

-- ── Sesiones (preparado para sesiones y capítulos) ──────────────────────────

create or replace function public.session_start(campaign_id text, dm_key text, title text default '')
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare n int;
begin
  if agarias.role_for(campaign_id, dm_key) <> 'dm' then perform agarias.fail('forbidden'); end if;
  if char_length(coalesce(title, '')) > 120 then perform agarias.fail('invalid'); end if;
  update agarias.campaign_sessions s set ended_at = now() where s.campaign_id = session_start.campaign_id and s.ended_at is null;
  select coalesce(max(s.session_id), 0) + 1 into n from agarias.campaign_sessions s where s.campaign_id = session_start.campaign_id;
  insert into agarias.campaign_sessions (campaign_id, session_id, title) values (session_start.campaign_id, n, btrim(coalesce(title, '')));
  perform agarias.log_event(session_start.campaign_id, null, null, 'sistema', 'sesion',
    'Empieza la sesión ' || n || coalesce(nullif(': ' || btrim(coalesce(title, '')), ': '), '') || '.', '{}'::jsonb, 'publico');
  return jsonb_build_object('session', n);
end $$;

create or replace function public.session_end(campaign_id text, dm_key text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare n int := agarias.open_session(campaign_id);
begin
  if agarias.role_for(campaign_id, dm_key) <> 'dm' then perform agarias.fail('forbidden'); end if;
  if n is null then return jsonb_build_object('session', null); end if;
  perform agarias.log_event(session_end.campaign_id, null, null, 'sistema', 'sesion', 'Termina la sesión ' || n || '.', '{}'::jsonb, 'publico');
  update agarias.campaign_sessions s set ended_at = now() where s.campaign_id = session_end.campaign_id and s.session_id = n;
  return jsonb_build_object('session', null, 'ended', n);
end $$;

-- ── Permisos ────────────────────────────────────────────────────────────────

do $$
declare f text;
begin
  foreach f in array array[
    'agarias.short_id()', 'agarias.actor(text,text)', 'agarias.active_actor(text,text)', 'agarias.check_summary(jsonb)',
    'agarias.open_session(text)', 'agarias.log_event(text,text,text,text,text,text,jsonb,text,int)', 'agarias.pc_document(text,jsonb)'
  ] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array[
    'shop_market_save(text,text,jsonb,int)', 'content_upsert(text,text,text,jsonb,text,text)',
    'campaign_join(text,text,text,text)', 'campaign_me(text,text)', 'campaign_roster(text,text)',
    'member_update(text,text,text,text,text)', 'campaign_set_access(text,text,boolean)',
    'pc_link(text,text,jsonb,jsonb)', 'pc_review(text,text,text,text)', 'pc_get(text,text,text)',
    'pc_save(text,text,text,jsonb,jsonb,int,jsonb,text,text)',
    'event_add(text,text,text,text,jsonb,text,text,int)', 'events_list(text,text,bigint,text,int)',
    'session_start(text,text,text)', 'session_end(text,text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function public.%s to anon, authenticated', f);
    end if;
  end loop;
end $$;
