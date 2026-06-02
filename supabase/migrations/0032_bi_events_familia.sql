-- ============================================================================
-- bi_events: + coluna familia (família de eventos) no retorno
-- ============================================================================

drop function if exists bi_events(uuid, int, text, text[], text, text, text, text, text, text, text, text, int, int, text);

create or replace function bi_events(
  p_org uuid, p_year int, p_datebase text, p_pdv text[],
  p_search text default null, p_segmento text default null,
  p_organizador text default null, p_local text default null,
  p_cidade text default null, p_uf text default null, p_codigo text default null,
  p_order text default 'gmv', p_limit int default 100, p_offset int default 0,
  p_genero text default null
)
returns table(
  codigo_evento text, nome text, segmento text, genero text, familia text,
  organizador text, local text, cidade text, uf text, data_evento date,
  qtd bigint, gmv numeric, gmv_online numeric, receita_bt numeric,
  receita_liq numeric, mdr numeric, rebate numeric, total_count bigint
)
language sql stable security definer set search_path = public
as $$
  with agg as (
    select
      r.codigo_evento,
      max(e.nome) as nome, max(e.segmento) as segmento, max(e.genero) as genero,
      max(e.familia) as familia, max(e.organizador) as organizador,
      max(e.local) as local, max(e.cidade) as cidade, max(e.uf) as uf,
      max(e.data_evento) as data_evento,
      sum(r.qtd) as qtd, sum(r.gmv) as gmv,
      sum(r.gmv) filter (where r.tipo_pdv = 'E') as gmv_online,
      sum(r.receita_bt) as receita_bt,
      sum(r.receita_liq) as receita_liq, sum(r.v_mdr) as mdr, sum(r.v_rebate) as rebate
    from sales_rollup r
    left join events e on e.id = r.event_id
    where r.org_id = p_org
      and (p_year is null or (case when p_datebase='venda' then r.y_venda
                else extract(year from e.data_evento)::int end) = p_year)
      and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
    group by r.codigo_evento
  ), filt as (
    select * from agg
    where (p_segmento is null or coalesce(segmento,'Sem segmento') = p_segmento)
      and (p_genero is null or coalesce(genero,'Sem gênero') = p_genero)
      and (p_organizador is null or organizador = p_organizador)
      and (p_local is null or local = p_local)
      and (p_cidade is null or cidade = p_cidade)
      and (p_uf is null or uf = p_uf)
      and (p_codigo is null or codigo_evento = p_codigo)
      and (p_search is null or p_search = '' or
           (coalesce(nome,'') || ' ' || codigo_evento || ' ' ||
            coalesce(organizador,'') || ' ' || coalesce(local,'')) ilike '%'||p_search||'%')
  )
  select codigo_evento, nome, segmento, genero, familia, organizador, local,
    cidade, uf, data_evento, qtd, gmv, coalesce(gmv_online,0), receita_bt,
    receita_liq, mdr, rebate, count(*) over() as total_count
  from filt
  order by
    case p_order when 'receita_bt' then receita_bt when 'receita_liq' then receita_liq
                 when 'mdr' then mdr when 'rebate' then rebate else gmv end desc
  limit p_limit offset p_offset;
$$;

revoke execute on function
  bi_events(uuid, int, text, text[], text, text, text, text, text, text, text, text, int, int, text)
from anon, public;
grant execute on function
  bi_events(uuid, int, text, text[], text, text, text, text, text, text, text, text, int, int, text)
to authenticated;
