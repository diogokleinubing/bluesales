-- ============================================================================
-- Módulo Pesquisa — agregação de Organizadores e Locais sobre TODA a base
-- (corrige o limite de 2000 do agregado no cliente, que escondia organizadores
-- de eventos mais antigos).
-- ============================================================================

create or replace function crawled_organizers()
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
  group by lower(trim(e.organizador_raw));
$$;

grant execute on function crawled_organizers() to authenticated;

create or replace function crawled_locals()
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
  group by lower(trim(local_raw)) || '|' || coalesce(cidade_uf, '');
$$;

grant execute on function crawled_locals() to authenticated;
