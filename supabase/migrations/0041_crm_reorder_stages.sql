-- ============================================================================
-- CRM — reordenar estágios de um funil atomicamente (respeita unique seq)
-- ----------------------------------------------------------------------------
-- p_ids = ids dos estágios na ordem desejada (todos do mesmo funil). Define
-- sequencia = 1..N em dois passos (negativos -> finais) para não colidir com a
-- constraint unique (funnel_type_id, sequencia).
-- ============================================================================

create or replace function crm_reorder_funnel_stages(p_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  i int;
begin
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    update funnel_stages set sequencia = -i where id = p_ids[i];
  end loop;
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    update funnel_stages set sequencia = i where id = p_ids[i];
  end loop;
end;
$$;

revoke execute on function crm_reorder_funnel_stages(uuid[]) from anon, public;
grant execute on function crm_reorder_funnel_stages(uuid[]) to authenticated;
