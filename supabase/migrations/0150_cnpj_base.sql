-- NO-OP / placeholder de alinhamento de histórico.
-- A migration 0150 (base CNPJ) foi aplicada no banco remoto e depois a feature
-- de CNPJ/Sócios foi revertida no código (arquivo original removido). Este stub
-- existe apenas para que a versão 0150 conste localmente e o `supabase db push`
-- não bloqueie por "remote migration not found in local". Como a 0150 já está
-- aplicada no remoto, este conteúdo NUNCA é executado.
--
-- Se quiser limpar de vez: rode `supabase migration repair --status reverted 0150`
-- (marca a 0150 como revertida no histórico) e remova este arquivo.
select 1;
