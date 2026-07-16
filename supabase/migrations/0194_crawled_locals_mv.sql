-- Fix definitivo do timeout de crawled_locals: a agregação sobre toda a
-- crawled_events (com junção de artistas) passa de 20s e estourava o
-- statement_timeout mesmo elevado. Solução: materializar a agregação por local
-- numa materialized view e servir dela no caminho padrão (sem filtro de fonte),
-- caindo para a query ao vivo só quando há fonte específica (escopo bem menor).

-- A criação roda a agregação pesada uma vez; garante tempo suficiente na sessão
-- da migração (não afeta o timeout da API).
set statement_timeout = '600s';

-- ---------------------------------------------------------------------------
-- Materialized view: uma linha por local (local_chave), com tudo já agregado,
-- incluindo a contagem de artistas por classificação (jsonb) para reproduzir o
-- filtro de classes sem precisar juntar artistas em tempo de request.
-- ---------------------------------------------------------------------------
drop materialized view if exists pesquisa_locais_agg;
create materialized view pesquisa_locais_agg as
with ev as (
  select e.id, e.local_raw, e.cidade, e.uf, e.preco_min, e.preco_max,
         e.taxa_pct, e.data_inicio, cs.nome as fonte, e.local_chave as chave,
         case when e.cidade is null or e.cidade = '' then null
              else e.cidade || case when e.uf is not null and e.uf <> '' then '/' || e.uf else '' end end as cidade_uf
  from crawled_events e
  left join crawler_sources cs on cs.id = e.source_id
  where coalesce(e.ignorado, false) = false
    and e.local_chave is not null
),
base as (
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
),
arts as (
  select ev.chave, coalesce(ar.classificacao, '—') as classe, count(distinct ca.artist_id) as n
  from ev
  join crawled_event_artists ca on ca.crawled_event_id = ev.id and ca.removido = false
  join artists ar on ar.id = ca.artist_id and ar.deleted_at is null
  group by ev.chave, coalesce(ar.classificacao, '—')
),
arts_agg as (
  select chave, sum(n)::bigint as artistas_total, jsonb_object_agg(classe, n) as art_por_classe
  from arts
  group by chave
)
select b.chave, b.nome, b.cidade, b.cidade_nome, b.uf, b.eventos,
       b.preco_min, b.preco_max, b.taxa_media, b.fontes, b.proximo,
       coalesce(a.artistas_total, 0)::bigint as artistas_total,
       coalesce(a.art_por_classe, '{}'::jsonb) as art_por_classe
from base b
left join arts_agg a on a.chave = b.chave;

create unique index if not exists pesquisa_locais_agg_chave_idx on pesquisa_locais_agg (chave);
grant select on pesquisa_locais_agg to authenticated;

-- ---------------------------------------------------------------------------
-- Função de refresh (SECURITY DEFINER p/ authenticated poder acionar).
-- ---------------------------------------------------------------------------
create or replace function refresh_pesquisa_locais_agg()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  refresh materialized view concurrently pesquisa_locais_agg;
end;
$fn$;
grant execute on function refresh_pesquisa_locais_agg() to authenticated;

-- ---------------------------------------------------------------------------
-- crawled_locals: serve da MV no caminho padrão (sem fonte); query ao vivo só
-- quando há fonte específica. Mesma assinatura e mesmas colunas de retorno.
-- ---------------------------------------------------------------------------
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
language plpgsql
stable
as $fn$
begin
  if p_fonte is null then
    -- Caminho rápido: MV pré-agregada.
    return query
      select
        m.chave, m.nome, m.cidade, m.cidade_nome, m.uf, m.eventos,
        (case
           when p_classes is null or array_length(p_classes, 1) is null then m.artistas_total
           else coalesce((select sum((m.art_por_classe ->> c)::bigint) from unnest(p_classes) as c), 0)
         end)::bigint as artistas,
        m.preco_min, m.preco_max, m.taxa_media, m.fontes, m.proximo
      from pesquisa_locais_agg m
      where (p_search is null or m.nome ilike '%' || p_search || '%')
        and (p_cidade is null or m.cidade_nome = p_cidade)
        and (p_uf is null or m.uf = p_uf)
        and (p_valor_min is null or m.preco_min >= p_valor_min)
        and (p_classes is null or array_length(p_classes, 1) is null
             or coalesce((select sum((m.art_por_classe ->> c)::bigint) from unnest(p_classes) as c), 0) > 0)
      order by m.eventos desc;
  else
    -- Caminho ao vivo: filtrado por fonte (escopo pequeno).
    return query
      with ev as (
        select e.id, e.local_raw, e.cidade, e.uf, e.preco_min, e.preco_max,
               e.taxa_pct, e.data_inicio, cs.nome as fonte, e.local_chave as chave,
               case when e.cidade is null or e.cidade = '' then null
                    else e.cidade || case when e.uf is not null and e.uf <> '' then '/' || e.uf else '' end end as cidade_uf
        from crawled_events e
        left join crawler_sources cs on cs.id = e.source_id
        where coalesce(e.ignorado, false) = false
          and e.local_chave is not null
          and cs.slug = p_fonte
          and (p_search is null or e.local_raw ilike '%' || p_search || '%')
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
  end if;
end;
$fn$;

-- Remove o cap de statement_timeout que a 0191 pôs na função (não é mais preciso).
alter function crawled_locals(text, numeric, text, text, text, text[]) reset statement_timeout;
grant execute on function crawled_locals(text, numeric, text, text, text, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Refresh automático a cada 15 min via pg_cron (se disponível). Resiliente: se a
-- extensão não puder ser criada, a migração segue e o refresh fica manual
-- (refresh_pesquisa_locais_agg()) ou pode ser acionado ao fim do crawler.
-- ---------------------------------------------------------------------------
do $do$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'refresh-pesquisa-locais-agg',
    '*/15 * * * *',
    $cmd$refresh materialized view concurrently pesquisa_locais_agg$cmd$
  );
exception when others then
  raise notice 'pg_cron indisponivel (%). Agende refresh_pesquisa_locais_agg() manualmente ou pelo crawler.', sqlerrm;
end
$do$;
