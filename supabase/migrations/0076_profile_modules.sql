-- Visibilidade de módulos por usuário.
-- modules NULL ou vazio  -> usuário vê TODOS os módulos (padrão; retrocompatível).
-- modules com valores    -> usuário vê apenas os módulos listados ('comercial' | 'bi' | 'pesquisa').
-- Admin sempre vê todos (aplicado na aplicação), independente desta coluna.
alter table profiles add column if not exists modules text[];

comment on column profiles.modules is
  'Módulos visíveis para o usuário (comercial|bi|pesquisa). NULL/vazio = todos. Admin sempre vê todos.';
