-- Oportunidades de prospecção deixam de exigir organização: uma oportunidade
-- pode se ligar a evento e/ou local, ou existir só com o título.
alter table opportunities alter column organization_id drop not null;
