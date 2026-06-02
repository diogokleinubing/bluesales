-- ============================================================================
-- delete_sales_year também remove o rollup de pagamentos do ano
-- ----------------------------------------------------------------------------
-- A versão da 0018 limpava sales_rollup, mas não payments_rollup — ao apagar um
-- ano sem reimportar, a tela "Meios de Pagamento" ficava com dados defasados.
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

  -- Remove os rollups consolidados deste ano (vendas e pagamentos).
  delete from sales_rollup where org_id = p_org and y_venda = p_year;
  delete from payments_rollup where org_id = p_org and y_venda = p_year;

  return removed;
end;
$$;

revoke execute on function delete_sales_year(uuid, int) from anon, public;
grant execute on function delete_sales_year(uuid, int) to authenticated;
