-- Locais (CRM): campos Site e Instagram.
alter table crm_locals
  add column if not exists site text,
  add column if not exists instagram text;
