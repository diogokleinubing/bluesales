-- ============================================================================
-- Exclusão de vendas por ano (robusta a timeout)
-- ----------------------------------------------------------------------------
-- O DELETE em massa por faixa de data_venda estourava o statement_timeout da
-- API (~8s) em bases grandes. Isso quebrava "Apagar base do ano" e, pior, no
-- modo MESCLAR o erro era silencioso: a exclusão falhava e as vendas eram
-- reinseridas, multiplicando os dados.
--
-- Esta função roda no servidor com timeout ampliado e apaga em lotes (ctid),
-- e já remove o rollup do ano. Usa o ano em UTC (igual ao y_venda do rollup).
-- ============================================================================

create or replace function delete_sales_year(p_org uuid, p_year int)
returns bigint
language plpgsql
security definer
set search_path = public
set statement_timeout = '600s'
as $$
declare
  lo timestamptz := make_timestamptz(p_year, 1, 1, 0, 0, 0, 'UTC');
  hi timestamptz := make_timestamptz(p_year + 1, 1, 1, 0, 0, 0, 'UTC');
  removed bigint := 0;
begin
  loop
    delete from sales
    where ctid in (
      select ctid from sales
      where org_id = p_org
        and data_venda >= lo
        and data_venda < hi
      limit 10000
    );
    exit when not found;
    removed := removed + 10000;
  end loop;

  -- Remove o rollup consolidado deste ano.
  delete from sales_rollup where org_id = p_org and y_venda = p_year;

  return removed;
end;
$$;

revoke execute on function delete_sales_year(uuid, int) from anon, public;
grant execute on function delete_sales_year(uuid, int) to authenticated;
