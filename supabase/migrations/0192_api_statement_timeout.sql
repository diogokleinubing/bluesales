-- O statement_timeout definido DENTRO da função (0191) não estende o tempo do
-- comando externo que a API (PostgREST) roda ao chamar a função: o timer do
-- statement_timeout é armado no início do comando, com o valor do ROLE, e a
-- cláusula SET da função não re-arma esse timer. Por isso a chamada continuava
-- caindo em ~8s (o padrão do role `authenticated` na Supabase).
--
-- Forma efetiva (recomendada pela Supabase) de elevar o timeout das queries da
-- API de dados: ajustar no próprio role. Vale para TODAS as queries autenticadas
-- da API — é um paliativo para PARAR o erro 500. O ganho de performance de fato,
-- se a query seguir lenta, virá de pré-agregar os locais numa materialized view.
alter role authenticated set statement_timeout = '30s';

-- Recarrega a configuração do PostgREST.
notify pgrst, 'reload config';
