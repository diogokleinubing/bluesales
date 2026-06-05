-- Organizações ganham observações (a promoção da Pesquisa grava faixa de
-- ingressos + taxa aqui) e a origem do lead passa a aceitar 'Pesquisa'.
alter table organizations add column if not exists observacoes text;
alter table organizations drop constraint if exists organizations_origem_lead_check;
alter table organizations add constraint organizations_origem_lead_check
  check (origem_lead in ('Indicação', 'Prospecção ativa', 'Inbound', 'Evento', 'Pesquisa', 'Outro'));

-- Pesquisa: promoção de Organizadores e Locais para o CRM (rastreio p/ evitar
-- duplicado e exibir estado "promovido").
create table if not exists crawled_promotions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  tipo text not null check (tipo in ('organizador', 'local')),
  chave text not null,                 -- chave normalizada do agregado
  rotulo text,                         -- rótulo exibível
  organization_id uuid references organizations(id) on delete set null,
  local_id uuid references crm_locals(id) on delete set null,
  promovido_em timestamptz not null default now(),
  promovido_por uuid references profiles(id) on delete set null,
  unique (org_id, tipo, chave)
);
create index if not exists crawled_promotions_org_idx on crawled_promotions (org_id, tipo);

alter table crawled_promotions enable row level security;
drop policy if exists crawled_promotions_all on crawled_promotions;
create policy crawled_promotions_all on crawled_promotions
  for all to authenticated using (true) with check (true);

-- CRM: vínculo entre locais e organizações (N:N).
create table if not exists organization_locals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  organization_id uuid not null references organizations(id) on delete cascade,
  local_id uuid not null references crm_locals(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (organization_id, local_id)
);
create index if not exists organization_locals_org_idx on organization_locals (organization_id);
create index if not exists organization_locals_local_idx on organization_locals (local_id);

alter table organization_locals enable row level security;
drop policy if exists organization_locals_all on organization_locals;
create policy organization_locals_all on organization_locals
  for all to authenticated using (true) with check (true);
