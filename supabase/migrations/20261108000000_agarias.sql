-- Stories of Agarias · base de datos en Supabase (PostgreSQL).
--
-- Sustituye al backend Python para publicar en Internet sin servidor propio:
--   * personajes compartidos (enlace público + token de edición);
--   * campañas: un DM con clave secreta, jugadores con código de invitación,
--     reglas de la campaña y su contenido Homebrew con estados de publicación.
--
-- Seguridad:
--   * Las tablas tienen RLS activado y NINGUNA política: el rol `anon` no puede
--     leerlas ni escribirlas directamente.
--   * Todo pasa por funciones SECURITY DEFINER que comprueban la clave/token y
--     las reglas de la campaña. Los tokens sólo se guardan como hash SHA-256.
--   * Límites de tamaño en cada función para evitar abusos.
--
-- Errores: las funciones lanzan excepciones cuyo mensaje es un código estable
-- (not_found, forbidden, conflict, invalid, payload_too_large,
-- unauthorized_content) que el cliente traduce a un texto para el usuario.

create schema if not exists agarias;
revoke all on schema agarias from public;

-- ── Utilidades ──────────────────────────────────────────────────────────────

create or replace function agarias.token(bytes int default 24)
returns text language sql volatile set search_path = pg_catalog as $$
  -- 2 UUID v4 aleatorios = 244 bits de entropía; se recortan a `bytes` bytes en base64url.
  select left(translate(encode(decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'), (bytes * 4) / 3)
$$;

create or replace function agarias.hash(secret text)
returns text language sql immutable set search_path = pg_catalog as $$
  select encode(sha256(convert_to(coalesce(secret, ''), 'UTF8')), 'hex')
$$;

create or replace function agarias.fail(code text)
returns void language plpgsql set search_path = pg_catalog as $$
begin
  raise exception '%', code using errcode = 'P0001';
end $$;

-- ── Personajes compartidos ──────────────────────────────────────────────────

create table if not exists agarias.shared_characters (
  id text primary key,
  edit_token_hash text not null,
  document jsonb not null,
  revision int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table agarias.shared_characters enable row level security;

create or replace function agarias.check_document(doc jsonb)
returns void language plpgsql stable set search_path = pg_catalog, agarias as $$
declare
  v int;
  camp text;
  bad text;
begin
  if doc is null or jsonb_typeof(doc) <> 'object' then perform agarias.fail('invalid'); end if;
  if octet_length(doc::text) > 2000000 then perform agarias.fail('payload_too_large'); end if;
  if doc->>'format' is distinct from 'agarias-dnd-character' then perform agarias.fail('invalid'); end if;
  if jsonb_typeof(doc->'schemaVersion') <> 'number' then perform agarias.fail('invalid'); end if;
  v := (doc->>'schemaVersion')::int;
  if v < 1 or v > 3 then perform agarias.fail('invalid'); end if;
  if jsonb_typeof(doc->'character') <> 'object' then perform agarias.fail('invalid'); end if;

  -- Personaje de una campaña: todo su Homebrew de esa campaña debe estar
  -- autorizado (publicado, oculto o retirado; nunca borradores o propuestas).
  camp := doc->'character'->'campaign'->>'id';
  if camp is not null and exists (select 1 from agarias.campaigns where id = camp)
     and jsonb_typeof(doc->'character'->'content') = 'object' then
    select r into bad
    from jsonb_object_keys(doc->'character'->'content') as r
    where r like 'hb:' || camp || ':%'
      and not exists (
        select 1 from agarias.campaign_content cc
        where cc.campaign_id = camp
          and 'hb:' || camp || ':' || cc.type || ':' || cc.content_id = r
          and cc.status in ('publicado', 'oculto', 'retirado'))
    limit 1;
    if bad is not null then perform agarias.fail('unauthorized_content'); end if;

    -- Extensiones de clase «con código»: el personaje debe llevar el código
    -- correcto (se compara su SHA-256 con el que guardó el DM).
    select r into bad
    from jsonb_object_keys(doc->'character'->'content') as r
    join agarias.campaign_content cc
      on cc.campaign_id = camp and cc.type = 'extension'
     and 'hb:' || camp || ':extension:' || cc.content_id = r
    where cc.data->>'access' = 'desbloqueo'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(doc->'character'->'unlocks', '[]'::jsonb)) as u
        where jsonb_typeof(u) = 'object' and u->>'ref' = r
          and agarias.hash(u->>'code') = cc.data->>'unlockHash')
    limit 1;
    if bad is not null then perform agarias.fail('unauthorized_content'); end if;
  end if;
end $$;

create or replace function public.share_create(document jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare
  new_id text := agarias.token(12);
  tok text := agarias.token(32);
  row agarias.shared_characters;
begin
  perform agarias.check_document(document);
  insert into agarias.shared_characters (id, edit_token_hash, document)
  values (new_id, agarias.hash(tok), document) returning * into row;
  return jsonb_build_object('id', row.id, 'editToken', tok, 'revision', row.revision, 'updatedAt', row.updated_at);
end $$;

create or replace function public.share_get(share_id text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, agarias as $$
declare row agarias.shared_characters;
begin
  select * into row from agarias.shared_characters where id = share_id;
  if not found then perform agarias.fail('not_found'); end if;
  return jsonb_build_object('id', row.id, 'document', row.document, 'revision', row.revision, 'updatedAt', row.updated_at);
end $$;

create or replace function public.share_update(share_id text, token text, document jsonb, expected_revision int default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare row agarias.shared_characters;
begin
  perform agarias.check_document(document);
  select * into row from agarias.shared_characters where id = share_id for update;
  if not found then perform agarias.fail('not_found'); end if;
  if row.edit_token_hash <> agarias.hash(token) then perform agarias.fail('forbidden'); end if;
  if expected_revision is not null and expected_revision <> row.revision then perform agarias.fail('conflict'); end if;
  update agarias.shared_characters
     set document = share_update.document, revision = revision + 1, updated_at = now()
   where id = share_id returning * into row;
  return jsonb_build_object('id', row.id, 'revision', row.revision, 'updatedAt', row.updated_at);
end $$;

create or replace function public.share_delete(share_id text, token text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare h text;
begin
  select edit_token_hash into h from agarias.shared_characters where id = share_id;
  if not found then perform agarias.fail('not_found'); end if;
  if h <> agarias.hash(token) then perform agarias.fail('forbidden'); end if;
  delete from agarias.shared_characters where id = share_id;
  return jsonb_build_object('deleted', true);
end $$;

-- ── Campañas ────────────────────────────────────────────────────────────────

create table if not exists agarias.campaigns (
  id text primary key,
  name text not null check (char_length(name) between 1 and 120),
  dm_key_hash text not null,
  invite_hash text not null,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table agarias.campaigns enable row level security;

create table if not exists agarias.campaign_content (
  campaign_id text not null references agarias.campaigns(id) on delete cascade,
  content_id text not null check (content_id ~ '^[a-z0-9-]{1,40}$'),
  type text not null check (type in ('clase','raza','hechizo','dote','trasfondo','objeto','criatura','rasgo','extension','otro')),
  version int not null default 1,
  status text not null check (status in ('borrador','propuesto','publicado','oculto','retirado')),
  author text not null check (author in ('dm','jugador')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, content_id)
);
alter table agarias.campaign_content enable row level security;
-- (v3.1) Nuevo tipo «extension»: actualiza la restricción si la tabla ya existía.
alter table agarias.campaign_content drop constraint if exists campaign_content_type_check;
alter table agarias.campaign_content add constraint campaign_content_type_check
  check (type in ('clase','raza','hechizo','dote','trasfondo','objeto','criatura','rasgo','extension','otro'));
create index if not exists campaign_content_by_campaign on agarias.campaign_content (campaign_id);

/** Rol de quien presenta una clave: 'dm', 'jugador' o falla con forbidden. */
create or replace function agarias.role_for(camp_id text, key text)
returns text language plpgsql stable set search_path = pg_catalog, agarias as $$
declare c agarias.campaigns;
begin
  select * into c from agarias.campaigns where id = camp_id;
  if not found then perform agarias.fail('not_found'); end if;
  if c.dm_key_hash = agarias.hash(key) then return 'dm'; end if;
  if c.invite_hash = agarias.hash(key) then return 'jugador'; end if;
  perform agarias.fail('forbidden');
  return null;
end $$;

create or replace function agarias.check_rules(rules jsonb)
returns void language plpgsql immutable set search_path = pg_catalog as $$
begin
  if rules is null or jsonb_typeof(rules) <> 'object' or octet_length(rules::text) > 10000 then
    perform agarias.fail('invalid');
  end if;
end $$;

create or replace function public.campaign_create(name text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare
  new_id text := lower(agarias.token(9));
  dm text := agarias.token(32);
  inv text := agarias.token(18);
  clean text := btrim(coalesce(name, ''));
begin
  if char_length(clean) < 1 or char_length(clean) > 120 then perform agarias.fail('invalid'); end if;
  new_id := regexp_replace(new_id, '[^a-z0-9]', 'x', 'g');
  insert into agarias.campaigns (id, name, dm_key_hash, invite_hash) values (new_id, clean, agarias.hash(dm), agarias.hash(inv));
  return jsonb_build_object('id', new_id, 'name', clean, 'dmKey', dm, 'inviteCode', inv);
end $$;

create or replace function public.campaign_get(campaign_id text, key text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, agarias as $$
declare
  r text := agarias.role_for(campaign_id, key);
  c agarias.campaigns;
  items jsonb;
begin
  select * into c from agarias.campaigns where id = campaign_get.campaign_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'contentId', cc.content_id, 'type', cc.type, 'version', cc.version, 'status', cc.status,
           'author', cc.author, 'data', cc.data, 'updatedAt', cc.updated_at) order by cc.type, cc.content_id), '[]'::jsonb)
    into items
    from agarias.campaign_content cc
   where cc.campaign_id = campaign_get.campaign_id
     -- Los jugadores no ven borradores del DM.
     and (r = 'dm' or cc.status <> 'borrador');
  return jsonb_build_object('id', c.id, 'name', c.name, 'role', r, 'rules', c.rules, 'items', items, 'updatedAt', c.updated_at);
end $$;

create or replace function public.campaign_update(campaign_id text, dm_key text, name text default null, rules jsonb default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare c agarias.campaigns;
begin
  if agarias.role_for(campaign_id, dm_key) <> 'dm' then perform agarias.fail('forbidden'); end if;
  if rules is not null then perform agarias.check_rules(rules); end if;
  if name is not null and (char_length(btrim(name)) < 1 or char_length(name) > 120) then perform agarias.fail('invalid'); end if;
  update agarias.campaigns t
     set name = coalesce(btrim(campaign_update.name), t.name),
         rules = coalesce(campaign_update.rules, t.rules),
         updated_at = now()
   where t.id = campaign_update.campaign_id returning * into c;
  return jsonb_build_object('id', c.id, 'name', c.name, 'rules', c.rules, 'updatedAt', c.updated_at);
end $$;

create or replace function public.campaign_rotate_invite(campaign_id text, dm_key text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare inv text := agarias.token(18);
begin
  if agarias.role_for(campaign_id, dm_key) <> 'dm' then perform agarias.fail('forbidden'); end if;
  update agarias.campaigns set invite_hash = agarias.hash(inv), updated_at = now() where id = campaign_id;
  return jsonb_build_object('inviteCode', inv);
end $$;

/**
 * Crea o edita contenido Homebrew.
 *  - DM: cualquier tipo y estado.
 *  - Jugador: sólo si las reglas permiten propuestas de ese tipo
 *    (rules.homebrew.<tipo> = 'propuestas'); el estado queda siempre en
 *    'propuesto' y sólo puede editar sus propias propuestas aún no aceptadas.
 */
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
  if type not in ('clase','raza','hechizo','dote','trasfondo','objeto','criatura','rasgo','extension','otro') then perform agarias.fail('invalid'); end if;
  if data is null or jsonb_typeof(data) <> 'object' or char_length(coalesce(btrim(data->>'name'), '')) = 0 then perform agarias.fail('invalid'); end if;
  if octet_length(data::text) > 200000 then perform agarias.fail('payload_too_large'); end if;
  if (select count(*) from agarias.campaign_content where campaign_content.campaign_id = content_upsert.campaign_id) >= 1000
     and content_id is null then perform agarias.fail('payload_too_large'); end if;

  select c.rules into rules from agarias.campaigns c where c.id = campaign_id;
  select * into existing from agarias.campaign_content cc where cc.campaign_id = content_upsert.campaign_id and cc.content_id = cid;
  if found and existing.type <> content_upsert.type then perform agarias.fail('invalid'); end if;

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
  values (content_upsert.campaign_id, cid, content_upsert.type, new_status, r, content_upsert.data)
  on conflict on constraint campaign_content_pkey do update
     set data = excluded.data,
         status = new_status,
         -- La versión sólo sube cuando cambia algo que ven los jugadores.
         version = t.version + case when t.data is distinct from excluded.data and new_status in ('publicado','oculto') then 1 else 0 end,
         updated_at = now()
  returning * into row;
  return jsonb_build_object('contentId', row.content_id, 'version', row.version, 'status', row.status);
end $$;

create or replace function public.content_set_status(campaign_id text, dm_key text, content_id text, status text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare row agarias.campaign_content;
begin
  if agarias.role_for(campaign_id, dm_key) <> 'dm' then perform agarias.fail('forbidden'); end if;
  if status not in ('borrador','propuesto','publicado','oculto','retirado') then perform agarias.fail('invalid'); end if;
  update agarias.campaign_content cc set status = content_set_status.status, updated_at = now()
   where cc.campaign_id = content_set_status.campaign_id and cc.content_id = content_set_status.content_id
   returning * into row;
  if not found then perform agarias.fail('not_found'); end if;
  return jsonb_build_object('contentId', row.content_id, 'version', row.version, 'status', row.status);
end $$;

/**
 * Borrar: un borrador o una propuesta se eliminan; lo que ya se publicó sólo
 * se marca como retirado, para que ningún personaje que lo use se rompa.
 */
create or replace function public.content_delete(campaign_id text, dm_key text, content_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare st text;
begin
  if agarias.role_for(campaign_id, dm_key) <> 'dm' then perform agarias.fail('forbidden'); end if;
  select cc.status into st from agarias.campaign_content cc
   where cc.campaign_id = content_delete.campaign_id and cc.content_id = content_delete.content_id;
  if not found then perform agarias.fail('not_found'); end if;
  if st in ('borrador', 'propuesto') then
    delete from agarias.campaign_content cc where cc.campaign_id = content_delete.campaign_id and cc.content_id = content_delete.content_id;
    return jsonb_build_object('deleted', true);
  end if;
  update agarias.campaign_content cc set status = 'retirado', updated_at = now()
   where cc.campaign_id = content_delete.campaign_id and cc.content_id = content_delete.content_id;
  return jsonb_build_object('deleted', false, 'status', 'retirado');
end $$;

-- ── Permisos de ejecución ───────────────────────────────────────────────────

revoke all on all functions in schema agarias from public;
do $$
declare f text;
begin
  foreach f in array array[
    'share_create(jsonb)', 'share_get(text)', 'share_update(text,text,jsonb,int)', 'share_delete(text,text)',
    'campaign_create(text)', 'campaign_get(text,text)', 'campaign_update(text,text,text,jsonb)',
    'campaign_rotate_invite(text,text)', 'content_upsert(text,text,text,jsonb,text,text)',
    'content_set_status(text,text,text,text)', 'content_delete(text,text,text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function public.%s to anon, authenticated', f);
    end if;
  end loop;
end $$;
