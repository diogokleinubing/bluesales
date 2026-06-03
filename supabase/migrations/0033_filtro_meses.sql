-- ============================================================================
-- Filtro global de MESES (multi-seleção). p_months int[] = lista de meses 1-12.
-- null ou vazio = todos os meses. Aplicado por data de venda/evento (datebase).
-- ============================================================================

-- ---------- bi_summary ----------
drop function if exists bi_summary(uuid, int, text, text[], int);
create or replace function bi_summary(
  p_org uuid, p_year int, p_datebase text, p_pdv text[],
  p_month_max int default null, p_months int[] default null
)
returns table(
  gmv numeric, gmv_online numeric, receita_bt numeric, receita_liq numeric,
  mdr numeric, rebate numeric,
  conveniencia numeric, comissao numeric, juros numeric, intermediacao numeric,
  qtd bigint, eventos bigint
)
language sql stable security definer set search_path = public
as $$
  select
    coalesce(sum(r.gmv),0),
    coalesce(sum(r.gmv) filter (where r.tipo_pdv = 'E'),0),
    coalesce(sum(r.receita_bt),0), coalesce(sum(r.receita_liq),0),
    coalesce(sum(r.v_mdr),0), coalesce(sum(r.v_rebate),0),
    coalesce(sum(r.v_conveniencia),0), coalesce(sum(r.v_comissao),0),
    coalesce(sum(r.v_juros),0), coalesce(sum(r.v_intermediacao),0),
    coalesce(sum(r.qtd),0), count(distinct r.codigo_evento)
  from sales_rollup r
  left join events e on e.id = r.event_id
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) = p_year
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
    and (p_month_max is null or
         (case when p_datebase='venda' then r.m_venda
               else extract(month from e.data_evento)::int end) <= p_month_max)
    and (p_months is null or array_length(p_months,1) is null or
         (case when p_datebase='venda' then r.m_venda
               else extract(month from e.data_evento)::int end) = any(p_months));
$$;

-- ---------- bi_group ----------
drop function if exists bi_group(uuid, int, text, text[], text, int);
create or replace function bi_group(
  p_org uuid, p_year int, p_datebase text, p_pdv text[], p_dim text,
  p_month_max int default null, p_months int[] default null
)
returns table(
  key text, qtd bigint, gmv numeric, gmv_online numeric,
  receita_bt numeric, receita_liq numeric, mdr numeric, rebate numeric
)
language sql stable security definer set search_path = public
as $$
  select
    case p_dim
      when 'segmento' then e.segmento when 'genero' then e.genero
      when 'organizador' then e.organizador when 'local' then e.local
      when 'cidade' then e.cidade when 'uf' then e.uf
      when 'evento' then r.codigo_evento
    end as key,
    coalesce(sum(r.qtd),0),
    coalesce(sum(r.gmv),0),
    coalesce(sum(r.gmv) filter (where r.tipo_pdv = 'E'),0),
    coalesce(sum(r.receita_bt),0),
    coalesce(sum(r.receita_liq),0), coalesce(sum(r.v_mdr),0), coalesce(sum(r.v_rebate),0)
  from sales_rollup r
  left join events e on e.id = r.event_id
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) = p_year
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
    and (p_month_max is null or
         (case when p_datebase='venda' then r.m_venda
               else extract(month from e.data_evento)::int end) <= p_month_max)
    and (p_months is null or array_length(p_months,1) is null or
         (case when p_datebase='venda' then r.m_venda
               else extract(month from e.data_evento)::int end) = any(p_months))
  group by 1;
$$;

-- ---------- bi_monthly ----------
drop function if exists bi_monthly(uuid, int, text, text[]);
create or replace function bi_monthly(
  p_org uuid, p_year int, p_datebase text, p_pdv text[], p_months int[] default null
)
returns table(month int, gmv numeric, receita_bt numeric, receita_liq numeric,
  mdr numeric, rebate numeric, qtd bigint)
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
    and (p_months is null or array_length(p_months,1) is null or
         (case when p_datebase='venda' then r.m_venda
               else extract(month from e.data_evento)::int end) = any(p_months))
  group by 1;
$$;

