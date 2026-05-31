-- ============================================================================
-- Rollup incremental (escala para milhões de vendas)
-- ----------------------------------------------------------------------------
-- O REFRESH MATERIALIZED VIEW reconstruía TODO o rollup a cada importação e
-- estourava o statement_timeout do PostgREST (8s). Convertemos o rollup em uma
-- TABELA mantida incrementalmente: só os códigos de evento tocados são
-- recomputados (em lotes), mantendo cada chamada curta.
--
-- As funções de leitura bi_* continuam iguais (consultam sales_rollup).
-- ============================================================================

drop materialized view if exists sales_rollup cascade;

create table sales_rollup as
select
  s.org_id,
  s.event_id,
  s.codigo_evento,
  extract(year from s.data_venda)::int   as y_venda,
  extract(month from s.data_venda)::int  as m_venda,
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
create index sales_rollup_org_codigo_idx on sales_rollup (org_id, codigo_evento);

-- ----------------------------------------------------------------------------
-- Manutenção incremental
-- ----------------------------------------------------------------------------

-- Recomputa o rollup APENAS para os códigos informados (chamado em lotes).
create or replace function refresh_rollup_codigos(p_org uuid, p_codigos text[])
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $$
begin
  delete from sales_rollup
  where org_id = p_org and codigo_evento = any(p_codigos);

  insert into sales_rollup
  select
    s.org_id, s.event_id, s.codigo_evento,
    extract(year from s.data_venda)::int,
    extract(month from s.data_venda)::int,
    s.tipo_pdv, count(*)::bigint,
    sum(s.valor_conveniencia), sum(s.comissao_site), sum(s.valor_juros),
    sum(s.receita_intermediacao), sum(s.rebate), sum(s.mdr),
    sum(s.gmv), sum(s.receita_bt), sum(s.receita_liq)
  from sales s
  where s.org_id = p_org and s.codigo_evento = any(p_codigos)
  group by s.org_id, s.event_id, s.codigo_evento,
    extract(year from s.data_venda), extract(month from s.data_venda), s.tipo_pdv;
end;
$$;

-- Remove o rollup de um ano (ao apagar os dados de um ano).
create or replace function prune_rollup_year(p_org uuid, p_year int)
returns void
language sql
security definer
set search_path = public
as $$
  delete from sales_rollup where org_id = p_org and y_venda = p_year;
$$;

-- Limpa todo o rollup da org (modo "substituir tudo" antes de reimportar).
create or replace function clear_rollup(p_org uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from sales_rollup where org_id = p_org;
$$;

-- Rebuild completo (fallback manual; não usado no caminho quente).
create or replace function refresh_sales_rollup()
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '600s'
as $$
begin
  truncate sales_rollup;
  insert into sales_rollup
  select
    s.org_id, s.event_id, s.codigo_evento,
    extract(year from s.data_venda)::int,
    extract(month from s.data_venda)::int,
    s.tipo_pdv, count(*)::bigint,
    sum(s.valor_conveniencia), sum(s.comissao_site), sum(s.valor_juros),
    sum(s.receita_intermediacao), sum(s.rebate), sum(s.mdr),
    sum(s.gmv), sum(s.receita_bt), sum(s.receita_liq)
  from sales s
  group by s.org_id, s.event_id, s.codigo_evento,
    extract(year from s.data_venda), extract(month from s.data_venda), s.tipo_pdv;
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
