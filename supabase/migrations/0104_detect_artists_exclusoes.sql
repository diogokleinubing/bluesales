-- ============================================================================
-- Amplia as exclusões da detecção de artistas. Além de tributo/tribute/cover,
-- ignora eventos cujo nome contenha as PALAVRAS inteiras: especial, homenagem,
-- canta (ex.: "Fulano canta Beltrano", "Especial...", "Homenagem a ...").
-- Casamento por palavra inteira (boundaries) sobre nome_norm — assim "canta"
-- não pega "encantada", "Cantagalo", "cantareira" etc.
-- Também remove vínculos automáticos já criados que agora caem na exclusão.
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
      and e.nome_norm !~ '[[:<:]](especial|homenagem|canta)[[:>:]]'
    on conflict (crawled_event_id, artist_id) do nothing;

    get diagnostics n = row_count;
    afetados := afetados + n;
  end loop;

  return afetados;
end;
$$;

grant execute on function detect_event_artists(uuid) to authenticated;

-- Limpa vínculos automáticos já existentes que passam a ser excluídos.
delete from crawled_event_artists ca
using crawled_events e
where ca.crawled_event_id = e.id
  and ca.origem = 'auto'
  and (
    lower(e.nome) ~ '(tributo|tribute|cover)'
    or pesquisa_norm(e.nome) ~ '[[:<:]](especial|homenagem|canta)[[:>:]]'
  );
