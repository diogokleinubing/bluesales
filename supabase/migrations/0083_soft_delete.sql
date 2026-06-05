-- ============================================================================
-- Soft delete nas entidades do Comercial. Exclusão passa a marcar deleted_at;
-- as listagens filtram deleted_at is null. Mantém o dado (e o nome no log).
-- ============================================================================
alter table organizations add column if not exists deleted_at timestamptz;
alter table persons        add column if not exists deleted_at timestamptz;
alter table opportunities  add column if not exists deleted_at timestamptz;
alter table crm_events     add column if not exists deleted_at timestamptz;
alter table crm_locals     add column if not exists deleted_at timestamptz;
alter table artists        add column if not exists deleted_at timestamptz;
alter table activities     add column if not exists deleted_at timestamptz;
alter table tasks          add column if not exists deleted_at timestamptz;

-- Índices parciais para as listagens (org + não removidos).
create index if not exists organizations_alive_idx on organizations (org_id) where deleted_at is null;
create index if not exists persons_alive_idx        on persons (org_id)        where deleted_at is null;
create index if not exists opportunities_alive_idx  on opportunities (org_id)   where deleted_at is null;
create index if not exists crm_events_alive_idx      on crm_events (org_id)      where deleted_at is null;
create index if not exists crm_locals_alive_idx      on crm_locals (org_id)      where deleted_at is null;
create index if not exists artists_alive_idx         on artists (org_id)         where deleted_at is null;
create index if not exists activities_alive_idx      on activities (org_id)      where deleted_at is null;
create index if not exists tasks_alive_idx           on tasks (org_id)           where deleted_at is null;

-- A auditoria passa a aceitar a ação 'restore' (desfazer remoção).
alter table audit_log drop constraint if exists audit_log_action_check;
alter table audit_log add constraint audit_log_action_check
  check (action in ('create','update','delete','restore','stage_change','link','unlink'));

-- Soft delete/restore vira ação 'delete'/'restore' no log (não edição de deleted_at).
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
    -- Mudança de deleted_at = remoção (soft delete) ou restauração.
    if (oldj ->> 'deleted_at') is distinct from (newj ->> 'deleted_at') then
      insert into audit_log(org_id, entity_type, entity_id, user_id, action)
      values (NEW.org_id, v_etype, NEW.id, auth.uid(),
        case when newj ->> 'deleted_at' is not null then 'delete' else 'restore' end);
      return NEW;
    end if;
    for k in select jsonb_object_keys(newj) loop
      if k in ('updated_at', 'created_at', 'deleted_at') then continue; end if;
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
