-- Roda a detecção uma vez sobre os eventos já existentes (server-side, sem o
-- statement_timeout do PostgREST). Idempotente (on conflict do nothing).
select detect_event_artists();
