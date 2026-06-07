-- Reativa eventos do Ticket Sports que haviam sido ignorados por regra de
-- palavra-chave (ex.: "corrida"). A fonte é 100% esportiva — tudo é desejado.
update crawled_events
  set ignorado = false, ignorado_motivo = null
where source_id = (select id from crawler_sources where slug = 'ticketsports')
  and ignorado = true;
