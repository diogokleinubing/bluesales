-- ============================================================================
-- Organizadores (Pesquisa): filtro e ordenação no servidor.
--   p_search    -> nome do organizador (ILIKE)
--   p_valor_min -> só organizadores cujo preço máx >= valor
--   p_fonte     -> slug da fonte/plataforma (null = todas)
-- Ordena por nº de eventos desc. Substitui a versão sem parâmetros.
-- ============================================================================
drop function if exists crawled_organizers();

create or replace function crawled_organizers(
  p_search text default null,
  p_valor_min numeric default null,
  p_fonte text default null
)
returns table (
  chave text,
  nome text,
  eventos bigint,
  preco_min numeric,
  preco_max numeric,
  taxa_media numeric,
  cidades text[],
  fontes text[],
  cidade_nome text,
  uf text,
  proximo timestamptz
)
language sql
stable
as $$
  select
    lower(trim(e.organizador_raw)) as chave,
    min(e.organizador_raw) as nome,
    count(*)::bigint as eventos,
    min(coalesce(e.preco_min, e.preco_max)) as preco_min,
    max(coalesce(e.preco_max, e.preco_min)) as preco_max,
    avg(e.taxa_pct) as taxa_media,
    coalesce(
      array_agg(distinct (
        e.cidade || case when e.uf is not null and e.uf <> '' then '/' || e.uf else '' end
      )) filter (where e.cidade is not null and e.cidade <> ''),
      '{}'
    ) as cidades,
    coalesce(array_agg(distinct cs.nome) filter (where cs.nome is not null), '{}') as fontes,
    min(e.cidade) as cidade_nome,
    min(e.uf) as uf,
    min(e.data_inicio) filter (where e.data_inicio >= now()) as proximo
  from crawled_events e
  left join crawler_sources cs on cs.id = e.source_id
  where coalesce(e.ignorado, false) = false
    and e.organizador_raw is not null
    and trim(e.organizador_raw) <> ''
    and (p_search is null or e.organizador_raw ilike '%' || p_search || '%')
    and (p_fonte is null or cs.slug = p_fonte)
  group by lower(trim(e.organizador_raw))
  having (p_valor_min is null or max(coalesce(e.preco_max, e.preco_min)) >= p_valor_min)
  order by count(*) desc;
$$;

grant execute on function crawled_organizers(text, numeric, text) to authenticated;
