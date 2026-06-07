-- ============================================================================
-- Importação de organizações (origem Blueticket) + hierarquia principal/sub.
--   - blueticket_code / blueticket_parent_code / relationship_user_code: códigos
--     INT vindos da base da Blueticket (origem). blueticket_parent_code, quando
--     presente, indica que a org é SUB de outra (a principal, pelo seu code).
--   - parent_id: referência interna (uuid) da principal NO NOSSO SISTEMA,
--     resolvida do blueticket_parent_code -> usada nas consultas (mais rápido).
--   - razao_social / documento / telefone: dados cadastrais.
-- ============================================================================

alter table organizations
  add column if not exists blueticket_code int,
  add column if not exists blueticket_parent_code int,
  add column if not exists relationship_user_code int,
  add column if not exists parent_id uuid references organizations(id) on delete set null,
  add column if not exists razao_social text,
  add column if not exists documento text,
  add column if not exists telefone text;

-- Integridade: um blueticket_code por tenant (parcial — ignora os nulos antigos).
create unique index if not exists organizations_org_bt_code_idx
  on organizations (org_id, blueticket_code) where blueticket_code is not null;

create index if not exists organizations_parent_idx on organizations (parent_id);

-- Resolve parent_id a partir do blueticket_parent_code (1 nível: sub -> principal).
create or replace function resolve_org_parents(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update organizations c
    set parent_id = p.id, updated_at = now()
  from organizations p
  where c.org_id = p_org
    and c.blueticket_parent_code is not null
    and p.org_id = p_org
    and p.blueticket_code = c.blueticket_parent_code
    and c.id <> p.id
    and c.parent_id is distinct from p.id;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function resolve_org_parents(uuid) to authenticated;
