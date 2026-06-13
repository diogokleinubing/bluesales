-- Atividades sem data ("To-Do" / A fazer): data_hora passa a ser opcional.
-- data_hora NULL = tarefa de backlog (não aparece no calendário).
alter table activities alter column data_hora drop not null;
