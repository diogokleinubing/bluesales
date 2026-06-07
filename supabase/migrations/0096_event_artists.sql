-- ============================================================================
-- Vínculo evento capturado <> artista (Pesquisa).
--   - crawled_event_artists: liga um crawled_event a um artist do Comercial.
--   - detect_event_artists(): detecta artistas no TÍTULO do evento (pode ter
--     mais de um), por palavra inteira, sem acento, tratando "&" == " e ".
--     Respeita vínculos removidos manualmente (removido=true não é recriado).
-- ============================================================================

create extension if not exists unaccent;

create table if not exists crawled_event_artists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  crawled_event_id uuid not null references crawled_events(id) on delete cascade,
  artist_id uuid not null references artists(id) on delete cascade,
  origem text not null default 'auto',          -- 'auto' (detecção) | 'manual'
  removido boolean not null default false,       -- removido manualmente (não redetectar)
  created_at timestamptz not null default now(),
  unique (crawled_event_id, artist_id)
);

create index if not exists crawled_event_artists_artist_idx on crawled_event_artists (artist_id);
create index if not exists crawled_event_artists_event_idx on crawled_event_artists (crawled_event_id);

alter table crawled_event_artists enable row level security;
drop policy if exists crawled_event_artists_all on crawled_event_artists;
create policy crawled_event_artists_all on crawled_event_artists
  for all to authenticated using (true) with check (true);

-- Normaliza texto: minúsculo, sem acento, "&" -> " e ", separadores -> espaço.
create or replace function pesquisa_norm(t text)
returns text
language sql immutable
set search_path = public, extensions
as $$
  select btrim(regexp_replace(
    replace(unaccent(lower(coalesce(t, ''))), '&', ' e '),
    '[-_/[:space:]]+', ' ', 'g'
  ));
$$;

create or replace function detect_event_artists(p_artist_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  afetados integer;
begin
  with ev as (
    select e.id, e.org_id, pesquisa_norm(e.nome) as t
    from crawled_events e
    where coalesce(e.ignorado, false) = false
      and e.nome is not null
      and lower(e.nome) !~ '(tributo|tribute|cover)'
  ),
  art as (
    select a.id, a.org_id, pesquisa_norm(a.nome) as t,
      regexp_replace(pesquisa_norm(a.nome), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') as re
    from artists a
    where a.deleted_at is null
      and a.nome is not null
      and length(pesquisa_norm(a.nome)) >= 3
      and (p_artist_id is null or a.id = p_artist_id)
  ),
  pares as (
    select ev.org_id, ev.id as crawled_event_id, art.id as artist_id
    from ev
    join art on art.org_id = ev.org_id
    where position(art.t in ev.t) > 0
      and ev.t ~ ('[[:<:]]' || art.re || '[[:>:]]')
  )
  insert into crawled_event_artists (org_id, crawled_event_id, artist_id, origem)
  select org_id, crawled_event_id, artist_id, 'auto' from pares
  on conflict (crawled_event_id, artist_id) do nothing;

  get diagnostics afetados = row_count;
  return afetados;
end;
$$;

grant execute on function detect_event_artists(uuid) to authenticated;
