-- Permite ao usuário logado editar o próprio nome (a RLS de profiles só deixa
-- admin dar update). Atualiza somente a coluna nome do próprio registro.
create or replace function set_my_nome(p_nome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set nome = nullif(trim(p_nome), '')
  where id = auth.uid();
end;
$$;

grant execute on function set_my_nome(text) to authenticated;
