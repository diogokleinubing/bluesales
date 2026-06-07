-- ============================================================================
-- Agenda oficial dos artistas (Pesquisa).
--   - artists.agenda_url: endpoint JSON da agenda do site oficial do artista.
--   - artist_agenda_events: shows capturados da agenda (separados de
--     crawled_events e de crm_events). Podem ser "copiados para o CRM".
-- ============================================================================

alter table artists add column if not exists agenda_url text;

create table if not exists artist_agenda_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  artist_id uuid not null references artists(id) on delete cascade,
  external_id text not null,                       -- uuid/id do item na agenda (dedupe)
  nome text not null,
  data date,
  hora text,
  local_raw text,
  cidade text,
  uf text,
  site_url text,                                   -- URL do site oficial / produtor
  link_sale text,                                  -- URL do link de vendas
  promovido_crm_event_id uuid references crm_events(id) on delete set null,
  promovido_em timestamptz,
  promovido_por uuid references profiles(id),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artist_id, external_id)
);

create index if not exists artist_agenda_events_org_data_idx
  on artist_agenda_events (org_id, data);
create index if not exists artist_agenda_events_artist_idx
  on artist_agenda_events (artist_id, data);

alter table artist_agenda_events enable row level security;
drop policy if exists artist_agenda_events_all on artist_agenda_events;
create policy artist_agenda_events_all on artist_agenda_events
  for all to authenticated using (true) with check (true);
