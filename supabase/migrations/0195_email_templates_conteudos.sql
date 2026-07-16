-- ============================================================================
-- Newsletter de produto: templates de mensagem + matérias (conteúdo) com landing
-- pública (/conteudo/:codigo). A leitura pública é feita por Edge Function
-- (service_role); a tabela segue sob RLS is_member() como o resto do Comercial.
-- ============================================================================

-- Mensagens: qual template e os dados das seções de texto (mensagem inicial/final).
alter table email_campaigns add column if not exists template_id text;
alter table email_campaigns add column if not exists template_data jsonb not null default '{}'::jsonb;

-- Matérias (itens com "Saiba mais"): usadas tanto no resumo da newsletter quanto
-- no conteúdo completo da landing page. Uma matéria por linha.
create table if not exists crm_conteudos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  campaign_id uuid references email_campaigns(id) on delete set null,
  secao text not null check (secao in ('destaque', 'novidade', 'como_usar')),
  ordem int not null default 0,
  codigo text not null unique default substr(md5(gen_random_uuid()::text), 1, 10),
  titulo text not null default '',
  resumo text,
  cover_url text,
  corpo text,                       -- markdown
  publicado boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  deleted_at timestamptz
);
create index if not exists crm_conteudos_campaign_idx on crm_conteudos (campaign_id);
create index if not exists crm_conteudos_codigo_idx on crm_conteudos (codigo);

alter table crm_conteudos enable row level security;
drop policy if exists crm_conteudos_member on crm_conteudos;
create policy crm_conteudos_member on crm_conteudos for all using (is_member()) with check (is_member());
grant select, insert, update, delete on crm_conteudos to authenticated;

-- Bucket de imagens das matérias (mesmo padrão de apresentacoes: público p/ leitura).
insert into storage.buckets (id, name, public) values ('conteudos', 'conteudos', true)
  on conflict (id) do nothing;
drop policy if exists conteudos_read on storage.objects;
create policy conteudos_read on storage.objects for select using (bucket_id = 'conteudos');
drop policy if exists conteudos_write on storage.objects;
create policy conteudos_write on storage.objects for insert to authenticated with check (bucket_id = 'conteudos');
drop policy if exists conteudos_update on storage.objects;
create policy conteudos_update on storage.objects for update to authenticated using (bucket_id = 'conteudos');
drop policy if exists conteudos_delete on storage.objects;
create policy conteudos_delete on storage.objects for delete to authenticated using (bucket_id = 'conteudos');
