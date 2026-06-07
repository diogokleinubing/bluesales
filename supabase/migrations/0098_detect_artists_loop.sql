-- ============================================================================
-- detect_event_artists: itera por artista para garantir uso do índice trigram.
-- Com o LIKE recebendo o padrão como variável (parâmetro), o planner usa o GIN
-- (gin_trgm_ops) em cada artista — poucos candidatos -> regex de borda só neles.
-- Evita o cruzamento eventos×artistas que estourava o statement_timeout.
-- ============================================================================

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
  for a in
    select id, org_id,
      pesquisa_norm(nome) as t,
      regexp_replace(pesquisa_norm(nome), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') as re
    from artists
    where deleted_at is null and nome is not null
      and length(pesquisa_norm(nome)) >= 3
      and (p_artist_id is null or id = p_artist_id)
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
    on conflict (crawled_event_id, artist_id) do nothing;

    get diagnostics n = row_count;
    afetados := afetados + n;
  end loop;

  return afetados;
end;
$$;

grant execute on function detect_event_artists(uuid) to authenticated;
