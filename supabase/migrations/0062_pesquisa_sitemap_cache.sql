-- ============================================================================
-- Módulo Pesquisa — cache do sitemap (evita rebaixar ~4,8 MB a cada execução).
-- Atualizado no máximo 1x por dia pelo scraper. Acesso só via service_role
-- (Edge Functions); RLS habilitada sem políticas = clientes não leem/escrevem.
-- ============================================================================

create table if not exists crawler_cache (
  source_slug text primary key,
  sitemap jsonb,
  fetched_at timestamptz not null default now()
);

alter table crawler_cache enable row level security;
