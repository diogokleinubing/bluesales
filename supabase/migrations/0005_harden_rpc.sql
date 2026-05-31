-- ============================================================================
-- Hardening: bloquear acesso anônimo às funções de agregação
-- ----------------------------------------------------------------------------
-- O Postgres concede EXECUTE a PUBLIC por padrão ao criar funções, então o
-- papel `anon` (publishable key, visível no front) conseguia chamar as bi_*.
-- Revogamos de anon/public e mantemos apenas usuários autenticados.
-- ============================================================================

revoke execute on all functions in schema public from anon, public;

grant execute on function
  refresh_sales_rollup(),
  bi_years(uuid, text),
  bi_summary(uuid, int, text, text[]),
  bi_monthly(uuid, int, text, text[]),
  bi_group(uuid, int, text, text[], text),
  bi_monthly_by_group(uuid, int, text, text[], text, text[]),
  bi_events(uuid, int, text, text[], text, text, text, text, text, text, text, text, int, int),
  bi_event_options(uuid, int, text, text[]),
  bi_popular_venues(uuid, text, int),
  bi_ytd_monthly(uuid, int, int, int, text, text[]),
  bi_ytd_group(uuid, int, int, int, text, text[], text),
  bi_prov_stats(uuid, int, int, text, text[]),
  bi_months_elapsed(uuid, int, text, text[]),
  bi_base_summary(uuid),
  bi_base_totals(uuid)
to authenticated;
