-- ============================================================================
-- Seed inicial de regras de GÊNERO (keyword no nome do evento)
-- ----------------------------------------------------------------------------
-- Baseado nos 100 maiores eventos por GMV. Apenas gênero (segmento = null).
-- Matching é por palavra (motor), então termos curtos como 'suel' não pegam
-- 'consuelo'. Line-ups com gêneros distintos viram "Diversos" (no motor).
-- Idempotente: não duplica regras já existentes.
-- ============================================================================

-- Gênero "Diversos" (line-ups de estilos diferentes).
insert into generos (org_id, nome)
select o.id, 'Diversos' from orgs o
on conflict (org_id, nome) do nothing;

insert into keyword_rules (org_id, keyword, segmento, genero, ordem)
select o.id, v.keyword, null, v.genero, v.ordem
from orgs o
cross join (values
  -- Sertanejo
  ('gusttavo lima','Sertanejo',10),
  ('luan santana','Sertanejo',10),
  ('ana castela','Sertanejo',10),
  ('gustavo mioto','Sertanejo',10),
  ('simone mendes','Sertanejo',10),
  ('ze neto & cristiano','Sertanejo',10),
  ('maiara & maraisa','Sertanejo',10),
  ('israel & rodolffo','Sertanejo',10),
  ('lauana prado','Sertanejo',10),
  ('matheus e kauan','Sertanejo',10),
  ('matheus & kauan','Sertanejo',10),
  ('hugo e guilherme','Sertanejo',10),
  ('hugo & guilherme','Sertanejo',10),
  ('chitaozinho e xororo','Sertanejo',10),
  -- Pagode
  ('menos e mais','Pagode',10),
  ('alexandre pires','Pagode',10),
  ('pagonejo','Pagode',10),
  ('suel','Pagode',10),
  ('pagode','Pagode',20),
  -- Rock
  ('capital inicial','Rock',10),
  ('raimundos','Rock',10),
  ('charlie brown','Rock',10),
  ('dire straits','Rock',10),
  ('creedence','Rock',10),
  ('rock','Rock',20),
  -- Eletrônico
  ('warung','Eletrônico',10),
  ('alok','Eletrônico',10),
  ('illusionize','Eletrônico',10),
  ('house mag','Eletrônico',10),
  ('hernan cattaneo','Eletrônico',10),
  -- Hip-Hop
  ('matue','Hip-Hop',10),
  ('veigh','Hip-Hop',10),
  ('trapbeatz','Hip-Hop',10),
  -- Reggae
  ('armandinho','Reggae',10),
  ('reggae','Reggae',20),
  -- MPB
  ('ney matogrosso','MPB',10),
  ('alceu','MPB',10),
  -- Samba
  ('samba','Samba',20)
) as v(keyword, genero, ordem)
where not exists (
  select 1 from keyword_rules kr
  where kr.org_id = o.id
    and kr.keyword = v.keyword
    and kr.genero is not distinct from v.genero
);
