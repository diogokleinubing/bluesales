-- ============================================================================
-- Módulo Pesquisa — fonte Sympla Bileto (eventos grandes).
-- Descoberta por varredura de IDs (sem sitemap): config.id_cursor avança a cada
-- execução. Mesmas cidades-alvo das demais fontes.
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Sympla Bileto', 'bileto', 'platform', 'edge_api', true,
       jsonb_build_object(
         'janela_dias', 90,
         'id_cursor', 119000,   -- ponto de partida da varredura (ajustável)
         'scan', 800,            -- IDs varridos por execução
         'cidades', jsonb_build_array(
           jsonb_build_object('cidade', 'Florianópolis',   'uf', 'SC'),
           jsonb_build_object('cidade', 'São Paulo',        'uf', 'SP'),
           jsonb_build_object('cidade', 'Rio de Janeiro',   'uf', 'RJ'),
           jsonb_build_object('cidade', 'Belo Horizonte',   'uf', 'MG'),
           jsonb_build_object('cidade', 'Curitiba',         'uf', 'PR'),
           jsonb_build_object('cidade', 'Porto Alegre',     'uf', 'RS'),
           jsonb_build_object('cidade', 'Brasília',         'uf', 'DF'),
           jsonb_build_object('cidade', 'Salvador',         'uf', 'BA'),
           jsonb_build_object('cidade', 'Recife',           'uf', 'PE'),
           jsonb_build_object('cidade', 'Fortaleza',        'uf', 'CE')
         )
       )
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
