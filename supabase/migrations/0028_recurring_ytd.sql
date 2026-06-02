-- ============================================================================
-- Eventos recorrentes: comparativo YTD por família (por data de VENDA)
-- ----------------------------------------------------------------------------
-- Para cada família com volume no ano anterior (p_year - 1), retorna:
--   total_prev  = GMV total do ano anterior (ano cheio)
--   ytd_prev    = GMV do ano anterior até o mês de corte (p_month_max)
--   ytd_cur     = GMV do ano atual até o mês de corte
--   abertura_prev = primeiro mês com vendas no ano anterior (1-12)
-- Eixo de tempo = data de venda (abertura de vendas + YTD de receita).
-- ============================================================================

create or replace function bi_recurring_ytd(
  p_org uuid, p_year int, p_pdv text[], p_month_max int default null
)
returns table(
  familia text,
  total_prev numeric,
  ytd_prev numeric,
  ytd_cur numeric,
  abertura_prev int
)
language sql stable security definer set search_path = public
as $$
  with base as (
    select e.familia as familia, r.y_venda as y, r.m_venda as m, r.gmv as gmv
    from sales_rollup r
    join events e on e.id = r.event_id
    where r.org_id = p_org
      and e.familia is not null and e.familia <> ''
      and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  )
  select
    familia,
    coalesce(sum(gmv) filter (where y = p_year - 1), 0) as total_prev,
    coalesce(sum(gmv) filter (where y = p_year - 1 and m <= coalesce(p_month_max, 12)), 0) as ytd_prev,
    coalesce(sum(gmv) filter (where y = p_year and m <= coalesce(p_month_max, 12)), 0) as ytd_cur,
    min(m) filter (where y = p_year - 1) as abertura_prev
  from base
  group by familia
  having coalesce(sum(gmv) filter (where y = p_year - 1), 0) > 0;
$$;

revoke execute on function bi_recurring_ytd(uuid, int, text[], int) from anon, public;
grant execute on function bi_recurring_ytd(uuid, int, text[], int) to authenticated;
