-- Stories of Agarias · Registro de la campaña: anclar y eliminar (AgSt 1.28).
--
-- Requiere 20261119000000_mundo_sesiones.sql. Aditivo e idempotente.
--
-- Sólo el DM administra el registro:
--   - Anclar «para todos» (campaign_events.pinned_at): máx. 15 por campaña. Lo
--     ven quienes ya podían ver esa entrada (anclar no cambia su privacidad).
--   - Anclar «personal» (campaign_event_pins): máx. 100; sólo lo ve el DM.
--   - Eliminar: borrado definitivo (la interfaz avisa antes).
-- Las entradas no se editan.

alter table agarias.campaign_events add column if not exists pinned_at timestamptz;
create index if not exists campaign_events_pinned on agarias.campaign_events (campaign_id, pinned_at) where pinned_at is not null;

create table if not exists agarias.campaign_event_pins (
  campaign_id text not null references agarias.campaigns(id) on delete cascade,
  event_id bigint not null references agarias.campaign_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (campaign_id, event_id)
);
alter table agarias.campaign_event_pins enable row level security;

/** Ancla o desancla una entrada («todos» o «personal»). */
create or replace function public.event_pin(campaign_id text, dm_key text, event_id bigint, scope text default 'todos', pinned boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare e agarias.campaign_events;
begin
  if agarias.role_for(campaign_id, dm_key) <> 'dm' then perform agarias.fail('forbidden'); end if;
  if scope not in ('todos','personal') then perform agarias.fail('invalid'); end if;
  select * into e from agarias.campaign_events t where t.campaign_id = event_pin.campaign_id and t.id = event_pin.event_id for update;
  if not found then perform agarias.fail('not_found'); end if;
  if scope = 'todos' then
    if coalesce(pinned, true) and e.pinned_at is null
       and (select count(*) from agarias.campaign_events t where t.campaign_id = e.campaign_id and t.pinned_at is not null) >= 15 then
      perform agarias.fail('payload_too_large');
    end if;
    update agarias.campaign_events t set pinned_at = case when coalesce(event_pin.pinned, true) then coalesce(t.pinned_at, now()) end
     where t.id = e.id;
  elsif coalesce(pinned, true) then
    if not exists (select 1 from agarias.campaign_event_pins p where p.campaign_id = e.campaign_id and p.event_id = e.id)
       and (select count(*) from agarias.campaign_event_pins p where p.campaign_id = e.campaign_id) >= 100 then
      perform agarias.fail('payload_too_large');
    end if;
    insert into agarias.campaign_event_pins (campaign_id, event_id) values (e.campaign_id, e.id) on conflict do nothing;
  else
    delete from agarias.campaign_event_pins p where p.campaign_id = e.campaign_id and p.event_id = e.id;
  end if;
  return jsonb_build_object('id', e.id,
    'pinned', (select t.pinned_at is not null from agarias.campaign_events t where t.id = e.id),
    'pinnedByMe', exists (select 1 from agarias.campaign_event_pins p where p.campaign_id = e.campaign_id and p.event_id = e.id));
end $$;

/** Borra una entrada del registro para siempre (sólo el DM). */
create or replace function public.event_delete(campaign_id text, dm_key text, event_id bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
begin
  if agarias.role_for(campaign_id, dm_key) <> 'dm' then perform agarias.fail('forbidden'); end if;
  delete from agarias.campaign_events t where t.campaign_id = event_delete.campaign_id and t.id = event_delete.event_id;
  if not found then perform agarias.fail('not_found'); end if;
  return jsonb_build_object('id', event_id, 'deleted', true);
end $$;

-- Registro: ahora dice si cada entrada está anclada y puede listar sólo las ancladas.
drop function if exists public.events_list(text, text, bigint, text, int, int);
create or replace function public.events_list(campaign_id text, key text, before_id bigint default null, pc_id text default null,
                                              lim int default 50, session int default null, pinned_only boolean default false)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, agarias as $$
declare
  a jsonb := agarias.active_actor(campaign_id, key);
  is_dm boolean := a->>'role' = 'dm';
  me text := a->>'memberId';
  out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'pcId', e.pc_id, 'memberId', e.member_id, 'author', e.author, 'kind', e.kind, 'text', e.text,
           'data', e.data, 'visibility', e.visibility, 'day', e.day, 'sessionId', e.session_id, 'createdAt', e.created_at,
           'pinned', e.pinned_at is not null, 'pinnedAt', e.pinned_at, 'pinnedByMe', e.mine)
           order by e.id desc), '[]'::jsonb)
    into out
    from (select e.*, (is_dm and p.event_id is not null) as mine
            from agarias.campaign_events e
            left join agarias.campaign_event_pins p on p.campaign_id = e.campaign_id and p.event_id = e.id
           where e.campaign_id = events_list.campaign_id
             and (before_id is null or e.id < before_id)
             and (events_list.pc_id is null or e.pc_id = events_list.pc_id)
             and (events_list.session is null or e.session_id = events_list.session)
             and (not coalesce(pinned_only, false) or e.pinned_at is not null or (is_dm and p.event_id is not null))
             and (is_dm or e.visibility = 'publico'
                  or (me is not null and e.member_id = me and (e.visibility = 'privado' or (e.visibility = 'dm' and e.author = 'jugador'))))
           order by e.id desc
           limit greatest(1, least(coalesce(lim, 50), 200))) e;
  return jsonb_build_object('events', out);
end $$;

do $$
declare f text;
begin
  foreach f in array array['event_pin(text,text,bigint,text,boolean)', 'event_delete(text,text,bigint)',
                           'events_list(text,text,bigint,text,int,int,boolean)'] loop
    execute format('revoke all on function public.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function public.%s to anon, authenticated', f);
    end if;
  end loop;
end $$;
