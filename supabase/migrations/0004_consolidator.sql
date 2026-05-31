-- ============================================================================
-- Consolidador (rollup) + RPCs de agregação
-- ----------------------------------------------------------------------------
-- Com milhões de vendas, agregamos no Postgres. A materialized view
-- sales_rollup pré-soma as vendas no grão (org, evento, ano/mês da venda,
-- tipo_pdv). As funções bi_* leem o rollup (rápido) e devolvem só o resultado
-- agregado de cada tela. Atributos do evento (incl. segmento) vêm por join na
-- leitura, então reclassificar NÃO exige rebuild do rollup; só a importação.
--
-- Segurança: as funções são SECURITY DEFINER e filtram por p_org. O matview
-- não é exposto ao PostgREST (sem grant para authenticated). Multi-tenant
-- futuro: derivar o org do usuário em vez de receber p_org do client.
-- ============================================================================

drop materialized view if exists sales_rollup cascade;

create materialized view sales_rollup as
select
  s.org_id,
  s.event_id,
  s.codigo_evento,
  extract(year from s.data_venda)::int   as y_venda,
  extract(month from s.data_venda)::int  as m_venda,   -- 1-12 (null se data corrompida)
  s.tipo_pdv,
  count(*)::bigint                        as qtd,
  sum(s.valor_conveniencia)              as v_conveniencia,
  sum(s.comissao_site)                   as v_comissao,
  sum(s.valor_juros)                     as v_juros,
  sum(s.receita_intermediacao)           as v_intermediacao,
  sum(s.rebate)                          as v_rebate,
  sum(s.mdr)                             as v_mdr,
  sum(s.gmv)                             as gmv,
  sum(s.receita_bt)                      as receita_bt,
  sum(s.receita_liq)                     as receita_liq
from sales s
group by s.org_id, s.event_id, s.codigo_evento,
  extract(year from s.data_venda), extract(month from s.data_venda), s.tipo_pdv;

create index sales_rollup_org_yv_idx on sales_rollup (org_id, y_venda);
create index sales_rollup_org_event_idx on sales_rollup (org_id, event_id);
create index sales_rollup_codigo_idx on sales_rollup (codigo_evento);

-- Atualiza o rollup (chamar após cada importação via rpc).
create or replace function refresh_sales_rollup()
returns void
language sql
security definer
set search_path = public
as $$
  refresh materialized view sales_rollup;
$$;

-- ----------------------------------------------------------------------------
-- Helpers de período por base de data (venda vs evento) embutidos nas funções.
-- Convenção: mês retornado é 0-11 (compatível com o client).
-- ----------------------------------------------------------------------------

-- Anos disponíveis conforme a base de data.
create or replace function bi_years(p_org uuid, p_datebase text)
returns setof int
language sql stable security definer set search_path = public
as $$
  select distinct yr from (
    select case when p_datebase = 'venda' then r.y_venda
                else extract(year from e.data_evento)::int end as yr
    from sales_rollup r
    left join events e on e.id = r.event_id
    where r.org_id = p_org
  ) t
  where yr is not null
  order by yr desc;
$$;

-- Resumo (KPIs + composição) de um ano.
create or replace function bi_summary(
  p_org uuid, p_year int, p_datebase text, p_pdv text[]
)
returns table(
  gmv numeric, receita_bt numeric, receita_liq numeric, mdr numeric, rebate numeric,
  conveniencia numeric, comissao numeric, juros numeric, intermediacao numeric,
  qtd bigint, eventos bigint
)
language sql stable security definer set search_path = public
as $$
  select
    coalesce(sum(r.gmv),0), coalesce(sum(r.receita_bt),0), coalesce(sum(r.receita_liq),0),
    coalesce(sum(r.v_mdr),0), coalesce(sum(r.v_rebate),0),
    coalesce(sum(r.v_conveniencia),0), coalesce(sum(r.v_comissao),0),
    coalesce(sum(r.v_juros),0), coalesce(sum(r.v_intermediacao),0),
    coalesce(sum(r.qtd),0), count(distinct r.codigo_evento)
  from sales_rollup r
  left join events e on e.id = r.event_id
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) = p_year
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv));
$$;

-- Série mensal (12 meses, todas as métricas).
create or replace function bi_monthly(
  p_org uuid, p_year int, p_datebase text, p_pdv text[]
)
returns table(
  month int, gmv numeric, receita_bt numeric, receita_liq numeric,
  mdr numeric, rebate numeric, qtd bigint
)
language sql stable security definer set search_path = public
as $$
  select
    (case when p_datebase='venda' then r.m_venda
          else extract(month from e.data_evento)::int end) - 1 as month,
    coalesce(sum(r.gmv),0), coalesce(sum(r.receita_bt),0), coalesce(sum(r.receita_liq),0),
    coalesce(sum(r.v_mdr),0), coalesce(sum(r.v_rebate),0), coalesce(sum(r.qtd),0)
  from sales_rollup r
  left join events e on e.id = r.event_id
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) = p_year
    and (case when p_datebase='venda' then r.m_venda
              else extract(month from e.data_evento)::int end) is not null
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  group by 1;
$$;

