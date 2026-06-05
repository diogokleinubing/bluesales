-- Observação por execução: o que foi rodado (estados/cidades, offset/cursor,
-- candidatos/processados). Exibida na listagem de execuções (botão lupa).
alter table crawler_runs add column if not exists observacao text;

comment on column crawler_runs.observacao is
  'Resumo legível do que a execução varreu (estados/cidades, offset/cursor antes→depois, notas do scraper).';
