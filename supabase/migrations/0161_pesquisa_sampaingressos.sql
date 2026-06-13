-- ============================================================================
-- Módulo Pesquisa — fonte Sampa Ingressos (sampaingressos.com.br).
-- Teatro/stand-up/shows em São Paulo capital. A listagem (POST
-- /espetaculos/<categoria>&<pagina>?idPartner=) retorna JSON triplo-encodado e
-- já é autossuficiente (preço, gênero, local, temporada, lotação, sinopse...),
-- então não há fetch por evento. `categorias` e `max_paginas` são opcionais no
-- config (default: adulto, standUp, infantil, shows; 20 páginas/categoria).
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Sampa Ingressos', 'sampaingressos', 'platform', 'edge_html', true,
       jsonb_build_object('categorias', jsonb_build_array('adulto', 'standUp', 'infantil', 'shows'),
                          'max_paginas', 20)
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
