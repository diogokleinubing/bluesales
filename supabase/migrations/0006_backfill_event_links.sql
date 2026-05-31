-- ============================================================================
-- Backfill do vínculo venda -> evento
-- ----------------------------------------------------------------------------
-- Como eventos e vendas podem ser importados separadamente e em qualquer ordem,
-- vendas cujo evento ainda não existe entram com event_id = null (mantendo o
-- codigo_evento). Quando o evento correspondente é importado, esta função
-- reconecta as vendas órfãs em uma única operação set-based.
-- Retorna a quantidade de vendas vinculadas.
-- ============================================================================

create or replace function backfill_event_links(p_org uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update sales s
  set event_id = e.id
  from events e
  where s.org_id = p_org
    and e.org_id = p_org
    and s.event_id is null
    and s.codigo_evento = e.codigo_evento;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Mantém o padrão de segurança: sem acesso anônimo.
revoke execute on function backfill_event_links(uuid) from anon, public;
grant execute on function backfill_event_links(uuid) to authenticated;
