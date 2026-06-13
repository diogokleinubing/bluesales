-- ============================================================================
-- Módulo Apresentações (Comercial).
--   - presentation_blocks: itens do "cardápio" (biblioteca), por organização.
--   - presentation_block_slides: slides de cada bloco (cena do canvas em JSON),
--       com versão (incrementa a cada edição) para o alerta de atualização.
--   - presentations: instância (apresentação para uma reunião/cliente).
--   - presentation_slides: snapshot dos slides na instância, guardando a versão
--       de origem (source_versao) para alertar quando a biblioteca mudou.
--   Tudo org-scoped; RLS aberta para autenticado (todos editam — decisão 6).
-- ============================================================================

create table if not exists presentation_blocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  titulo text not null,
  categoria text,
  descricao text,
  ordem int not null default 0,
  ativo boolean not null default true,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists presentation_blocks_org_idx on presentation_blocks (org_id);

create table if not exists presentation_block_slides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  block_id uuid not null references presentation_blocks(id) on delete cascade,
  ordem int not null default 0,
  conteudo jsonb not null default '{}'::jsonb,
  thumb text,
  versao int not null default 1,
  updated_at timestamptz default now()
);
create index if not exists presentation_block_slides_block_idx on presentation_block_slides (block_id);

create table if not exists presentations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  organization_id uuid references organizations(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  activity_id uuid references activities(id) on delete set null,
  titulo text not null,
  cliente_nome text,
  empresa_info jsonb not null default '{}'::jsonb,
  status text not null default 'rascunho' check (status in ('rascunho','montada','compartilhada')),
  share_token uuid not null default gen_random_uuid(),
  share_expira_em timestamptz,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (share_token)
);
create index if not exists presentations_org_idx on presentations (org_id);

create table if not exists presentation_slides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  presentation_id uuid not null references presentations(id) on delete cascade,
  ordem int not null default 0,
  conteudo jsonb not null default '{}'::jsonb,
  thumb text,
  incluido boolean not null default true,
  source_block_id uuid references presentation_blocks(id) on delete set null,
  source_slide_id uuid references presentation_block_slides(id) on delete set null,
  source_versao int,
  updated_at timestamptz default now()
);
create index if not exists presentation_slides_pres_idx on presentation_slides (presentation_id);

-- RLS: org-scoped, aberto para autenticado (todos editam).
do $$
declare t text;
begin
  foreach t in array array[
    'presentation_blocks','presentation_block_slides','presentations','presentation_slides'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_all', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true)',
      t || '_all', t);
  end loop;
end $$;

-- Storage: bucket de mídia das apresentações (imagens/vídeos). Público p/ leitura
-- (o link do cliente é público); escrita só autenticado.
insert into storage.buckets (id, name, public) values ('apresentacoes', 'apresentacoes', true)
on conflict (id) do nothing;

drop policy if exists apresentacoes_read on storage.objects;
create policy apresentacoes_read on storage.objects for select using (bucket_id = 'apresentacoes');
drop policy if exists apresentacoes_write on storage.objects;
create policy apresentacoes_write on storage.objects for insert to authenticated with check (bucket_id = 'apresentacoes');
drop policy if exists apresentacoes_update on storage.objects;
create policy apresentacoes_update on storage.objects for update to authenticated using (bucket_id = 'apresentacoes');
drop policy if exists apresentacoes_delete on storage.objects;
create policy apresentacoes_delete on storage.objects for delete to authenticated using (bucket_id = 'apresentacoes');
