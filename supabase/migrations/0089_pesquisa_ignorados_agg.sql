-- ============================================================================
-- Pesquisa — ignorar (descartar) organizadores e locais nas listagens de
-- mercado. São agregados (por chave), então a marcação vai numa tabela.
-- ============================================================================
create table if not exists crawled_ignored (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  tipo text not null check (tipo in ('organizador', 'local')),
  chave text not null,
  criado_em timestamptz not null default now(),
  unique (org_id, tipo, chave)
);
create index if not exists crawled_ignored_idx on crawled_ignored (org_id, tipo);

alter table crawled_ignored enable row level security;
drop policy if exists crawled_ignored_all on crawled_ignored;
create policy crawled_ignored_all on crawled_ignored
  for all to authenticated using (true) with check (true);
