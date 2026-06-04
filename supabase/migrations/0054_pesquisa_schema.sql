-- ============================================================================
-- Módulo Pesquisa (Crawlers / Inteligência de Mercado) — Fase 2: schema + RLS
--
-- Princípios:
--  - Eventos coletados (crawled_events) NUNCA se misturam com crm_events.
--    A "promoção" para o Comercial é manual e registrada em promovido_crm_event_id.
--  - url_evento é a chave de dedupe (unique por org).
--  - Eventos online e gratuitos são ignorados ANTES de inserir (no scraper);
--    crawled_events.ignorado cobre os descartados por regra de palavra-chave.
--  - Arquitetura genérica: 1 linha em crawler_sources por plataforma.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Fontes de coleta (uma linha por plataforma)
-- ---------------------------------------------------------------------------
create table if not exists crawler_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  nome text not null,
  slug text not null,                          -- sympla | ingresse | guicheweb | bilheteriadigital
  tipo text not null default 'platform',       -- platform (extensível p/ futuros tipos)
  metodo text not null,                         -- edge_api | edge_html | worker (futuro)
  ativo boolean not null default true,
  config jsonb not null default '{}'::jsonb,    -- { cidades:[{cidade,uf}], janela_dias }
  ultima_execucao timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);

-- ---------------------------------------------------------------------------
-- Execuções (uma "rodada" do orquestrador crawler-run)
-- ---------------------------------------------------------------------------
create table if not exists crawler_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  source_id uuid references crawler_sources(id) on delete set null,
  status text not null default 'running',       -- running | done | error
  disparado_por text not null default 'cron',   -- cron | manual
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  eventos_vistos int not null default 0,
  eventos_novos int not null default 0,
  eventos_ignorados int not null default 0,
  erros int not null default 0,
  erro_msg text,
  created_at timestamptz not null default now()
);
create index if not exists crawler_runs_org_iniciado_idx
  on crawler_runs (org_id, iniciado_em desc);

-- ---------------------------------------------------------------------------
-- Jobs (unidade de trabalho: 1 fonte x 1 cidade) — fila do orquestrador
-- ---------------------------------------------------------------------------
create table if not exists crawler_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  run_id uuid references crawler_runs(id) on delete cascade,
  source_id uuid not null references crawler_sources(id) on delete cascade,
  status text not null default 'pending',       -- pending | running | done | error
  payload jsonb not null default '{}'::jsonb,    -- { cidade, uf, janela_dias }
  scheduled_for timestamptz not null default now(),
  iniciado_em timestamptz,
  finalizado_em timestamptz,
  resultado jsonb,
  erro_msg text,
  created_at timestamptz not null default now()
);
create index if not exists crawler_jobs_status_idx
  on crawler_jobs (status, scheduled_for);

-- ---------------------------------------------------------------------------
-- Regras de ignorar (palavras-chave)
-- ---------------------------------------------------------------------------
create table if not exists crawler_ignore_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  tipo text not null check (tipo in ('nome_evento', 'local', 'organizador')),
  keyword text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, tipo, keyword)
);

-- ---------------------------------------------------------------------------
-- Eventos capturados (NÃO se misturam com crm_events)
-- ---------------------------------------------------------------------------
create table if not exists crawled_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  source_id uuid not null references crawler_sources(id) on delete cascade,

  url_evento text not null,                      -- chave de dedupe
  nome text not null,
  data_inicio timestamptz,
  data_fim timestamptz,

  organizador_raw text,
  organizador_url text,
  local_raw text,
  cidade text,
  uf text,

  preco_min numeric(12, 2),
  preco_max numeric(12, 2),
  gratuito boolean not null default false,
  online boolean not null default false,

  segmento text,                                 -- classificação (Fase 4)
  imagem_url text,
  descricao text,
  raw jsonb,                                      -- payload bruto da fonte

  ignorado boolean not null default false,        -- descartado por regra
  ignorado_motivo text,
  promovido_crm_event_id uuid references crm_events(id) on delete set null,
  promovido_em timestamptz,
  promovido_por uuid references profiles(id) on delete set null,

  primeira_vez_visto timestamptz not null default now(),
  ultima_vez_visto timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (org_id, url_evento)
);
create index if not exists crawled_events_source_data_idx
  on crawled_events (source_id, data_inicio);
create index if not exists crawled_events_organizador_idx
  on crawled_events (organizador_raw);
create index if not exists crawled_events_cidade_idx
  on crawled_events (cidade, uf);
create index if not exists crawled_events_org_visto_idx
  on crawled_events (org_id, primeira_vez_visto desc);

-- ---------------------------------------------------------------------------
-- Histórico de mudanças de um evento capturado (preço, data, etc.)
-- ---------------------------------------------------------------------------
create table if not exists crawled_event_changes (
  id uuid primary key default gen_random_uuid(),
  crawled_event_id uuid not null references crawled_events(id) on delete cascade,
  campo text not null,
  valor_antigo text,
  valor_novo text,
  detectado_em timestamptz not null default now()
);
create index if not exists crawled_event_changes_event_idx
  on crawled_event_changes (crawled_event_id, detectado_em desc);

-- ============================================================================
-- RLS
--  - Leitura: todo usuário autenticado.
--  - crawler_sources / crawler_ignore_rules: escrita só Gestor (config).
--  - crawled_events / crawled_event_changes: escrita p/ autenticados
--    (Comercial promove/ignora/vincula eventos).
--  - crawler_runs / crawler_jobs: escrita via service_role (Edge Functions),
--    que ignora RLS; clientes apenas leem.
-- ============================================================================
alter table crawler_sources       enable row level security;
alter table crawler_runs          enable row level security;
alter table crawler_jobs          enable row level security;
alter table crawler_ignore_rules  enable row level security;
alter table crawled_events        enable row level security;
alter table crawled_event_changes enable row level security;

-- Fontes: leitura todos, escrita Gestor
drop policy if exists crawler_sources_read on crawler_sources;
create policy crawler_sources_read on crawler_sources
  for select to authenticated using (true);
drop policy if exists crawler_sources_write on crawler_sources;
create policy crawler_sources_write on crawler_sources
  for all to authenticated using (is_gestor()) with check (is_gestor());

-- Regras de ignorar: leitura todos, escrita Gestor
drop policy if exists crawler_ignore_rules_read on crawler_ignore_rules;
create policy crawler_ignore_rules_read on crawler_ignore_rules
  for select to authenticated using (true);
drop policy if exists crawler_ignore_rules_write on crawler_ignore_rules;
create policy crawler_ignore_rules_write on crawler_ignore_rules
  for all to authenticated using (is_gestor()) with check (is_gestor());

-- Execuções e jobs: leitura todos (escrita via service_role)
drop policy if exists crawler_runs_read on crawler_runs;
create policy crawler_runs_read on crawler_runs
  for select to authenticated using (true);
drop policy if exists crawler_jobs_read on crawler_jobs;
create policy crawler_jobs_read on crawler_jobs
  for select to authenticated using (true);

-- Eventos capturados: leitura + escrita p/ autenticados (promover/ignorar/vincular)
drop policy if exists crawled_events_all on crawled_events;
create policy crawled_events_all on crawled_events
  for all to authenticated using (true) with check (true);

drop policy if exists crawled_event_changes_all on crawled_event_changes;
create policy crawled_event_changes_all on crawled_event_changes
  for all to authenticated using (true) with check (true);
