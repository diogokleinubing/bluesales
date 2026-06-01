-- ============================================================================
-- RPCs de leitura passam a suportar a dimensão Gênero (events.genero)
-- ----------------------------------------------------------------------------
-- Adiciona 'genero' a bi_group / bi_monthly_by_group, e gênero (retorno +
-- filtro) em bi_events e bi_event_options. Reaplica após 0015 (events.genero).
-- ============================================================================

create or replace function bi_group(
  p_org uuid, p_year int, p_datebase text, p_pdv text[], p_dim text
)
returns table(
  key text, qtd bigint, gmv numeric, receita_bt numeric, receita_liq numeric,
  mdr numeric, rebate numeric
)
language sql stable security definer set search_path = public
as $$
  select
    case p_dim
      when 'segmento' then e.segmento
      when 'genero' then e.genero
      when 'organizador' then e.organizador
      when 'local' then e.local
      when 'cidade' then e.cidade
      when 'uf' then e.uf
      when 'evento' then r.codigo_evento
    end as key,
    coalesce(sum(r.qtd),0), coalesce(sum(r.gmv),0), coalesce(sum(r.receita_bt),0),
    coalesce(sum(r.receita_liq),0), coalesce(sum(r.v_mdr),0), coalesce(sum(r.v_rebate),0)
  from sales_rollup r
  left join events e on e.id = r.event_id
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) = p_year
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  group by 1;
$$;

create or replace function bi_monthly_by_group(
  p_org uuid, p_year int, p_datebase text, p_pdv text[], p_dim text, p_keys text[]
)
returns table(month int, key text, gmv numeric, receita_bt numeric,
  receita_liq numeric, mdr numeric, rebate numeric)
language sql stable security definer set search_path = public
as $$
  select
    (case when p_datebase='venda' then r.m_venda
          else extract(month from e.data_evento)::int end) - 1 as month,
    case p_dim
      when 'segmento' then e.segmento when 'genero' then e.genero
      when 'organizador' then e.organizador
      when 'local' then e.local when 'cidade' then e.cidade
      when 'uf' then e.uf else r.codigo_evento end as key,
    coalesce(sum(r.gmv),0), coalesce(sum(r.receita_bt),0), coalesce(sum(r.receita_liq),0),
    coalesce(sum(r.v_mdr),0), coalesce(sum(r.v_rebate),0)
  from sales_rollup r
  left join events e on e.id = r.event_id
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) = p_year
    and (case when p_datebase='venda' then r.m_venda
              else extract(month from e.data_evento)::int end) is not null
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
    and (case p_dim
      when 'segmento' then e.segmento when 'genero' then e.genero
      when 'organizador' then e.organizador
      when 'local' then e.local when 'cidade' then e.cidade
      when 'uf' then e.uf else r.codigo_evento end) = any(p_keys)
  group by 1, 2;
$$;

-- bi_events: + coluna genero no retorno e filtro p_genero.
create or replace function bi_events(
  p_org uuid, p_year int, p_datebase text, p_pdv text[],
  p_search text default null, p_segmento text default null,
  p_organizador text default null, p_local text default null,
  p_cidade text default null, p_uf text default null, p_codigo text default null,
  p_order text default 'gmv', p_limit int default 100, p_offset int default 0,
  p_genero text default null
)
returns table(
  codigo_evento text, nome text, segmento text, genero text, organizador text,
  local text, cidade text, uf text, data_evento date, qtd bigint,
  gmv numeric, receita_bt numeric, receita_liq numeric, mdr numeric, rebate numeric,
  total_count bigint
)
language sql stable security definer set search_path = public
as $$
  with agg as (
    select
      r.codigo_evento,
      max(e.nome) as nome, max(e.segmento) as segmento, max(e.genero) as genero,
      max(e.organizador) as organizador,
      max(e.local) as local, max(e.cidade) as cidade, max(e.uf) as uf,
      max(e.data_evento) as data_evento,
      sum(r.qtd) as qtd, sum(r.gmv) as gmv, sum(r.receita_bt) as receita_bt,
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
  select codigo_evento, nome, segmento, genero, organizador, local, cidade, uf,
    data_evento, qtd, gmv, receita_bt, receita_liq, mdr, rebate,
    count(*) over() as total_count
  from filt
  order by
    case p_order when 'receita_bt' then receita_bt when 'receita_liq' then receita_liq
                 when 'mdr' then mdr when 'rebate' then rebate else gmv end desc
  limit p_limit offset p_offset;
$$;

-- bi_event_options: inclui gêneros distintos.
create or replace function bi_event_options(p_org uuid, p_year int, p_datebase text, p_pdv text[])
returns table(dim text, value text)
language sql stable security definer set search_path = public
as $$
  with ev as (
    select distinct r.codigo_evento, e.segmento, e.genero, e.organizador,
      e.local, e.cidade, e.uf
    from sales_rollup r left join events e on e.id = r.event_id
    where r.org_id = p_org
      and (case when p_datebase='venda' then r.y_venda
                else extract(year from e.data_evento)::int end) = p_year
      and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  )
  select 'segmento', coalesce(segmento,'Sem segmento') from ev where true
  union select 'genero', coalesce(genero,'Sem gênero') from ev where true
  union select 'organizador', organizador from ev where organizador is not null
  union select 'local', local from ev where local is not null
  union select 'cidade', cidade from ev where cidade is not null
  union select 'uf', uf from ev where uf is not null;
$$;

revoke execute on function
  bi_group(uuid, int, text, text[], text),
  bi_monthly_by_group(uuid, int, text, text[], text, text[]),
  bi_events(uuid, int, text, text[], text, text, text, text, text, text, text, text, int, int, text),
  bi_event_options(uuid, int, text, text[])
from anon, public;
grant execute on function
  bi_group(uuid, int, text, text[], text),
  bi_monthly_by_group(uuid, int, text, text[], text, text[]),
  bi_events(uuid, int, text, text[], text, text, text, text, text, text, text, text, int, int, text),
  bi_event_options(uuid, int, text, text[])
to authenticated;
