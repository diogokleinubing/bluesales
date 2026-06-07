-- ============================================================================
-- Desabilita a coleta automática (crons). A coleta passa a ser apenas manual
-- (pela UI). Os jobs podem ser reativados depois reaplicando 0056/0108 ou
-- recriando com cron.schedule.
-- ============================================================================

select cron.unschedule('crawler-run-weekly')
where exists (select 1 from cron.job where jobname = 'crawler-run-weekly');

select cron.unschedule('crawler-run-pne-6h')
where exists (select 1 from cron.job where jobname = 'crawler-run-pne-6h');
