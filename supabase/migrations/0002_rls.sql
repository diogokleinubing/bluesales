-- ============================================================================
-- Row Level Security
-- ----------------------------------------------------------------------------
-- Uso interno, org única, usuários autenticados confiáveis: por enquanto
-- qualquer usuário autenticado tem acesso total (select/insert/update/delete).
--
-- QUANDO O MULTI-TENANT FOR ATIVADO: substituir estas policies por filtros
-- que amarrem org_id ao usuário (ex.: uma tabela org_members(user_id, org_id)
-- e policy `org_id in (select org_id from org_members where user_id = auth.uid())`).
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'orgs', 'events', 'sales', 'import_batches',
    'segments', 'keyword_rules', 'venue_rules',
    'venue_segment_map', 'event_segment_override', 'provisioning'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security;', t);

    -- Policy idempotente: dropa se existir e recria.
    execute format('drop policy if exists %I on %I;', t || '_authenticated_all', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true);',
      t || '_authenticated_all', t
    );
  end loop;
end $$;
