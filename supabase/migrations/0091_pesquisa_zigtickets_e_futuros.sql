-- ============================================================================
-- Módulo Pesquisa:
--   1) crawler_source_future_counts() — eventos FUTUROS por fonte (data_inicio >= agora)
--      para a coluna "Eventos Futuros" na tela de Sites.
--   2) seed da fonte Zig.Tickets (lista S3 + detalhe _next/data; preço/taxa por slug).
-- ============================================================================

create or replace function crawler_source_future_counts()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_object_agg(source_id, total), '{}'::jsonb)
  from (
    select source_id, count(*) as total
    from crawled_events
    where data_inicio is not null and data_inicio >= now()
    group by source_id
  ) t;
$$;

grant execute on function crawler_source_future_counts() to authenticated;

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Zig.Tickets', 'zigtickets', 'platform', 'edge_api', true, '{}'::jsonb
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
