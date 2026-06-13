-- Tipos de local: remove o campo "ordem" (passa a ordenar alfabeticamente).
alter table local_types drop column if exists ordem;
