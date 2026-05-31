-- ============================================================================
-- Fix de timezone no rollup: extrair ano/mês da data_venda em UTC
-- ----------------------------------------------------------------------------
-- data_venda é timestamptz. As competências entram como meia-noite UTC do dia 1
-- (ex.: 2025-01-01T00:00:00Z). `extract(year from data_venda)` converte para o
-- fuso da SESSÃO antes de extrair: num fuso negativo (-03), 01/jan 00:00 UTC
-- vira 31/dez do ano anterior -> vendas de jan/2025 caíam em 2024.
--
-- Correção: extrair com `at time zone 'utc'` (consistente com a geração das
-- datas). Recria o rollup e as funções de manutenção; depois um rebuild.
-- As funções de LEITURA (bi_*) usam r.y_venda/r.m_venda do rollup para venda e
-- data_evento (tipo date, sem TZ) para evento — não precisam mudar.
-- ============================================================================

drop table if exists sales_rollup cascade;

create table sales_rollup as
select
  s.org_id,
  s.event_id,
  s.codigo_evento,
  extract(year from (s.data_venda at time zone 'utc'))::int   as y_venda,
  extract(month from (s.data_venda at time zone 'utc'))::int  as m_venda,
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
  extract(year from (s.data_venda at time zone 'utc')),
  extract(month from (s.data_venda at time zone 'utc')), s.tipo_pdv;

create index sales_rollup_org_yv_idx on sales_rollup (org_id, y_venda);
create index sales_rollup_org_event_idx on sales_rollup (org_id, event_id);
create index sales_rollup_org_codigo_idx on sales_rollup (org_id, codigo_evento);

-- Recomputa o rollup APENAS para os códigos informados (incremental).
create or replace function refresh_rollup_codigos(p_org uuid, p_codigos text[])
returns void
language plpgsql security definer set search_path = public
set statement_timeout = '120s'
as $$
begin
  delete from sales_rollup
  where org_id = p_org and codigo_evento = any(p_codigos);

  insert into sales_rollup
  select
    s.org_id, s.event_id, s.codigo_evento,
    extract(year from (s.data_venda at time zone 'utc'))::int,
    extract(month from (s.data_venda at time zone 'utc'))::int,
    s.tipo_pdv, count(*)::bigint,
    sum(s.valor_conveniencia), sum(s.comissao_site), sum(s.valor_juros),
    sum(s.receita_intermediacao), sum(s.rebate), sum(s.mdr),
    sum(s.gmv), sum(s.receita_bt), sum(s.receita_liq)
  from sales s
  where s.org_id = p_org and s.codigo_evento = any(p_codigos)
  group by s.org_id, s.event_id, s.codigo_evento,
    extract(year from (s.data_venda at time zone 'utc')),
    extract(month from (s.data_venda at time zone 'utc')), s.tipo_pdv;
end;
$$;

create or replace function prune_rollup_year(p_org uuid, p_year int)
returns void language sql security definer set search_path = public
as $$
  delete from sales_rollup where org_id = p_org and y_venda = p_year;
$$;

create or replace function clear_rollup(p_org uuid)
returns void language sql security definer set search_path = public
as $$
  delete from sales_rollup where org_id = p_org;
$$;

create or replace function refresh_sales_rollup()
returns void
language plpgsql security definer set search_path = public
set statement_timeout = '600s'
as $$
begin
  truncate sales_rollup;
  insert into sales_rollup
  select
    s.org_id, s.event_id, s.codigo_evento,
    extract(year from (s.data_venda at time zone 'utc'))::int,
    extract(month from (s.data_venda at time zone 'utc'))::int,
    s.tipo_pdv, count(*)::bigint,
    sum(s.valor_conveniencia), sum(s.comissao_site), sum(s.valor_juros),
    sum(s.receita_intermediacao), sum(s.rebate), sum(s.mdr),
    sum(s.gmv), sum(s.receita_bt), sum(s.receita_liq)
  from sales s
  group by s.org_id, s.event_id, s.codigo_evento,
    extract(year from (s.data_venda at time zone 'utc')),
    extract(month from (s.data_venda at time zone 'utc')), s.tipo_pdv;
end;
$$;

revoke execute on function
  refresh_rollup_codigos(uuid, text[]),
  prune_rollup_year(uuid, int),
  clear_rollup(uuid)
from anon, public;
grant execute on function
  refresh_rollup_codigos(uuid, text[]),
  prune_rollup_year(uuid, int),
  clear_rollup(uuid)
to authenticated;

-- Reconstrói o rollup já corrigido a partir das vendas existentes.
select refresh_sales_rollup();
