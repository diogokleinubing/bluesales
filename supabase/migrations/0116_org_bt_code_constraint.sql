-- Troca o índice único parcial por uma CONSTRAINT única (org_id, blueticket_code),
-- para permitir upsert via PostgREST (on_conflict). Nulos são distintos no
-- Postgres, então as organizações antigas (sem blueticket_code) não conflitam.

drop index if exists organizations_org_bt_code_idx;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_org_bt_code_uk'
  ) then
    alter table organizations
      add constraint organizations_org_bt_code_uk unique (org_id, blueticket_code);
  end if;
end $$;
