-- Membros passam a ler TODOS os profiles (antes: só o próprio ou admin).
-- Necessário para atribuir responsável às oportunidades e exibir nomes/avatares
-- dos donos nos boards compartilhados. Mantém a barreira is_member() (2FA);
-- o próprio profile continua legível sempre (bootstrap do app).
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or is_member());
