-- ============================================================================
-- Eventos recorrentes: abertura da edição anterior com mês + ano
-- ----------------------------------------------------------------------------
-- "Abertura Anterior" = primeira venda (mês/ano) da edição que ocorreu no ano
-- anterior (events.data_evento no ano p_year-1). Como há eventos que abrem
-- vendas num ano e realizam em outro, a abertura pode cair no ano retrasado —
-- por isso retornamos também o ano.
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
  abertura_mes int,
  abertura_ano int,
  evento_mes_cur int
)
language sql stable security definer set search_path = public
as $$
  with ev as (
    select e.id, e.familia,
      extract(year from e.data_evento)::int as edicao,
      extract(month from e.data_evento)::int as ev_mes
    from events e
    where e.org_id = p_org and e.familia is not null and e.familia <> ''
  ),
  sales as (
    select ev.familia, ev.edicao, r.y_venda as y, r.m_venda as m, r.gmv as gmv
    from sales_rollup r
    join ev on ev.id = r.event_id
    where r.org_id = p_org
      and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  ),
  agg as (
    select
      familia,
      coalesce(sum(gmv) filter (where y = p_year - 1), 0) as total_prev,
      coalesce(sum(gmv) filter (where y = p_year - 1 and m <= coalesce(p_month_max, 12)), 0) as ytd_prev,
      coalesce(sum(gmv) filter (where y = p_year and m <= coalesce(p_month_max, 12)), 0) as ytd_cur,
      -- ordinal (ano*12 + mes-1) da primeira venda da edição do ano anterior
      min(y * 12 + (m - 1)) filter (where edicao = p_year - 1) as ab_ord
    from sales
    group by familia
    having coalesce(sum(gmv) filter (where y = p_year - 1), 0) > 0
  ),
  evento_cur as (
    select familia, max(ev_mes) filter (where edicao = p_year) as evento_mes_cur
    from ev
    group by familia
  )
  select
    a.familia, a.total_prev, a.ytd_prev, a.ytd_cur,
    case when a.ab_ord is null then null else (a.ab_ord % 12) + 1 end as abertura_mes,
    case when a.ab_ord is null then null else a.ab_ord / 12 end as abertura_ano,
    ec.evento_mes_cur
  from agg a
  left join evento_cur ec on ec.familia = a.familia;
$$;

revoke execute on function bi_recurring_ytd(uuid, int, text[], int) from anon, public;
grant execute on function bi_recurring_ytd(uuid, int, text[], int) to authenticated;
