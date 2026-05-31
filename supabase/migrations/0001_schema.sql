-- ============================================================================
-- Blueticket Analytics — schema do módulo BI
-- ----------------------------------------------------------------------------
-- Multi-tenant futuro: toda tabela de negócio carrega org_id. Por enquanto há
-- uma única org (Blueticket). NÃO há troca de org agora — só a coluna e o seed.
-- ============================================================================

-- Organizações (tenants)
create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  created_at timestamptz not null default now()
);

-- Eventos (≈830) — aba "Eventos" da planilha, join por codigo_evento
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  codigo_evento text not null,          -- código do Blueticket (ex.: "36808")
  organizador text,
  nome text,                            -- coluna "evento" da planilha
  local text,
  data_evento date,                     -- derivado de "YYYY-MM" -> dia 1 do mês
  cidade text,
  uf text,
  segmento text,                        -- classificação (cache), recalculável
  created_at timestamptz not null default now(),
  unique (org_id, codigo_evento)
);
create index if not exists events_org_idx on events (org_id);
create index if not exists events_org_codigo_idx on events (org_id, codigo_evento);

-- Vendas (≈4800) — aba "Vendas" da planilha
create table if not exists sales (
  id bigint generated always as identity primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  event_id uuid references events(id) on delete set null,
  codigo_evento text not null,          -- redundante p/ join rápido e import
  data_venda timestamptz,
  tipo_pdv text check (tipo_pdv in ('E','D','I')),  -- null se corrompido
  valor_ingressos numeric default 0,
  valor_conveniencia numeric default 0,
  comissao_site numeric default 0,
  valor_juros numeric default 0,
  rebate numeric default 0,
  mdr numeric default 0,
  receita_intermediacao numeric default 0,
  import_batch_id uuid,
  -- Colunas geradas para as métricas financeiras:
  --   GMV          = valor_ingressos
  --   Receita BT   = conveniencia + comissao + juros + intermediacao
  --   Receita Líq. = Receita BT - mdr - rebate
  gmv numeric generated always as (coalesce(valor_ingressos, 0)) stored,
  receita_bt numeric generated always as (
    coalesce(valor_conveniencia, 0) + coalesce(comissao_site, 0)
    + coalesce(valor_juros, 0) + coalesce(receita_intermediacao, 0)
  ) stored,
  receita_liq numeric generated always as (
    coalesce(valor_conveniencia, 0) + coalesce(comissao_site, 0)
    + coalesce(valor_juros, 0) + coalesce(receita_intermediacao, 0)
    - coalesce(mdr, 0) - coalesce(rebate, 0)
  ) stored
);
create index if not exists sales_org_data_idx on sales (org_id, data_venda);
create index if not exists sales_codigo_idx on sales (codigo_evento);
create index if not exists sales_event_idx on sales (event_id);
create index if not exists sales_batch_idx on sales (import_batch_id);

-- Lotes de importação
create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  file_name text,
  rows_imported int,
  years int[],
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Classificação de segmentos (tela "Regras")
-- Prioridade do motor: override por evento > mapa local > palavra no nome >
--                      palavra no local > "Outros"
-- ----------------------------------------------------------------------------
create table if not exists segments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  nome text not null
);
create index if not exists segments_org_idx on segments (org_id);

create table if not exists keyword_rules (   -- por palavra no nome do evento
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  keyword text not null,
  segmento text not null,
  ordem int default 0
);
create index if not exists keyword_rules_org_idx on keyword_rules (org_id);

create table if not exists venue_rules (     -- por palavra no nome do local
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  keyword text not null,
  segmento text not null,
  ordem int default 0
);
create index if not exists venue_rules_org_idx on venue_rules (org_id);

create table if not exists venue_segment_map (   -- override por local específico
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  local text not null,
  segmento text not null,
  unique (org_id, local)
);

create table if not exists event_segment_override ( -- override por evento
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  codigo_evento text not null,
  segmento text not null,
  unique (org_id, codigo_evento)
);

-- ----------------------------------------------------------------------------
-- Provisionamento comercial (tela "Provisionamento")
-- ----------------------------------------------------------------------------
create table if not exists provisioning (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  base_year int not null,
  target_year int not null,
  item_key text not null,      -- organizador, "__OUTROS__" ou id de "novo"
  nome text,
  status text default 'Ativo', -- Ativo | Risco | Perdido | Novo
  forecast numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, base_year, target_year, item_key)
);
create index if not exists provisioning_org_idx on provisioning (org_id, base_year, target_year);
