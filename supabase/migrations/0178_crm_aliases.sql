-- Nomes alternativos (aliases) para organizações e locais do CRM, para casar
-- com a base da Pesquisa quando o nome capturado difere do cadastrado.
alter table organizations add column if not exists aliases text;
alter table crm_locals add column if not exists aliases text;