-- Agregação por dimensão (segmento/organizador/local/cidade/uf/evento).
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

-- Série mensal por dimensão, restrita aos grupos informados (multi-linha).
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
      when 'segmento' then e.segmento when 'organizador' then e.organizador
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
      when 'segmento' then e.segmento when 'organizador' then e.organizador
      when 'local' then e.local when 'cidade' then e.cidade
      when 'uf' then e.uf else r.codigo_evento end) = any(p_keys)
  group by 1, 2;
$$;

-- Eventos agregados, com filtros, busca, ordenação por métrica e paginação.
create or replace function bi_events(
  p_org uuid, p_year int, p_datebase text, p_pdv text[],
  p_search text default null, p_segmento text default null,
  p_organizador text default null, p_local text default null,
  p_cidade text default null, p_uf text default null, p_codigo text default null,
  p_order text default 'gmv', p_limit int default 100, p_offset int default 0
)
returns table(
  codigo_evento text, nome text, segmento text, organizador text, local text,
  cidade text, uf text, data_evento date, qtd bigint,
  gmv numeric, receita_bt numeric, receita_liq numeric, mdr numeric, rebate numeric,
  total_count bigint
)
language sql stable security definer set search_path = public
as $$
  with agg as (
    select
      r.codigo_evento,
      max(e.nome) as nome, max(e.segmento) as segmento, max(e.organizador) as organizador,
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
      and (p_organizador is null or organizador = p_organizador)
      and (p_local is null or local = p_local)
      and (p_cidade is null or cidade = p_cidade)
      and (p_uf is null or uf = p_uf)
      and (p_codigo is null or codigo_evento = p_codigo)
      and (p_search is null or p_search = '' or
           (coalesce(nome,'') || ' ' || codigo_evento || ' ' ||
            coalesce(organizador,'') || ' ' || coalesce(local,'')) ilike '%'||p_search||'%')
  )
  select codigo_evento, nome, segmento, organizador, local, cidade, uf, data_evento,
    qtd, gmv, receita_bt, receita_liq, mdr, rebate,
    count(*) over() as total_count
  from filt
  order by
    case p_order when 'receita_bt' then receita_bt when 'receita_liq' then receita_liq
                 when 'mdr' then mdr when 'rebate' then rebate else gmv end desc
  limit p_limit offset p_offset;
$$;

-- Opções de filtro distintas (para os selects da tela Eventos).
create or replace function bi_event_options(p_org uuid, p_year int, p_datebase text, p_pdv text[])
returns table(dim text, value text)
language sql stable security definer set search_path = public
as $$
  with ev as (
    select distinct r.codigo_evento, e.segmento, e.organizador, e.local, e.cidade, e.uf
    from sales_rollup r left join events e on e.id = r.event_id
    where r.org_id = p_org
      and (case when p_datebase='venda' then r.y_venda
                else extract(year from e.data_evento)::int end) = p_year
      and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  )
  select 'segmento', coalesce(segmento,'Sem segmento') from ev where true
  union select 'organizador', organizador from ev where organizador is not null
  union select 'local', local from ev where local is not null
  union select 'cidade', cidade from ev where cidade is not null
  union select 'uf', uf from ev where uf is not null;
$$;

-- Locais mais populares (por nº de eventos distintos) — tela Regras.
create or replace function bi_popular_venues(
  p_org uuid, p_search text default null, p_limit int default 200
)
returns table(local text, eventos bigint)
language sql stable security definer set search_path = public
as $$
  select e.local, count(distinct r.codigo_evento) as eventos
  from sales_rollup r
  join events e on e.id = r.event_id
  where r.org_id = p_org
    and e.local is not null and e.local <> ''
    and (p_search is null or p_search = '' or e.local ilike '%'||p_search||'%')
  group by e.local
  order by eventos desc
  limit p_limit;
$$;

-- YTD: série mensal alvo vs base no período.
create or replace function bi_ytd_monthly(
  p_org uuid, p_target_year int, p_mstart int, p_mend int, p_datebase text, p_pdv text[]
)
returns table(month int, is_target boolean, gmv numeric, receita_bt numeric,
  receita_liq numeric, mdr numeric, rebate numeric)
language sql stable security definer set search_path = public
as $$
  select
    (case when p_datebase='venda' then r.m_venda
          else extract(month from e.data_evento)::int end) - 1 as month,
    (case when p_datebase='venda' then r.y_venda
          else extract(year from e.data_evento)::int end) = p_target_year as is_target,
    coalesce(sum(r.gmv),0), coalesce(sum(r.receita_bt),0), coalesce(sum(r.receita_liq),0),
    coalesce(sum(r.v_mdr),0), coalesce(sum(r.v_rebate),0)
  from sales_rollup r
  left join events e on e.id = r.event_id
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) in (p_target_year, p_target_year-1)
    and (case when p_datebase='venda' then r.m_venda
              else extract(month from e.data_evento)::int end) - 1
        between least(p_mstart,p_mend) and greatest(p_mstart,p_mend)
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  group by 1, 2;
$$;

