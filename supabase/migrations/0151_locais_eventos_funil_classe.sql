-- Estágio de relacionamento (funnel_stages) + classe (A+/A/B/C) para Locais e Eventos.
-- Compartilham os mesmos estágios do funil 'relacionamento' das organizações.

alter table crm_locals
  add column if not exists funil_stage_id uuid references funnel_stages(id),
  add column if not exists classificacao text check (classificacao in ('A+', 'A', 'B', 'C'));

alter table crm_events
  add column if not exists funil_stage_id uuid references funnel_stages(id),
  add column if not exists classificacao text check (classificacao in ('A+', 'A', 'B', 'C'));

create index if not exists crm_locals_stage_idx on crm_locals (funil_stage_id);
create index if not exists crm_events_stage_idx on crm_events (funil_stage_id);
