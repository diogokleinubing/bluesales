-- Análise profunda (deep scrape + IA) de um evento capturado.
-- Resultado por evento (re-rodável): sinais estruturados + veredito de fit.

create table if not exists event_deep_analysis (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id) on delete cascade,
  crawled_event_id uuid not null references crawled_events(id) on delete cascade,
  status text not null default 'ok',                 -- ok | erro
  fit_score int,                                     -- 0–100 (veredito da IA)
  recomendacao text,                                 -- prospectar | avaliar | descartar
  veredito text,                                     -- justificativa curta
  sinais jsonb,                                      -- sinais estruturados extraídos
  official_url text,
  modelo text,
  erro text,
  created_at timestamptz not null default now(),
  unique (crawled_event_id)
);

create index if not exists event_deep_analysis_org_idx on event_deep_analysis (org_id);

alter table event_deep_analysis enable row level security;
drop policy if exists event_deep_analysis_ro on event_deep_analysis;
create policy event_deep_analysis_ro on event_deep_analysis for select to authenticated using (true);
-- Escrita só pela edge function (service_role bypassa RLS).
