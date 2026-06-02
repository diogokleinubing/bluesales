-- ============================================================================
-- Eventos recorrentes: + mês do evento do ano atual (para status "Finalizado")
-- ============================================================================

drop function if exists bi_recurring_ytd(uuid, int, text[], int);

create or replace function bi_recurring_ytd(
  p_org uuid, p_year int, p_pdv text[], p_month_max int default null
)
returns table(
  familia text,
  total_prev numeric,
  ytd_prev numeric,
  ytd_cur numeric,
  abertura_prev int,
  evento_mes_cur int
)
language sql stable security definer set search_path = public
as $$
  with sales as (
    select e.familia as familia, r.y_venda as y, r.m_venda as m, r.gmv as gmv
    from sales_rollup r
    join events e on e.id = r.event_id
    where r.org_id = p_org
      and e.familia is not null and e.familia <> ''
      and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  ),
  agg as (
    select
      familia,
      coalesce(sum(gmv) filter (where y = p_year - 1), 0) as total_prev,
      coalesce(sum(gmv) filter (where y = p_year - 1 and m <= coalesce(p_month_max, 12)), 0) as ytd_prev,
      coalesce(sum(gmv) filter (where y = p_year and m <= coalesce(p_month_max, 12)), 0) as ytd_cur,
      min(m) filter (where y = p_year - 1) as abertura_prev
    from sales
    group by familia
    having coalesce(sum(gmv) filter (where y = p_year - 1), 0) > 0
  ),
  evento_cur as (
    select e.familia,
      max(extract(month from e.data_evento)::int) as evento_mes_cur
    from events e
    where e.org_id = p_org
      and e.familia is not null and e.familia <> ''
      and extract(year from e.data_evento)::int = p_year
    group by e.familia
  )
  select a.familia, a.total_prev, a.ytd_prev, a.ytd_cur, a.abertura_prev,
    ec.evento_mes_cur
  from agg a
  left join evento_cur ec on ec.familia = a.familia;
$$;

revoke execute on function bi_recurring_ytd(uuid, int, text[], int) from anon, public;
grant execute on function bi_recurring_ytd(uuid, int, text[], int) to authenticated;
