-- ============================================================================
-- Organizações: ano desde quando a organização é cliente da Blueticket.
-- Preenchido pela importação de organizações (campo opcional). Usado no BI
-- (/bi/analises/organizadores) como coluna "Desde".
-- ============================================================================

alter table organizations
  add column if not exists cliente_desde int;

comment on column organizations.cliente_desde is
  'Ano em que a organização passou a ser cliente da Blueticket (origem: importação).';
