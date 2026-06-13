-- ============================================================================
-- Módulo Pesquisa — fonte Mega Bilheteria (megabilheteria.com).
-- A listagem JSON (/evento/lista-todos-index) traz todos os eventos de uma vez;
-- sem `cidades` no config. Captura tipos 'e' (evento) e 't' (temporada);
-- ignora 'g' (programação multi-cidade sem cidade/data). Preço/taxa vêm da
-- página de compra /evento?id= (para 't', a 1ª sessão da temporada).
-- `detalhes_por_run` = teto de eventos detalhados por execução; os já
-- coletados viram "known" e o backlog é varrido run após run.
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Mega Bilheteria', 'megabilheteria', 'platform', 'edge_html', true,
       jsonb_build_object('detalhes_por_run', 50)
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
