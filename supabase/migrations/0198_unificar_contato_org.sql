-- Unifica o vínculo contato↔organização em person_entities (a tela do contato
-- usava a tabela legada org_persons; a aba Contatos da org já usa person_entities).

-- 1) Sincroniza os vínculos de org_persons que ainda não estão em person_entities
--    (idempotente — o 0182 fez o backfill inicial; isto pega os criados depois).
insert into person_entities (org_id, person_id, entity_type, entity_id, papel, ativo, data_inicio)
select org_id, person_id, 'organization', organization_id, papel, coalesce(ativo, true), data_inicio
from org_persons
where coalesce(ativo, true) = true
on conflict do nothing;

-- 2) View de leitura: vínculos de organização (person_entities) já com o nome da
--    org, para as telas (contato e lista) sem precisar de join manual. Escrita
--    continua direto em person_entities.
create or replace view person_organizations_v as
select pe.id, pe.org_id, pe.person_id, pe.entity_id as organization_id,
       pe.papel, pe.ativo, pe.data_inicio, o.nome as organization_nome
from person_entities pe
join organizations o on o.id = pe.entity_id
where pe.entity_type = 'organization' and pe.ativo is not false;

alter view person_organizations_v set (security_invoker = on);
grant select on person_organizations_v to authenticated;
