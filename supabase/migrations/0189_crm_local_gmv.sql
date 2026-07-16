-- GMV do local passa a ser um valor manual (coluna própria), em vez de derivado
-- da soma do GMV estimado dos eventos daquele local.
alter table crm_locals add column if not exists gmv_estimado numeric;
