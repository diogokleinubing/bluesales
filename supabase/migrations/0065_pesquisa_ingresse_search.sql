-- ============================================================================
-- Módulo Pesquisa — Ingresse via API de busca (api-site.ingresse.com).
-- Sem cidades (a busca cobre todas) e paginação por offset.
-- ============================================================================

update crawler_sources
set ativo = true,
    config = (config - 'cidades') || jsonb_build_object('offset', 0, 'scan', 500, 'company_id', 1)
where slug = 'ingresse';
