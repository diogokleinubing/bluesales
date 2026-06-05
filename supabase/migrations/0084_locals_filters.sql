-- ============================================================================
-- Locais (Pesquisa): filtro e ordenação no servidor.
--   p_search    -> nome do local (ILIKE)
--   p_valor_min -> só locais cujo preço máx >= valor
-- Ordena por nº de eventos desc. Substitui a versão sem parâmetros.
-- ============================================================================
drop function if exists crawled_locals();

create or replace function crawled_locals(
  p_search text default null,
  p_valor_min numeric default null
)
returns table (
  chave text,
  nome text,
  cidade text,
  cidade_nome text,
  uf text,
  eventos bigint,
  preco_min numeric,
  preco_max numeric,
  taxa_media numeric,
  fontes text[],
  proximo timestamptz
)
language sql
stable
as $$
  with base as (
    select
      e.*,
      cs.nome as fonte,
      case
        when e.cidade is null or e.cidade = '' then null
        else e.cidade || case when e.uf is not null and e.uf <> '' then '/' || e.uf else '' end
      end as cidade_uf
    from crawled_events e
    left join crawler_sources cs on cs.id = e.source_id
    where coalesce(e.ignorado, false) = false
      and e.local_raw is not null
      and trim(e.local_raw) <> ''
      and (p_search is null or e.local_raw ilike '%' || p_search || '%')
  )
  select
    lower(trim(local_raw)) || '|' || coalesce(cidade_uf, '') as chave,
    min(local_raw) as nome,
    min(cidade_uf) as cidade,
    min(cidade) as cidade_nome,
    min(uf) as uf,
    count(*)::bigint as eventos,
    min(coalesce(preco_min, preco_max)) as preco_min,
    max(coalesce(preco_max, preco_min)) as preco_max,
    avg(taxa_pct) as taxa_media,
    coalesce(array_agg(distinct fonte) filter (where fonte is not null), '{}') as fontes,
    min(data_inicio) filter (where data_inicio >= now()) as proximo
  from base
  group by lower(trim(local_raw)) || '|' || coalesce(cidade_uf, '')
  having (p_valor_min is null or max(coalesce(preco_max, preco_min)) >= p_valor_min)
  order by count(*) desc;
$$;

grant execute on function crawled_locals(text, numeric) to authenticated;
