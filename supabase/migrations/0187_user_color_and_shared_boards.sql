-- ============================================================================
-- 1) Cor do usuário (usada nos avatares dos cards).
-- 2) Boards compartilhados: todos os membros veem TODAS as oportunidades e
--    atividades (antes o comercial via só as próprias). Mantém a barreira
--    is_member() (membership + 2FA); apenas remove o recorte por owner.
-- ============================================================================

alter table profiles add column if not exists color text;

-- Remove qualquer policy atual dessas tabelas e recria com is_member() (todos).
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('opportunities', 'activities')
  loop
    execute format('drop policy %I on %I', p.policyname, p.tablename);
  end loop;
end $$;

alter table opportunities enable row level security;
alter table activities enable row level security;

create policy opportunities_member on opportunities
  for all to authenticated using (is_member()) with check (is_member());
create policy activities_member on activities
  for all to authenticated using (is_member()) with check (is_member());
