-- ============================================================================
-- Performance da detecção de artistas (base com 20k+ eventos).
--   - crawled_events.nome_norm: título normalizado (mantido por trigger).
--   - índice GIN trigram em nome_norm -> busca de candidatos por substring rápida.
--   - detect_event_artists() reescrito: filtra candidatos por trigram (LIKE) e só
--     então aplica o regex de palavra inteira. statement_timeout elevado.
-- ============================================================================

create extension if not exists pg_trgm;

-- pesquisa_norm depende de unaccent (STABLE) -> declara STABLE.
create or replace function pesquisa_norm(t text)
returns text
language sql stable
set search_path = public, extensions
as $$
  select btrim(regexp_replace(
    replace(unaccent(lower(coalesce(t, ''))), '&', ' e '),
    '[-_/[:space:]]+', ' ', 'g'
  ));
$$;

alter table crawled_events add column if not exists nome_norm text;

create or replace function crawled_events_set_norm()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.nome_norm := pesquisa_norm(new.nome);
  return new;
end;
$$;

drop trigger if exists crawled_events_norm_trg on crawled_events;
create trigger crawled_events_norm_trg
  before insert or update of nome on crawled_events
  for each row execute function crawled_events_set_norm();

-- Backfill dos já existentes (roda na migração, sem o timeout do PostgREST).
update crawled_events set nome_norm = pesquisa_norm(nome)
where nome_norm is null and nome is not null;

create index if not exists crawled_events_nome_norm_trgm
  on crawled_events using gin (nome_norm gin_trgm_ops);

create or replace function detect_event_artists(p_artist_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '120s'
as $$
declare
  afetados integer;
begin
  insert into crawled_event_artists (org_id, crawled_event_id, artist_id, origem)
  select e.org_id, e.id, a.id, 'auto'
  from (
    select a.id, a.org_id, pesquisa_norm(a.nome) as t,
      regexp_replace(pesquisa_norm(a.nome), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') as re
    from artists a
    where a.deleted_at is null and a.nome is not null
      and length(pesquisa_norm(a.nome)) >= 3
      and (p_artist_id is null or a.id = p_artist_id)
  ) a
  join crawled_events e
    on e.org_id = a.org_id
   and coalesce(e.ignorado, false) = false
   and e.nome_norm is not null
   and e.nome_norm like ('%' || replace(replace(replace(a.t, '\', '\\'), '%', '\%'), '_', '\_') || '%')
   and e.nome_norm ~ ('[[:<:]]' || a.re || '[[:>:]]')
   and lower(e.nome) !~ '(tributo|tribute|cover)'
  on conflict (crawled_event_id, artist_id) do nothing;

  get diagnostics afetados = row_count;
  return afetados;
end;
$$;

grant execute on function detect_event_artists(uuid) to authenticated;