-- YTD: agregação por dimensão, alvo vs base no período.
create or replace function bi_ytd_group(
  p_org uuid, p_target_year int, p_mstart int, p_mend int, p_datebase text,
  p_pdv text[], p_dim text
)
returns table(key text, is_target boolean, gmv numeric, receita_bt numeric,
  receita_liq numeric, mdr numeric, rebate numeric)
language sql stable security definer set search_path = public
as $$
  select
    case p_dim
      when 'segmento' then e.segmento when 'organizador' then e.organizador
      when 'local' then e.local when 'cidade' then e.cidade
      when 'uf' then e.uf else r.codigo_evento end as key,
    (case when p_datebase='venda' then r.y_venda
          else extract(year from e.data_evento)::int end) = p_target_year as is_target,
    coalesce(sum(r.gmv),0), coalesce(sum(r.receita_bt),0), coalesce(sum(r.receita_liq),0),
    coalesce(sum(r.v_mdr),0), coalesce(sum(r.v_rebate),0)
  from sales_rollup r
  left join events e on e.id = r.event_id
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) in (p_target_year, p_target_year-1)
    and (case when p_datebase='venda' then r.m_venda
              else extract(month from e.data_evento)::int end) - 1
        between least(p_mstart,p_mend) and greatest(p_mstart,p_mend)
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  group by 1, 2;
$$;

-- Provisionamento: GMV base e YTD por organizador + meses decorridos no alvo.
create or replace function bi_prov_stats(
  p_org uuid, p_base_year int, p_target_year int, p_datebase text, p_pdv text[]
)
returns table(organizador text, gmv_base numeric, ytd numeric)
language sql stable security definer set search_path = public
as $$
  select
    coalesce(e.organizador, 'Sem organizador') as organizador,
    coalesce(sum(r.gmv) filter (where
      (case when p_datebase='venda' then r.y_venda
            else extract(year from e.data_evento)::int end) = p_base_year), 0) as gmv_base,
    coalesce(sum(r.gmv) filter (where
      (case when p_datebase='venda' then r.y_venda
            else extract(year from e.data_evento)::int end) = p_target_year), 0) as ytd
  from sales_rollup r
  left join events e on e.id = r.event_id
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) in (p_base_year, p_target_year)
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  group by 1
  having coalesce(sum(r.gmv),0) <> 0;
$$;

-- Meses decorridos (com dados) no ano-alvo.
create or replace function bi_months_elapsed(
  p_org uuid, p_year int, p_datebase text, p_pdv text[]
)
returns int
language sql stable security definer set search_path = public
as $$
  select coalesce(max(
    (case when p_datebase='venda' then r.m_venda
          else extract(month from e.data_evento)::int end)), 12)
  from sales_rollup r
  left join events e on e.id = r.event_id
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) = p_year
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv));
$$;

-- Resumo da base por ano (tela Armazenamento/Base).
create or replace function bi_base_summary(p_org uuid)
returns table(year int, qtd bigint, gmv numeric)
language sql stable security definer set search_path = public
as $$
  select r.y_venda, coalesce(sum(r.qtd),0), coalesce(sum(r.gmv),0)
  from sales_rollup r
  where r.org_id = p_org and r.y_venda is not null
  group by r.y_venda
  order by r.y_venda desc;
$$;

create or replace function bi_base_totals(p_org uuid)
returns table(qtd bigint, eventos bigint, gmv numeric)
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(r.qtd),0), count(distinct r.codigo_evento), coalesce(sum(r.gmv),0)
  from sales_rollup r where r.org_id = p_org;
$$;

-- Permissões: só execução das funções para usuários autenticados.
grant execute on function
  refresh_sales_rollup(),
  bi_years(uuid, text),
  bi_summary(uuid, int, text, text[]),
  bi_monthly(uuid, int, text, text[]),
  bi_group(uuid, int, text, text[], text),
  bi_monthly_by_group(uuid, int, text, text[], text, text[]),
  bi_events(uuid, int, text, text[], text, text, text, text, text, text, text, text, int, int),
  bi_event_options(uuid, int, text, text[]),
  bi_popular_venues(uuid, text, int),
  bi_ytd_monthly(uuid, int, int, int, text, text[]),
  bi_ytd_group(uuid, int, int, int, text, text[], text),
  bi_prov_stats(uuid, int, int, text, text[]),
  bi_months_elapsed(uuid, int, text, text[]),
  bi_base_summary(uuid),
  bi_base_totals(uuid)
to authenticated;
