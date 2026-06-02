-- ============================================================================
-- Fecha exposição de sales_rollup e payments_rollup (Security Advisor)
-- ----------------------------------------------------------------------------
-- Essas tabelas são caches lidos APENAS por funções SECURITY DEFINER (bi_*,
-- refresh_*, prune_*, delete_sales_year), que ignoram RLS. Habilitar RLS sem
-- políticas nega o acesso direto pela API (anon/authenticated) sem quebrar as
-- funções. Também revogamos os grants diretos por garantia.
-- ============================================================================

alter table sales_rollup enable row level security;
alter table payments_rollup enable row level security;

revoke all on sales_rollup from anon, authenticated;
revoke all on payments_rollup from anon, authenticated;
