-- ============================================================================
-- Apelidos/variações de nome por artista para a detecção em eventos.
--   artists.aliases: termos alternativos separados por vírgula. Ex.: o artista
--   "Gusttavo Lima" pode ter alias "Gustavo Lima" (grafia comum) para também
--   casar eventos escritos errado.
--   detect_event_artists passa a casar o NOME + cada ALIAS (palavra inteira,
--   sem acento), mantendo as exclusões (tributo/cover/especial/homenagem/canta)
--   e o vínculo sempre apontando para o mesmo artist_id (dedupe por evento).
-- ============================================================================

alter table artists add column if not exists aliases text;

create or replace function detect_event_artists(p_artist_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '180s'
as $$
declare
  a record;
  n integer;
  afetados integer := 0;
begin
  -- Itera por TERMO (nome + cada alias). Vários termos do mesmo artista geram
  -- vínculos para o mesmo artist_id; o on conflict deduplica por evento.
  for a in
    with base as (
      select id, org_id, nome, aliases
      from artists
      where deleted_at is null and nome is not null
        and (p_artist_id is null or id = p_artist_id)
    ),
    termos as (
      select id, org_id, nome as termo from base
      union all
      select b.id, b.org_id, btrim(t) as termo
      from base b, unnest(string_to_array(coalesce(b.aliases, ''), ',')) as t
      where btrim(t) <> ''
    )
    select id, org_id,
      pesquisa_norm(termo) as t,
      regexp_replace(pesquisa_norm(termo), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') as re
    from termos
    where length(pesquisa_norm(termo)) >= 3
  loop
    insert into crawled_event_artists (org_id, crawled_event_id, artist_id, origem)
    select e.org_id, e.id, a.id, 'auto'
    from crawled_events e
    where e.org_id = a.org_id
      and coalesce(e.ignorado, false) = false
      and e.nome_norm is not null
      and e.nome_norm like ('%' || replace(replace(replace(a.t, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      and e.nome_norm ~ ('[[:<:]]' || a.re || '[[:>:]]')
      and lower(e.nome) !~ '(tributo|tribute|cover)'
      and e.nome_norm !~ '[[:<:]](especial|homenagem|canta)[[:>:]]'
    on conflict (crawled_event_id, artist_id) do nothing;

    get diagnostics n = row_count;
    afetados := afetados + n;
  end loop;

  return afetados;
end;
$$;

grant execute on function detect_event_artists(uuid) to authenticated;

-- Backfill: aplica a detecção aos eventos já existentes (server-side).
select detect_event_artists();
