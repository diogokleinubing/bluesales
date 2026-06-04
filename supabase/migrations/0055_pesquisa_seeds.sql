-- ============================================================================
-- Módulo Pesquisa — Fase 2: seeds (fontes + regras de ignorar)
-- Single tenant: usa a primeira org (Blueticket).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Fontes (1 linha por plataforma). config = { cidades, janela_dias }.
-- ---------------------------------------------------------------------------
insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, v.nome, v.slug, 'platform', v.metodo, true,
       jsonb_build_object(
         'janela_dias', 90,
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
cross join (values
  ('Sympla',             'sympla',            'edge_api'),
  ('Ingresse',           'ingresse',          'edge_api'),
  ('Guichê Web',         'guicheweb',         'edge_html'),
  ('Bilheteria Digital', 'bilheteriadigital', 'edge_html')
) as v(nome, slug, metodo)
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Regras de ignorar (palavras-chave). Online/gratuito já são filtrados no
-- scraper antes de inserir; aqui ficam descartes por tema/ruído.
-- ---------------------------------------------------------------------------
insert into crawler_ignore_rules (org_id, tipo, keyword)
select o.id, 'nome_evento', kw
from orgs o
cross join unnest(array[
  'curso', 'workshop', 'palestra', 'webinar', 'mentoria', 'imersão',
  'congresso', 'culto', 'missa', 'retiro', 'oração',
  'test', 'teste', 'simulado', 'vestibular', 'concurso',
  'corrida', 'maratona', 'caminhada',
  'bingo', 'rifa', 'sorteio',
  'meetup', 'hackathon', 'bootcamp'
]) as kw
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, tipo, keyword) do nothing;

insert into crawler_ignore_rules (org_id, tipo, keyword)
select o.id, 'local', kw
from orgs o
cross join unnest(array[
  'online', 'live', 'ao vivo', 'transmissão', 'youtube', 'zoom',
  'google meet', 'microsoft teams', 'instagram', 'twitch', 'a definir'
]) as kw
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, tipo, keyword) do nothing;