-- ---------- bi_monthly_by_group ----------
drop function if exists bi_monthly_by_group(uuid, int, text, text[], text, text[]);
create or replace function bi_monthly_by_group(
  p_org uuid, p_year int, p_datebase text, p_pdv text[], p_dim text, p_keys text[],
  p_months int[] default null
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
    and (p_months is null or array_length(p_months,1) is null or
         (case when p_datebase='venda' then r.m_venda
               else extract(month from e.data_evento)::int end) = any(p_months))
    and (case p_dim
      when 'segmento' then e.segmento when 'genero' then e.genero
      when 'organizador' then e.organizador
      when 'local' then e.local when 'cidade' then e.cidade
      when 'uf' then e.uf else r.codigo_evento end) = any(p_keys)
  group by 1, 2;
$$;

-- ---------- payments_rollup ganha o mês (m_venda) para o filtro de meses ----
alter table payments_rollup add column if not exists m_venda int;

create or replace function refresh_payments_rollup()
returns void
language plpgsql security definer set search_path = public
set statement_timeout = '600s'
as $$
begin
  truncate payments_rollup;
  insert into payments_rollup
  select
    s.org_id,
    extract(year from (s.data_venda at time zone 'utc'))::int,
    s.tipo_pdv,
    coalesce(s.forma_pagamento,'NA'), coalesce(s.operadora,'NA'),
    coalesce(s.parcelas,0),
    count(*)::bigint, sum(s.gmv), sum(s.receita_bt), sum(s.receita_liq),
    sum(s.mdr), sum(s.rebate),
    (coalesce(s.valor_juros,0) > 0),
    extract(month from (s.data_venda at time zone 'utc'))::int
  from sales s
  group by s.org_id,
    extract(year from (s.data_venda at time zone 'utc')),
    s.tipo_pdv, coalesce(s.forma_pagamento,'NA'),
    coalesce(s.operadora,'NA'), coalesce(s.parcelas,0),
    (coalesce(s.valor_juros,0) > 0),
    extract(month from (s.data_venda at time zone 'utc'));
end;
$$;

-- Reconstrói o rollup de pagamentos já com o mês.
select refresh_payments_rollup();

-- ---------- bi_payments_group ----------
drop function if exists bi_payments_group(uuid, int, text[], text, text);
create or replace function bi_payments_group(
  p_org uuid, p_year int, p_pdv text[], p_dim text,
  p_juros text default 'all', p_months int[] default null
)
returns table(
  key text, qtd bigint, gmv numeric, receita_bt numeric,
  receita_liq numeric, mdr numeric, rebate numeric
)
language sql stable security definer set search_path = public
as $$
  select
    case p_dim
      when 'forma' then forma_pagamento when 'operadora' then operadora
      else parcelas::text end as key,
    coalesce(sum(qtd),0), coalesce(sum(gmv),0), coalesce(sum(receita_bt),0),
    coalesce(sum(receita_liq),0), coalesce(sum(v_mdr),0), coalesce(sum(v_rebate),0)
  from payments_rollup
  where org_id = p_org
    and y_venda = p_year
    and (p_pdv is null or array_length(p_pdv,1) is null or tipo_pdv = any(p_pdv))
    and (p_months is null or array_length(p_months,1) is null or m_venda = any(p_months))
    and (
      p_juros is null or p_juros = 'all'
      or (p_juros = 'com' and com_juros is true)
      or (p_juros = 'sem' and com_juros is not true)
    )
  group by 1;
$$;

-- ---------- bi_events ----------
drop function if exists bi_events(uuid, int, text, text[], text, text, text, text, text, text, text, text, int, int, text);
create or replace function bi_events(
  p_org uuid, p_year int, p_datebase text, p_pdv text[],
  p_search text default null, p_segmento text default null,
  p_organizador text default null, p_local text default null,
  p_cidade text default null, p_uf text default null, p_codigo text default null,
  p_order text default 'gmv', p_limit int default 100, p_offset int default 0,
  p_genero text default null, p_months int[] default null
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
      and (p_months is null or array_length(p_months,1) is null or
           (case when p_datebase='venda' then r.m_venda
                 else extract(month from e.data_evento)::int end) = any(p_months))
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

-- ---------- grants ----------
revoke execute on function
  bi_summary(uuid, int, text, text[], int, int[]),
  bi_group(uuid, int, text, text[], text, int, int[]),
  bi_monthly(uuid, int, text, text[], int[]),
  bi_monthly_by_group(uuid, int, text, text[], text, text[], int[]),
  bi_payments_group(uuid, int, text[], text, text, int[]),
  bi_events(uuid, int, text, text[], text, text, text, text, text, text, text, text, int, int, text, int[])
from anon, public;
grant execute on function
  bi_summary(uuid, int, text, text[], int, int[]),
  bi_group(uuid, int, text, text[], text, int, int[]),
  bi_monthly(uuid, int, text, text[], int[]),
  bi_monthly_by_group(uuid, int, text, text[], text, text[], int[]),
  bi_payments_group(uuid, int, text[], text, text, int[]),
  bi_events(uuid, int, text, text[], text, text, text, text, text, text, text, text, int, int, text, int[])
to authenticated;
