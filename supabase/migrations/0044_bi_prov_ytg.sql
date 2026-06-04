-- ============================================================================
-- BI Provisionamento — adiciona base_ytg ao bi_prov_stats.
-- base_ytg = GMV do organizador no ANO-BASE nos meses SEGUINTES ao último mês
-- com dados no ano-alvo (volume FY do ano-base − YTD do ano-base).
-- ============================================================================

drop function if exists bi_prov_stats(uuid, int, int, text, text[]);

create or replace function bi_prov_stats(
  p_org uuid, p_base_year int, p_target_year int, p_datebase text, p_pdv text[]
)
returns table(organizador text, gmv_base numeric, ytd numeric, base_ytg numeric)
language sql stable security definer set search_path = public
as $$
  with cutoff as (
    select coalesce(max(
      case when p_datebase='venda' then r.m_venda
           else extract(month from e.data_evento)::int end), 0) as m
    from sales_rollup r
    left join events e on e.id = r.event_id
    where r.org_id = p_org
      and (case when p_datebase='venda' then r.y_venda
                else extract(year from e.data_evento)::int end) = p_target_year
      and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  )
  select
    coalesce(e.organizador, 'Sem organizador') as organizador,
    coalesce(sum(r.gmv) filter (where
      (case when p_datebase='venda' then r.y_venda
            else extract(year from e.data_evento)::int end) = p_base_year), 0) as gmv_base,
    coalesce(sum(r.gmv) filter (where
      (case when p_datebase='venda' then r.y_venda
            else extract(year from e.data_evento)::int end) = p_target_year), 0) as ytd,
    coalesce(sum(r.gmv) filter (where
      (case when p_datebase='venda' then r.y_venda
            else extract(year from e.data_evento)::int end) = p_base_year
      and (case when p_datebase='venda' then r.m_venda
                else extract(month from e.data_evento)::int end) > (select m from cutoff)), 0) as base_ytg
  from sales_rollup r
  left join events e on e.id = r.event_id
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) in (p_base_year, p_target_year)
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  group by 1
  having coalesce(sum(r.gmv),0) <> 0;
$$;

revoke execute on function bi_prov_stats(uuid, int, int, text, text[]) from anon, public;
grant execute on function bi_prov_stats(uuid, int, int, text, text[]) to authenticated;
