-- ============================================================================
-- Conteúdo vira biblioteca própria (deixa de ser criado dentro da newsletter):
--   - categorias de conteúdo
--   - status (rascunho / pronto / utilizado) no lugar de publicado
--   - vínculo campanha ↔ conteúdo por seção (email_campaign_conteudos)
-- Compatível com a versão em produção: NÃO remove campaign_id/secao/ordem de
-- crm_conteudos (ficam legados até o cleanup pós-migração da UI).
-- ============================================================================

-- Categorias --------------------------------------------------------------
create table if not exists crm_conteudo_categorias (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  nome text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  deleted_at timestamptz
);
create index if not exists crm_conteudo_categorias_org_idx on crm_conteudo_categorias (org_id);
alter table crm_conteudo_categorias enable row level security;
drop policy if exists crm_conteudo_categorias_member on crm_conteudo_categorias;
create policy crm_conteudo_categorias_member on crm_conteudo_categorias for all using (is_member()) with check (is_member());
grant select, insert, update, delete on crm_conteudo_categorias to authenticated;

-- crm_conteudos: biblioteca independente -----------------------------------
alter table crm_conteudos add column if not exists categoria_id uuid references crm_conteudo_categorias(id) on delete set null;
alter table crm_conteudos add column if not exists status text not null default 'rascunho' check (status in ('rascunho', 'pronto', 'utilizado'));
-- artigos avulsos (sem campanha) não precisam de seção.
alter table crm_conteudos alter column secao drop not null;
-- migra o flag antigo: publicado=true -> pronto.
update crm_conteudos set status = 'pronto' where publicado = true and status = 'rascunho';

-- Vínculo campanha ↔ conteúdo (seção + ordem) ------------------------------
create table if not exists email_campaign_conteudos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  conteudo_id uuid not null references crm_conteudos(id) on delete cascade,
  secao text not null check (secao in ('destaque', 'novidade', 'como_usar')),
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  unique (campaign_id, conteudo_id)
);
create index if not exists email_campaign_conteudos_campaign_idx on email_campaign_conteudos (campaign_id);
create index if not exists email_campaign_conteudos_conteudo_idx on email_campaign_conteudos (conteudo_id);
alter table email_campaign_conteudos enable row level security;
drop policy if exists email_campaign_conteudos_member on email_campaign_conteudos;
create policy email_campaign_conteudos_member on email_campaign_conteudos for all using (is_member()) with check (is_member());
grant select, insert, update, delete on email_campaign_conteudos to authenticated;

-- Migra os vínculos que já existem (conteúdo criado dentro de uma news) para a
-- join, preservando seção e ordem.
insert into email_campaign_conteudos (org_id, campaign_id, conteudo_id, secao, ordem)
select org_id, campaign_id, id, coalesce(secao, 'novidade'), coalesce(ordem, 0)
from crm_conteudos
where campaign_id is not null and deleted_at is null
on conflict (campaign_id, conteudo_id) do nothing;
