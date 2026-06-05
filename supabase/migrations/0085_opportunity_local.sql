-- Vínculo direto Oportunidade -> Local. A coluna "Oportunidade" da listagem de
-- Locais passa a considerar apenas oportunidades ligadas DIRETAMENTE ao local
-- (não mais via evento).
alter table opportunities
  add column if not exists local_id uuid references crm_locals(id) on delete set null;

create index if not exists opportunities_local_idx on opportunities (local_id)
  where deleted_at is null;
