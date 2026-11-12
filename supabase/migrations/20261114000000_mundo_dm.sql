-- Mundo de la Tienda configurable por el DM: regiones, facciones y eventos
-- Homebrew, y comerciantes/mundo EXCLUSIVOS del DM (también en el servidor).
--
-- Cambio ADITIVO e idempotente: amplía la lista de tipos permitidos y añade la
-- comprobación de rol. No toca datos existentes. Funciona tanto si ya se aplicó
-- 20261113000000_comerciantes.sql como si no (ejecutar ambas en orden).

alter table agarias.campaign_content drop constraint if exists campaign_content_type_check;
alter table agarias.campaign_content add constraint campaign_content_type_check
  check (type in ('clase','raza','hechizo','dote','trasfondo','objeto','criatura','rasgo','extension','mercader','region','faccion','evento','otro'));

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
  if type not in ('clase','raza','hechizo','dote','trasfondo','objeto','criatura','rasgo','extension','mercader','region','faccion','evento','otro') then perform agarias.fail('invalid'); end if;
  if data is null or jsonb_typeof(data) <> 'object' or char_length(coalesce(btrim(data->>'name'), '')) = 0 then perform agarias.fail('invalid'); end if;
  if octet_length(data::text) > 200000 then perform agarias.fail('payload_too_large'); end if;
  if (select count(*) from agarias.campaign_content where campaign_content.campaign_id = content_upsert.campaign_id) >= 1000
     and content_id is null then perform agarias.fail('payload_too_large'); end if;

  select c.rules into rules from agarias.campaigns c where c.id = campaign_id;
  select * into existing from agarias.campaign_content cc where cc.campaign_id = content_upsert.campaign_id and cc.content_id = cid;
  if found and existing.type <> content_upsert.type then perform agarias.fail('invalid'); end if;

  -- El mundo de la Tienda (comerciantes, regiones, facciones, eventos) es exclusivo del DM.
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

do $$
begin
  execute 'revoke all on function public.content_upsert(text,text,text,jsonb,text,text) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function public.content_upsert(text,text,text,jsonb,text,text) to anon, authenticated';
  end if;
end $$;
