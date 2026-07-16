-- crawled_locals estava dando timeout (500 após ~8s) no carregamento sem filtros.
-- Causa: a função reagrupava recalculando a "chave" do local a cada linha, em vez
-- de usar a coluna já materializada crawled_events.local_chave (migration 0105) e
-- seu índice. Correção: agrupar por local_chave (indexada) e filtrar por
-- local_chave IS NOT NULL (equivale a local_raw não vazio). Também eleva o
-- statement_timeout da própria função como rede de segurança, para completar em
-- vez de retornar 500 caso o volume cresça.

create or replace function crawled_locals(
  p_search text default null,
  p_valor_min numeric default null,
  p_fonte text default null,
  p_cidade text default null,
  p_uf text default null,
  p_classes text[] default null
)
returns table (
  chave text, nome text, cidade text, cidade_nome text, uf text,
  eventos bigint, artistas bigint, preco_min numeric, preco_max numeric,
  taxa_media numeric, fontes text[], proximo timestamptz
)
language sql stable
set statement_timeout = '20s'
as $$
  with ev as (
    select e.id, e.local_raw, e.cidade, e.uf, e.preco_min, e.preco_max,
           e.taxa_pct, e.data_inicio, cs.nome as fonte,
           e.local_chave as chave,
           case when e.cidade is null or e.cidade = '' then null
                else e.cidade || case when e.uf is not null and e.uf <> '' then '/' || e.uf else '' end end as cidade_uf
    from crawled_events e
    left join crawler_sources cs on cs.id = e.source_id
    where coalesce(e.ignorado, false) = false
      and e.local_chave is not null
      and (p_search is null or e.local_raw ilike '%' || p_search || '%')
      and (p_fonte is null or cs.slug = p_fonte)
      and (p_cidade is null or e.cidade = p_cidade)
      and (p_uf is null or e.uf = p_uf)
  ),
  art as (
    select ev.chave, count(distinct ca.artist_id) as n
    from ev
    join crawled_event_artists ca on ca.crawled_event_id = ev.id and ca.removido = false
    join artists ar on ar.id = ca.artist_id and ar.deleted_at is null
    where (p_classes is null or array_length(p_classes, 1) is null or ar.classificacao = any(p_classes))
    group by ev.chave
  ),
  agg as (
    select
      ev.chave,
      min(ev.local_raw) as nome,
      min(ev.cidade_uf) as cidade,
      min(ev.cidade) as cidade_nome,
      min(ev.uf) as uf,
      count(*)::bigint as eventos,
      min(coalesce(ev.preco_min, ev.preco_max)) as preco_min,
      max(coalesce(ev.preco_max, ev.preco_min)) as preco_max,
      avg(ev.taxa_pct) as taxa_media,
      coalesce(array_agg(distinct ev.fonte) filter (where ev.fonte is not null), '{}') as fontes,
      min(ev.data_inicio) filter (where ev.data_inicio >= now()) as proximo
    from ev
    group by ev.chave
    having (p_valor_min is null or min(coalesce(ev.preco_min, ev.preco_max)) >= p_valor_min)
  )
  select agg.chave, agg.nome, agg.cidade, agg.cidade_nome, agg.uf,
    agg.eventos, coalesce(art.n, 0)::bigint as artistas,
    agg.preco_min, agg.preco_max, agg.taxa_media, agg.fontes, agg.proximo
  from agg
  left join art on art.chave = agg.chave
  where (p_classes is null or array_length(p_classes, 1) is null or coalesce(art.n, 0) > 0)
  order by agg.eventos desc;
$$;

grant execute on function crawled_locals(text, numeric, text, text, text, text[]) to authenticated;
