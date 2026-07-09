-- ============================================================================
-- CRM — vínculo genérico de contatos (pessoas) a entidades
-- Substitui org_persons por uma tabela polimórfica que também cobre
-- locais e eventos. Criar/buscar um contato dentro de uma organização,
-- local ou evento passa a vincular automaticamente à entidade atual.
-- ============================================================================

create table if not exists person_entities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  person_id uuid not null references persons(id) on delete cascade,
  entity_type text not null check (entity_type in ('organization','local','evento')),
  entity_id uuid not null,
  papel text,
  ativo boolean not null default true,
  data_inicio date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists person_entities_entity_idx on person_entities (entity_type, entity_id);
create index if not exists person_entities_person_idx on person_entities (person_id);

-- Evita vincular a mesma pessoa duas vezes à mesma entidade (enquanto ativo).
create unique index if not exists person_entities_uniq_active
  on person_entities (entity_type, entity_id, person_id)
  where ativo;

-- ----------------------------------------------------------------------------
-- Segurança: mesma barreira das demais tabelas de negócio (somente membros).
alter table person_entities enable row level security;

drop policy if exists person_entities_member on person_entities;
create policy person_entities_member on person_entities
  for all
  using (is_member())
  with check (is_member());

grant select, insert, update, delete on person_entities to authenticated;

-- ----------------------------------------------------------------------------
-- Backfill: traz os contatos já vinculados a organizações (org_persons).
insert into person_entities (org_id, person_id, entity_type, entity_id, papel, ativo, data_inicio)
select org_id, person_id, 'organization', organization_id, papel, coalesce(ativo, true), data_inicio
from org_persons
where coalesce(ativo, true) = true
on conflict do nothing;
