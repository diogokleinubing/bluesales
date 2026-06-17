-- Filtro "Com Artista": locais/organizadores que têm ao menos um evento com
-- artista mapeado (crawled_event_artists com removido=false).
-- Drop necessário pois a assinatura ganha um parâmetro (evita ambiguidade).
drop function if exists crawled_organizers(text, numeric, text, text, text);
drop function if exists crawled_locals(text, numeric, text, text, text);

create or replace function crawled_organizers(
  p_search text default null,
  p_valor_min numeric default null,
  p_fonte text default null,
  p_cidade text default null,
  p_uf text default null,
  p_com_artista boolean default null
)
returns table (
  chave text, nome text, eventos bigint,
  preco_min numeric, preco_max numeric, taxa_media numeric,
  cidades text[], fontes text[], cidade_nome text, uf text, proximo timestamptz
)
language sql stable
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
    and (p_cidade is null or e.cidade = p_cidade)
    and (p_uf is null or e.uf = p_uf)
  group by lower(trim(e.organizador_raw))
  having (p_valor_min is null or min(coalesce(e.preco_min, e.preco_max)) >= p_valor_min)
    and (coalesce(p_com_artista, false) = false or bool_or(
      exists (select 1 from crawled_event_artists ca
              where ca.crawled_event_id = e.id and ca.removido = false)))
  order by count(*) desc;
$$;

create or replace function crawled_locals(
  p_search text default null,
  p_valor_min numeric default null,
  p_fonte text default null,
  p_cidade text default null,
  p_uf text default null,
  p_com_artista boolean default null
)
returns table (
  chave text, nome text, cidade text, cidade_nome text, uf text,
  eventos bigint, preco_min numeric, preco_max numeric, taxa_media numeric,
  fontes text[], proximo timestamptz
)
language sql stable
as $$
  with base as (
    select
      e.*,
      cs.nome as fonte,
      exists (select 1 from crawled_event_artists ca
              where ca.crawled_event_id = e.id and ca.removido = false) as tem_artista,
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
      and (p_fonte is null or cs.slug = p_fonte)
      and (p_cidade is null or e.cidade = p_cidade)
      and (p_uf is null or e.uf = p_uf)
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
  having (p_valor_min is null or min(coalesce(preco_min, preco_max)) >= p_valor_min)
    and (coalesce(p_com_artista, false) = false or bool_or(tem_artista))
  order by count(*) desc;
$$;
