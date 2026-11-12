-- Stories of Agarias · Tienda (v3.2): mercado compartido por campaña.
--
-- Cambio ADITIVO: una tabla nueva y dos funciones. No modifica ni lee las
-- tablas existentes salvo `campaigns` (para comprobar la clave con role_for).
--
-- Qué se guarda aquí y qué NO:
--   * Aquí: el estado del mercado de la campaña (existencias, eventos, día de
--     juego, relaciones con vendedores, tratos del día y el registro de
--     compras y ventas). Es un único documento JSON versionado
--     (format = 'agarias-shop-world').
--   * NO: monedas ni inventarios. Siguen en el documento de cada personaje
--     (equipment.coins / equipment.items / workshop.materials); la Tienda los
--     modifica y la copia en línea se actualiza con share_update, como siempre.
--
-- Permisos (sin cuentas, como el resto):
--   * DM y jugadores de la campaña (clave de DM o código de invitación) leen y
--     guardan el mercado: comprar y vender cambia las existencias.
--   * Sólo el DM puede avanzar el día o reiniciar el mercado (cambiar day/seed).
--   * Concurrencia optimista: cada guardado indica la revisión que leyó; si otro
--     jugador guardó antes, falla con «conflict» y el cliente reintenta.

create table if not exists agarias.shop_markets (
  campaign_id text primary key references agarias.campaigns(id) on delete cascade,
  world jsonb not null,
  revision int not null default 1,
  updated_at timestamptz not null default now()
);
alter table agarias.shop_markets enable row level security;

create or replace function agarias.check_market(world jsonb)
returns void language plpgsql immutable set search_path = pg_catalog, agarias as $$
begin
  if world is null or jsonb_typeof(world) <> 'object' then perform agarias.fail('invalid'); end if;
  if octet_length(world::text) > 1500000 then perform agarias.fail('payload_too_large'); end if;
  if world->>'format' is distinct from 'agarias-shop-world' then perform agarias.fail('invalid'); end if;
  if jsonb_typeof(world->'day') <> 'number' or jsonb_typeof(world->'shops') <> 'object' then perform agarias.fail('invalid'); end if;
end $$;

create or replace function public.shop_market_get(campaign_id text, key text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, agarias as $$
declare
  r text := agarias.role_for(campaign_id, key);
  m agarias.shop_markets;
begin
  select * into m from agarias.shop_markets sm where sm.campaign_id = shop_market_get.campaign_id;
  if not found then
    return jsonb_build_object('world', null, 'revision', 0, 'role', r);
  end if;
  return jsonb_build_object('world', m.world, 'revision', m.revision, 'role', r, 'updatedAt', m.updated_at);
end $$;

create or replace function public.shop_market_save(campaign_id text, key text, world jsonb, expected_revision int default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, agarias as $$
declare
  r text := agarias.role_for(campaign_id, key);
  m agarias.shop_markets;
begin
  perform agarias.check_market(world);
  select * into m from agarias.shop_markets sm where sm.campaign_id = shop_market_save.campaign_id for update;
  if not found then
    -- Primer mercado de la campaña: lo crea quien entre primero.
    if coalesce(expected_revision, 0) <> 0 then perform agarias.fail('conflict'); end if;
    insert into agarias.shop_markets (campaign_id, world) values (shop_market_save.campaign_id, world) returning * into m;
    return jsonb_build_object('revision', m.revision, 'updatedAt', m.updated_at);
  end if;
  if expected_revision is null or expected_revision <> m.revision then perform agarias.fail('conflict'); end if;
  -- Sólo el DM controla el tiempo y puede reiniciar el mercado.
  if r <> 'dm' and ((world->>'day') is distinct from (m.world->>'day') or (world->>'seed') is distinct from (m.world->>'seed')) then
    perform agarias.fail('forbidden');
  end if;
  update agarias.shop_markets sm
     set world = shop_market_save.world, revision = sm.revision + 1, updated_at = now()
   where sm.campaign_id = shop_market_save.campaign_id returning * into m;
  return jsonb_build_object('revision', m.revision, 'updatedAt', m.updated_at);
end $$;

revoke all on function agarias.check_market(jsonb) from public;
do $$
declare f text;
begin
  foreach f in array array['shop_market_get(text,text)', 'shop_market_save(text,text,jsonb,int)'] loop
    execute format('revoke all on function public.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function public.%s to anon, authenticated', f);
    end if;
  end loop;
end $$;
