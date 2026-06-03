-- ============================================================================
-- CRM Fase 1 — RLS
--   opportunities / activities -> gestor vê tudo; comercial vê só as suas.
--   demais cadastros           -> acesso total para autenticado.
--   audit_log / stage_history  -> somente leitura (escrita via triggers).
-- ============================================================================

-- Acesso total para autenticado nos cadastros gerais.
do $$
declare t text;
begin
  foreach t in array array[
    'funnel_types','funnel_stages','platforms','objections','organizations',
    'persons','crm_locals','artists','crm_events','org_persons','org_segments',
    'org_platforms','crm_event_artists','contact_connections','entity_objections',
    'activity_participants','tasks'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_all', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true)',
      t || '_all', t);
  end loop;
end $$;

-- Oportunidades: gestor tudo; comercial só as próprias.
alter table opportunities enable row level security;
drop policy if exists opportunities_rls on opportunities;
create policy opportunities_rls on opportunities for all to authenticated
  using (is_gestor() or owner_id = auth.uid())
  with check (is_gestor() or owner_id = auth.uid());

-- Atividades: gestor tudo; comercial só as próprias.
alter table activities enable row level security;
drop policy if exists activities_rls on activities;
create policy activities_rls on activities for all to authenticated
  using (is_gestor() or author_id = auth.uid())
  with check (is_gestor() or author_id = auth.uid());

-- Auditoria: somente leitura (inserts vêm dos triggers SECURITY DEFINER).
alter table audit_log enable row level security;
drop policy if exists audit_log_select on audit_log;
create policy audit_log_select on audit_log for select to authenticated using (true);

alter table stage_history enable row level security;
drop policy if exists stage_history_select on stage_history;
create policy stage_history_select on stage_history for select to authenticated using (true);
