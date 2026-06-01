-- ============================================================================
-- Classificação: segmento_manual + dimensão Gênero Musical
-- ----------------------------------------------------------------------------
-- Substitui o conceito de "override" por campos diretos no evento e adiciona
-- gênero como segunda dimensão, paralela ao segmento.
--
-- ATENÇÃO: esta migration dropa event_segment_override. Só aplique junto com o
-- código que deixa de usá-la (Fases B–E).
-- ============================================================================

-- 1) Novos campos em events
alter table events
  add column if not exists segmento_manual text default null,
  add column if not exists genero text default null,
  add column if not exists genero_manual text default null;

-- 2) Migra os overrides existentes para segmento_manual e remove a tabela.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'event_segment_override') then
    update events e
    set segmento_manual = o.segmento
    from event_segment_override o
    where o.org_id = e.org_id
      and o.codigo_evento = e.codigo_evento;
    drop table event_segment_override cascade;
  end if;
end $$;

-- 3) Regras passam a suportar gênero; segmento deixa de ser obrigatório
--    (uma regra pode classificar só segmento, só gênero, ou os dois).
alter table keyword_rules add column if not exists genero text default null;
alter table keyword_rules alter column segmento drop not null;

alter table venue_rules add column if not exists genero text default null;
alter table venue_rules alter column segmento drop not null;

-- venue_segment_map: mantém o nome (pra não quebrar queries), ganha gênero.
alter table venue_segment_map add column if not exists genero text default null;
alter table venue_segment_map alter column segmento drop not null;

-- 4) Gêneros (paralelo a segments)
create table if not exists generos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  nome text not null,
  unique (org_id, nome)
);
create index if not exists generos_org_idx on generos (org_id);

alter table generos enable row level security;
drop policy if exists generos_authenticated_all on generos;
create policy generos_authenticated_all on generos
  for all to authenticated using (true) with check (true);

-- Seed dos gêneros comuns (BR) para cada org existente, sem duplicar.
insert into generos (org_id, nome)
select o.id, g.nome
from orgs o
cross join (values
  ('Sertanejo'),('Forró'),('Pagode'),('Samba'),('MPB'),('Rock'),('Pop'),
  ('Funk'),('Eletrônico'),('Gospel'),('Axé'),('Reggae'),('Hip-Hop'),
  ('Jazz'),('Clássico'),('Infantil'),('Outros')
) as g(nome)
on conflict (org_id, nome) do nothing;

-- 5) Índices das dimensões calculadas
create index if not exists events_org_segmento_idx on events (org_id, segmento);
create index if not exists events_org_genero_idx on events (org_id, genero);
