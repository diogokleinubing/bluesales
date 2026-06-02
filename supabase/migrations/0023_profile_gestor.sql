-- ============================================================================
-- Perfil "Gestor" (independente de Admin)
-- ----------------------------------------------------------------------------
-- Um usuário pode ser Admin e/ou Gestor. Gestor libera o menu "Mensal";
-- Admin libera "Base de dados" e as telas administrativas.
-- ============================================================================

alter table profiles
  add column if not exists is_gestor boolean not null default false;
