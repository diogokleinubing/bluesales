-- ============================================================================
-- CRM Fase 1 — auditoria (audit_log + stage_history) e triggers
-- ============================================================================

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  org_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  user_id uuid references auth.users(id),
  action text not null check (action in ('create','update','delete','stage_change','link','unlink')),
  field_name text,
  old_value text,
  new_value text,
  created_at timestamptz default now()
);
create index if not exists audit_log_entity_idx on audit_log (entity_type, entity_id);
create index if not exists audit_log_org_idx on audit_log (org_id, created_at desc);

create table if not exists stage_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  funnel_type_id uuid references funnel_types(id),
  from_stage_id uuid references funnel_stages(id),
  to_stage_id uuid not null references funnel_stages(id),
  user_id uuid references auth.users(id),
  comentario text,
  created_at timestamptz default now()
);
create index if not exists stage_history_entity_idx on stage_history (entity_type, entity_id);

-- Mapeia nome de tabela -> entity_type singular usado nas tabelas de auditoria.
create or replace function crm_entity_type(p_table text)
returns text language sql immutable as $$
  select case p_table
    when 'organizations' then 'organization'
    when 'persons' then 'person'
    when 'opportunities' then 'opportunity'
    when 'crm_events' then 'crm_event'
    when 'tasks' then 'task'
    else p_table end;
$$;

-- Auditoria genérica: 1 log por campo alterado no UPDATE; 1 no create/delete.
create or replace function crm_audit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_etype text := crm_entity_type(TG_TABLE_NAME);
  oldj jsonb;
  newj jsonb;
  k text;
  ov text;
  nv text;
begin
  if TG_OP = 'DELETE' then
    insert into audit_log(org_id, entity_type, entity_id, user_id, action)
    values (OLD.org_id, v_etype, OLD.id, auth.uid(), 'delete');
    return OLD;
  elsif TG_OP = 'INSERT' then
    insert into audit_log(org_id, entity_type, entity_id, user_id, action)
    values (NEW.org_id, v_etype, NEW.id, auth.uid(), 'create');
    return NEW;
  else
    oldj := to_jsonb(OLD);
    newj := to_jsonb(NEW);
    for k in select jsonb_object_keys(newj) loop
      if k in ('updated_at', 'created_at') then continue; end if;
      ov := oldj ->> k;
      nv := newj ->> k;
      if ov is distinct from nv then
        insert into audit_log(org_id, entity_type, entity_id, user_id, action,
          field_name, old_value, new_value)
        values (NEW.org_id, v_etype, NEW.id, auth.uid(), 'update', k, ov, nv);
      end if;
    end loop;
    return NEW;
  end if;
end;
$$;

-- Histórico de estágio: registra mudança da coluna de estágio (TG_ARGV[0]).
create or replace function crm_stage_history()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  col text := TG_ARGV[0];
  old_stage uuid := (to_jsonb(OLD) ->> col)::uuid;
  new_stage uuid := (to_jsonb(NEW) ->> col)::uuid;
  v_ftype uuid;
begin
  if new_stage is distinct from old_stage and new_stage is not null then
    select funnel_type_id into v_ftype from funnel_stages where id = new_stage;
    insert into stage_history(org_id, entity_type, entity_id, funnel_type_id,
      from_stage_id, to_stage_id, user_id)
    values (NEW.org_id, crm_entity_type(TG_TABLE_NAME), NEW.id, v_ftype,
      old_stage, new_stage, auth.uid());
    insert into audit_log(org_id, entity_type, entity_id, user_id, action,
      field_name, old_value, new_value)
    values (NEW.org_id, crm_entity_type(TG_TABLE_NAME), NEW.id, auth.uid(),
      'stage_change', col, old_stage::text, new_stage::text);
  end if;
  return NEW;
end;
$$;

-- Triggers de auditoria.
drop trigger if exists trg_audit on organizations;
create trigger trg_audit after insert or update or delete on organizations
  for each row execute function crm_audit();
drop trigger if exists trg_stage on organizations;
create trigger trg_stage after update on organizations
  for each row execute function crm_stage_history('funil_stage_id');

drop trigger if exists trg_audit on persons;
create trigger trg_audit after insert or update or delete on persons
  for each row execute function crm_audit();
drop trigger if exists trg_stage on persons;
create trigger trg_stage after update on persons
  for each row execute function crm_stage_history('funil_stage_id');

drop trigger if exists trg_audit on opportunities;
create trigger trg_audit after insert or update or delete on opportunities
  for each row execute function crm_audit();
drop trigger if exists trg_stage on opportunities;
create trigger trg_stage after update on opportunities
  for each row execute function crm_stage_history('stage_id');

drop trigger if exists trg_audit on crm_events;
create trigger trg_audit after insert or update or delete on crm_events
  for each row execute function crm_audit();

drop trigger if exists trg_audit on tasks;
create trigger trg_audit after insert or update or delete on tasks
  for each row execute function crm_audit();
