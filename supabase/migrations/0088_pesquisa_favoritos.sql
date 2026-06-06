-- ============================================================================
-- Pesquisa — marcar (favoritar) eventos, organizadores e locais.
-- Eventos são linhas -> coluna favorito. Organizadores/locais são agregados
-- (por chave) -> tabela de favoritos.
-- ============================================================================
alter table crawled_events add column if not exists favorito boolean not null default false;
create index if not exists crawled_events_favorito_idx on crawled_events (org_id) where favorito;

create table if not exists crawled_favorites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  tipo text not null check (tipo in ('organizador', 'local')),
  chave text not null,
  criado_em timestamptz not null default now(),
  unique (org_id, tipo, chave)
);
create index if not exists crawled_favorites_idx on crawled_favorites (org_id, tipo);

alter table crawled_favorites enable row level security;
drop policy if exists crawled_favorites_all on crawled_favorites;
create policy crawled_favorites_all on crawled_favorites
  for all to authenticated using (true) with check (true);
