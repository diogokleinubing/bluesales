-- Vínculo de atividades com as demais entidades (além de organização):
-- evento, local e artista. Mantém organization_id e opportunity_id.

alter table activities
  add column if not exists local_id uuid references crm_locals(id),
  add column if not exists crm_event_id uuid references crm_events(id),
  add column if not exists artist_id uuid references artists(id);

create index if not exists activities_local_idx on activities (local_id);
create index if not exists activities_event_idx on activities (crm_event_id);
create index if not exists activities_artist_idx on activities (artist_id);
