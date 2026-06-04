-- ============================================================================
-- CRM — "Tarefa" passa a ser um tipo de atividade.
-- ============================================================================

alter table activities drop constraint if exists activities_tipo_check;
alter table activities add constraint activities_tipo_check
  check (tipo in ('Reunião', 'Ligação', 'Email', 'WhatsApp', 'Nota', 'Tarefa', 'Outro'));
