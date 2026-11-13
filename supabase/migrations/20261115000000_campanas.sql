-- Ficha de la campaña: lo que el DM cuenta de ella (sinopsis, tipo, estilo,
-- jugadores, niveles, horario, normas de la mesa, lugar de inicio…).
--
-- Cambio ADITIVO e idempotente: añade la columna `details` (por defecto '{}'),
-- la función `campaign_set_details` (sólo el DM) y devuelve `details` en
-- `campaign_get`. Las campañas existentes no cambian.

alter table agarias.campaigns add column if not exists details jsonb not null default '{}'::jsonb;

create or replace function agarias.check_details(details jsonb)
returns void language plpgsql immutable set search_path = pg_catalog, agarias as $$
begin
  if details is null or jsonb_typeof(details) <> 'object' then perform agarias.fail('invalid'); end if;
  if octet_length(details::text) > 20000 then perform agarias.fail('payload_too_large'); end if;
end $$;
revoke all on function agarias.check_details(jsonb) from public;

create or replace function public.campaign_set_details(campaign_id text, dm_key text, details jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare c agarias.campaigns;
begin
  if agarias.role_for(campaign_id, dm_key) <> 'dm' then perform agarias.fail('forbidden'); end if;
  perform agarias.check_details(details);
  update agarias.campaigns t set details = campaign_set_details.details, updated_at = now()
   where t.id = campaign_set_details.campaign_id returning * into c;
  return jsonb_build_object('id', c.id, 'details', c.details, 'updatedAt', c.updated_at);
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
  return jsonb_build_object('id', c.id, 'name', c.name, 'role', r, 'rules', c.rules, 'details', c.details, 'items', items, 'updatedAt', c.updated_at);
end $$;

do $$
declare f text;
begin
  foreach f in array array['campaign_set_details(text,text,jsonb)', 'campaign_get(text,text)'] loop
    execute format('revoke all on function public.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function public.%s to anon, authenticated', f);
    end if;
  end loop;
end $$;
