-- ============================================================================
-- CRM — histórico de edições/plataformas de um evento.
-- Cada edição = uma data + um conjunto de plataformas. Substitui a ideia de
-- "data única" do evento por múltiplas datas.
-- ============================================================================

create table if not exists crm_event_editions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  crm_event_id uuid not null references crm_events(id) on delete cascade,
  data date,
  platform_ids uuid[] not null default '{}',
  created_at timestamptz default now()
);
create index if not exists crm_event_editions_event_idx on crm_event_editions (crm_event_id);

alter table crm_event_editions enable row level security;
drop policy if exists crm_event_editions_all on crm_event_editions;
create policy crm_event_editions_all on crm_event_editions
  for all to authenticated using (true) with check (true);
