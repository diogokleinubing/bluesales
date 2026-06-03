-- ============================================================================
-- CRM Fase 1 — perfis: nome + helper is_gestor (papel CRM derivado de is_gestor)
-- ----------------------------------------------------------------------------
-- O papel CRM (gestor/comercial) é derivado de profiles.is_gestor:
--   is_gestor = true  -> 'gestor'  (vê/edita tudo)
--   is_gestor = false -> 'comercial'
-- ============================================================================

alter table profiles add column if not exists nome text;
update profiles set nome = split_part(coalesce(email, ''), '@', 1)
where nome is null or nome = '';

-- Admin atual também é gestor (CRM + menu Mensal do BI).
update profiles set is_gestor = true where is_admin = true;

-- Helper: o usuário atual é gestor? (SECURITY DEFINER evita recursão de RLS)
create or replace function is_gestor()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select p.is_gestor from profiles p where p.id = auth.uid()),
    false
  );
$$;
grant execute on function is_gestor() to authenticated;
revoke execute on function is_gestor() from anon;
