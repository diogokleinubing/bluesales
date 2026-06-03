-- ============================================================================
-- CRM Fase 1 — funis dinâmicos (tipos + estágios) e seed dos dois funis
-- ============================================================================

create table if not exists funnel_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  slug text not null,
  nome text not null,
  unique (org_id, slug)
);

create table if not exists funnel_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  funnel_type_id uuid not null references funnel_types(id),
  nome text not null,
  sequencia int not null,
  cor text,
  ativo boolean default true,
  unique (funnel_type_id, sequencia)
);
create index if not exists funnel_stages_type_idx on funnel_stages (funnel_type_id);

-- Tipos de funil para cada org.
insert into funnel_types (org_id, slug, nome)
select o.id, 'relacionamento', 'Relacionamento' from orgs o
on conflict (org_id, slug) do nothing;
insert into funnel_types (org_id, slug, nome)
select o.id, 'oportunidade', 'Oportunidade' from orgs o
on conflict (org_id, slug) do nothing;

-- Estágios do funil de relacionamento.
insert into funnel_stages (org_id, funnel_type_id, nome, sequencia, cor)
select ft.org_id, ft.id, s.nome, s.seq, s.cor
from funnel_types ft
cross join (values
  ('Desconhecimento', 1, '#94a3b8'),
  ('Conhecimento',    2, '#60a5fa'),
  ('Familiaridade',   3, '#38bdf8'),
  ('Preferência',     4, '#34d399'),
  ('Idealização',     5, '#22c55e')
) as s(nome, seq, cor)
where ft.slug = 'relacionamento'
on conflict (funnel_type_id, sequencia) do nothing;

-- Estágios do funil de oportunidades.
insert into funnel_stages (org_id, funnel_type_id, nome, sequencia, cor)
select ft.org_id, ft.id, s.nome, s.seq, s.cor
from funnel_types ft
cross join (values
  ('Buscando contato',   1, '#94a3b8'),
  ('Contato respondido', 2, '#60a5fa'),
  ('Reunião agendada',   3, '#a78bfa'),
  ('Reunião realizada',  4, '#f59e0b'),
  ('Proposta enviada',   5, '#22c55e')
) as s(nome, seq, cor)
where ft.slug = 'oportunidade'
on conflict (funnel_type_id, sequencia) do nothing;
