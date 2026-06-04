-- ============================================================================
-- CRM — resultado da oportunidade (Ganho | Perdida). Quando definido, a
-- oportunidade deixa de estar "em aberto" (sai do Kanban da Visão Geral).
-- ============================================================================

alter table opportunities
  add column if not exists resultado text check (resultado in ('Ganho', 'Perdida')),
  add column if not exists resultado_em timestamptz;
