-- Converte as observações existentes de Organizações, Locais e Eventos em uma
-- Nota no feed de atividades, datada na criação da entidade (fica como a nota
-- mais antiga). Idempotente: não recria uma Nota já existente com o mesmo texto
-- na mesma entidade, então pode ser rodada mais de uma vez sem duplicar.
--
-- Observação: o campo "Observações" continua nos formulários por enquanto — a
-- remoção será feita depois, sob comando, após validar que a conversão deu certo.

-- Locais não tinham data de criação; passa a ter. As linhas atuais recebem o
-- momento desta migração (melhor referência disponível para datar a nota) e os
-- novos locais passam a registrar a data de cadastro.
alter table crm_locals add column if not exists created_at timestamptz default now();

-- Autor atribuído às notas históricas. A leitura de atividades já é liberada a
-- todos os membros, então isto define apenas o "autor" exibido no feed.
-- Ajuste o e-mail abaixo se quiser atribuir a outra conta.

-- Organizações
insert into activities (org_id, author_id, tipo, data_hora, titulo, resumo, organization_id, realizada)
select o.org_id,
       coalesce(
         (select id from auth.users where email = 'diogo@blueticket.com.br' limit 1),
         (select id from auth.users order by created_at limit 1)
       ),
       'Nota', o.created_at, 'Nota', o.observacoes, o.id, true
from organizations o
where o.deleted_at is null
  and o.observacoes is not null and btrim(o.observacoes) <> ''
  and not exists (
    select 1 from activities a
    where a.organization_id = o.id and a.tipo = 'Nota' and a.resumo = o.observacoes
  );

-- Locais
insert into activities (org_id, author_id, tipo, data_hora, titulo, resumo, local_id, realizada)
select l.org_id,
       coalesce(
         (select id from auth.users where email = 'diogo@blueticket.com.br' limit 1),
         (select id from auth.users order by created_at limit 1)
       ),
       'Nota', l.created_at, 'Nota', l.observacoes, l.id, true
from crm_locals l
where l.deleted_at is null
  and l.observacoes is not null and btrim(l.observacoes) <> ''
  and not exists (
    select 1 from activities a
    where a.local_id = l.id and a.tipo = 'Nota' and a.resumo = l.observacoes
  );

-- Eventos
insert into activities (org_id, author_id, tipo, data_hora, titulo, resumo, crm_event_id, realizada)
select e.org_id,
       coalesce(
         (select id from auth.users where email = 'diogo@blueticket.com.br' limit 1),
         (select id from auth.users order by created_at limit 1)
       ),
       'Nota', e.created_at, 'Nota', e.observacoes, e.id, true
from crm_events e
where e.deleted_at is null
  and e.observacoes is not null and btrim(e.observacoes) <> ''
  and not exists (
    select 1 from activities a
    where a.crm_event_id = e.id and a.tipo = 'Nota' and a.resumo = e.observacoes
  );
