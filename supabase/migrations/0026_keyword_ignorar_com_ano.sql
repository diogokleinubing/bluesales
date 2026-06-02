-- ============================================================================
-- Regras de termo: opção "Só sem ano"
-- ----------------------------------------------------------------------------
-- Quando ignorar_com_ano = true, a regra NÃO é aplicada se o nome do evento
-- contiver um ano (20XX) — indica que é uma edição/festival, não um show.
-- Default false: nada muda nas regras existentes.
-- ============================================================================

alter table keyword_rules
  add column if not exists ignorar_com_ano boolean not null default false;
alter table venue_rules
  add column if not exists ignorar_com_ano boolean not null default false;
