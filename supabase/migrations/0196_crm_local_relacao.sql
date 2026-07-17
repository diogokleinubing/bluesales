-- Locais: tipo de relação buscada — Comercial (fechamento) ou Parceria.
alter table crm_locals add column if not exists relacao text check (relacao in ('Comercial', 'Parceria'));
