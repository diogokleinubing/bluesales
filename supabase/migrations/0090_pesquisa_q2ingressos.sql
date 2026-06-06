-- ============================================================================
-- Módulo Pesquisa — fonte Q2 Ingressos (APIs JSON no CDN: lista + detalhe slug).
-- Sem cidades; cobertura por cursor deslizante (config.offset). Detalhe traz
-- preço/taxa/Instagram da produção.
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Q2 Ingressos', 'q2ingressos', 'platform', 'edge_api', true, '{}'::jsonb
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
