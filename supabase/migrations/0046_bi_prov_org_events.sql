-- ============================================================================
-- BI Provisionamento — detalhamento por evento de um organizador.
-- Usado pelo "lupa" das colunas GMV (ano-base), YTD e YTG: lista os eventos
-- do organizador no período (ano + faixa de meses) com seu GMV.
-- ============================================================================

create or replace function bi_prov_org_events(
  p_org uuid, p_organizador text, p_year int,
  p_month_min int, p_month_max int, p_datebase text, p_pdv text[]
)
returns table(codigo_evento text, nome text, data_evento date, gmv numeric)
language sql stable security definer set search_path = public
as $$
  select
    e.codigo_evento,
    e.nome,
    e.data_evento,
    sum(r.gmv) as gmv
  from sales_rollup r
  join events e on e.id = r.event_id
  where r.org_id = p_org
    and coalesce(e.organizador, 'Sem organizador') = p_organizador
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) = p_year
    and (case when p_datebase='venda' then r.m_venda
              else extract(month from e.data_evento)::int end) between p_month_min and p_month_max
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  group by e.codigo_evento, e.nome, e.data_evento
  having sum(r.gmv) <> 0
  order by sum(r.gmv) desc;
$$;

revoke execute on function bi_prov_org_events(uuid, text, int, int, int, text, text[]) from anon, public;
grant execute on function bi_prov_org_events(uuid, text, int, int, int, text, text[]) to authenticated;
