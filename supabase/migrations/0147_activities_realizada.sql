-- Atividades: status "realizada". Backfill: o que já passou conta como
-- realizado; o que está no futuro (agendamentos) fica pendente.
alter table activities add column if not exists realizada boolean not null default false;
update activities set realizada = (data_hora <= now());
