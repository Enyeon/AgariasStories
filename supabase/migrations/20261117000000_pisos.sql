-- Stories of Agarias · Progresión por pisos (p. ej. Lord 100).
--
-- Cambio que no toca datos: sólo vuelve a definir shop_market_save.
--
-- El piso actual, los requisitos cumplidos y las excepciones del DM viven en
-- world.progress. Igual que el día y los informes, sólo el DM puede cambiarlos:
-- un jugador no puede «subir de piso» ni abrir negocios desde su cliente.

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
    if r <> 'dm' and (coalesce(world->'reports', '[]'::jsonb) <> '[]'::jsonb or world ? 'progress') then perform agarias.fail('forbidden'); end if;
    insert into agarias.shop_markets (campaign_id, world) values (shop_market_save.campaign_id, world) returning * into m;
    return jsonb_build_object('revision', m.revision, 'updatedAt', m.updated_at);
  end if;
  if expected_revision is null or expected_revision <> m.revision then perform agarias.fail('conflict'); end if;
  if r <> 'dm' then
    -- Sólo el DM controla el tiempo y puede reiniciar el mercado.
    if (world->>'day') is distinct from (m.world->>'day') or (world->>'seed') is distinct from (m.world->>'seed') then
      perform agarias.fail('forbidden');
    end if;
    -- Sólo el DM confirma lo que encontraron los exploradores.
    if coalesce(world->'reports', '[]'::jsonb) is distinct from coalesce(m.world->'reports', '[]'::jsonb) then
      perform agarias.fail('forbidden');
    end if;
    -- Sólo el DM decide en qué piso están y qué negocios se abren.
    if (world->'progress') is distinct from (m.world->'progress') then
      perform agarias.fail('forbidden');
    end if;
  end if;
  update agarias.shop_markets sm
     set world = shop_market_save.world, revision = sm.revision + 1, updated_at = now()
   where sm.campaign_id = shop_market_save.campaign_id returning * into m;
  return jsonb_build_object('revision', m.revision, 'updatedAt', m.updated_at);
end $$;

do $$
begin
  execute 'revoke all on function public.shop_market_save(text,text,jsonb,int) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function public.shop_market_save(text,text,jsonb,int) to anon, authenticated';
  end if;
end $$;
