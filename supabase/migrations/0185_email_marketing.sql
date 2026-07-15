-- ============================================================================
-- CRM — Email Marketing (listas, mensagens/campanhas, envios e eventos).
-- Motor de envio: Resend (integração via Edge Functions, feita ao final).
-- Todas as tabelas sob RLS is_member() (mesma barreira do resto do Comercial).
-- Opt-out é GLOBAL: email_suppressions é honrada em todo disparo.
-- ============================================================================

-- Listas -------------------------------------------------------------------
create table if not exists email_lists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  deleted_at timestamptz
);
create index if not exists email_lists_org_idx on email_lists (org_id);

create table if not exists email_list_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  list_id uuid not null references email_lists(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  status text not null default 'inscrito' check (status in ('inscrito','descadastrado')),
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  unique (list_id, person_id)
);
create index if not exists email_list_members_list_idx on email_list_members (list_id);
create index if not exists email_list_members_person_idx on email_list_members (person_id);

-- Mensagens (campanhas) -----------------------------------------------------
create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  nome text not null,
  assunto text,
  remetente_nome text,
  remetente_email text,
  reply_to text,
  html text,
  status text not null default 'rascunho' check (status in ('rascunho','fila','enviada','cancelada')),
  agendada_para timestamptz,
  enviada_em timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  deleted_at timestamptz
);
create index if not exists email_campaigns_org_idx on email_campaigns (org_id);

create table if not exists email_campaign_lists (
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  list_id uuid not null references email_lists(id) on delete cascade,
  primary key (campaign_id, list_id)
);

-- Envios (1 linha por destinatário) e eventos -------------------------------
create table if not exists email_recipients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  person_id uuid references persons(id) on delete set null,
  email text not null,
  status text not null default 'fila' check (status in ('fila','enviado','entregue','bounce','falha','reclamacao')),
  esp_message_id text,
  token uuid not null default gen_random_uuid(),
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  unsubscribed_at timestamptz,
  opens_count int not null default 0,
  clicks_count int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  unique (campaign_id, person_id)
);
create index if not exists email_recipients_campaign_idx on email_recipients (campaign_id);
create index if not exists email_recipients_person_idx on email_recipients (person_id);
create unique index if not exists email_recipients_token_idx on email_recipients (token);

create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  recipient_id uuid references email_recipients(id) on delete cascade,
  campaign_id uuid references email_campaigns(id) on delete cascade,
  person_id uuid references persons(id) on delete set null,
  tipo text not null check (tipo in ('enviado','entregue','aberto','clique','bounce','reclamacao','descadastro','falha')),
  url text,
  ocorrido_em timestamptz not null default now(),
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists email_events_person_idx on email_events (person_id, ocorrido_em desc);
create index if not exists email_events_campaign_idx on email_events (campaign_id, tipo);

-- Supressão global (opt-out / bounce / reclamação) --------------------------
create table if not exists email_suppressions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  email text not null,
  person_id uuid references persons(id) on delete set null,
  motivo text not null check (motivo in ('optout','bounce','reclamacao','manual')),
  campaign_id uuid references email_campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

-- RLS + grants (explícito por tabela — mesma barreira is_member() do Comercial)
alter table email_lists          enable row level security;
alter table email_list_members   enable row level security;
alter table email_campaigns      enable row level security;
alter table email_campaign_lists enable row level security;
alter table email_recipients     enable row level security;
alter table email_events         enable row level security;
alter table email_suppressions   enable row level security;

create policy email_lists_member          on email_lists          for all using (is_member()) with check (is_member());
create policy email_list_members_member   on email_list_members   for all using (is_member()) with check (is_member());
create policy email_campaigns_member      on email_campaigns      for all using (is_member()) with check (is_member());
create policy email_campaign_lists_member on email_campaign_lists for all using (is_member()) with check (is_member());
create policy email_recipients_member     on email_recipients     for all using (is_member()) with check (is_member());
create policy email_events_member         on email_events         for all using (is_member()) with check (is_member());
create policy email_suppressions_member   on email_suppressions   for all using (is_member()) with check (is_member());

grant select, insert, update, delete on
  email_lists, email_list_members, email_campaigns, email_campaign_lists,
  email_recipients, email_events, email_suppressions
  to authenticated;

-- Estatísticas por campanha (respeita RLS do chamador) ----------------------
create or replace view email_campaign_stats as
select
  r.campaign_id,
  count(*)                                            as total,
  count(*) filter (where r.status <> 'fila')          as enviados,
  count(*) filter (where r.delivered_at is not null)  as entregues,
  count(*) filter (where r.opened_at is not null)     as aberturas,
  count(*) filter (where r.clicked_at is not null)    as cliques,
  count(*) filter (where r.unsubscribed_at is not null) as descadastros,
  count(*) filter (where r.status = 'bounce')         as bounces
from email_recipients r
group by r.campaign_id;

alter view email_campaign_stats set (security_invoker = on);
grant select on email_campaign_stats to authenticated;
