-- ============================================================================
-- CRM — bucket de Storage para transcrições de atividades
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('transcricoes', 'transcricoes', true)
on conflict (id) do nothing;

-- Autenticados podem enviar e ler; leitura pública (bucket public) para o link.
drop policy if exists transcricoes_insert on storage.objects;
create policy transcricoes_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'transcricoes');

drop policy if exists transcricoes_select on storage.objects;
create policy transcricoes_select on storage.objects
  for select to authenticated
  using (bucket_id = 'transcricoes');

drop policy if exists transcricoes_delete on storage.objects;
create policy transcricoes_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'transcricoes');
