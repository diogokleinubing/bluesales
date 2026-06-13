-- ============================================================================
-- Categorias de objeção gerenciáveis. Substitui o array fixo + CHECK estático.
-- objections.categoria continua texto (o nome da categoria); a tabela só
-- alimenta as opções. Dropa o CHECK para permitir categorias novas.
-- ============================================================================

create table if not exists objection_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  nome text not null,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  unique (org_id, nome)
);
create index if not exists objection_categories_org_idx on objection_categories (org_id);

alter table objection_categories enable row level security;
drop policy if exists objection_categories_all on objection_categories;
create policy objection_categories_all on objection_categories for all to authenticated using (true) with check (true);

-- Seed das categorias atuais por organização.
insert into objection_categories (org_id, nome)
select o.id, c.nome
from orgs o
cross join (values ('Preço'), ('Produto'), ('Timing'), ('Relacionamento'), ('Concorrência'), ('Outro')) as c(nome)
on conflict (org_id, nome) do nothing;

-- Remove o CHECK estático da coluna categoria.
alter table objections drop constraint if exists objections_categoria_check;
