-- ============================================================================
-- Troca de senha: flag "deve trocar senha" + limpeza pelo próprio usuário
-- ----------------------------------------------------------------------------
-- Usado pelo reset de senha do admin (senha temporária): ao resetar, o admin
-- marca must_change_password=true; após o login o app força a troca e o
-- próprio usuário limpa o flag via clear_must_change_password().
-- ============================================================================

alter table profiles
  add column if not exists must_change_password boolean not null default false;

-- O usuário limpa o próprio flag (RLS de profiles só permite UPDATE a admin;
-- esta função SECURITY DEFINER dá essa exceção controlada, sem expor is_admin).
create or replace function clear_must_change_password()
returns void
language sql security definer set search_path = public
as $$
  update profiles
  set must_change_password = false
  where id = auth.uid();
$$;

grant execute on function clear_must_change_password() to authenticated;
revoke execute on function clear_must_change_password() from anon;
