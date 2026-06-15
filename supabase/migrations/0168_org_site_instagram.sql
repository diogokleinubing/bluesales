-- ============================================================================
-- Organizações: campos de site e Instagram (exibidos como links no detalhe).
-- Instagram aceita link completo, "@perfil" ou só o nome — a URL é montada no
-- front (lib/links).
-- ============================================================================

alter table organizations
  add column if not exists site text,
  add column if not exists instagram text;
