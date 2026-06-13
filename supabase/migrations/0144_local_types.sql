-- ============================================================================
-- Tipos de local gerenciáveis (FK normalizada). Substitui o array fixo no
-- código + o CHECK estático em crm_locals.tipo.
--   - local_types: lista por organização (soft-delete, ordenável).
--   - crm_locals.tipo_id: FK -> local_types. Migra os textos existentes.
--   - remove a coluna texto crm_locals.tipo (e o CHECK inline junto).
-- ============================================================================

create table if not exists local_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  nome text not null,
  ordem int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  unique (org_id, nome)
);
create index if not exists local_types_org_idx on local_types (org_id);

alter table local_types enable row level security;
drop policy if exists local_types_all on local_types;
create policy local_types_all on local_types for all to authenticated using (true) with check (true);

-- Seed dos tipos atuais por organização.
insert into local_types (org_id, nome, ordem)
select o.id, t.nome, t.ord
from orgs o
cross join (values
  ('Casa de show', 1), ('Teatro', 2), ('Estádio', 3), ('Arena', 4),
  ('Autódromo', 5), ('Espaço multiuso', 6), ('Outro', 7)
) as t(nome, ord)
on conflict (org_id, nome) do nothing;

-- FK em crm_locals + migração dos textos existentes.
alter table crm_locals add column if not exists tipo_id uuid references local_types(id) on delete set null;

update crm_locals l
  set tipo_id = lt.id
from local_types lt
where lt.org_id = l.org_id and lt.nome = l.tipo and l.tipo is not null;

-- Remove a coluna texto (o CHECK inline cai junto).
alter table crm_locals drop column if exists tipo;
