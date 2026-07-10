-- ============================================================================
-- CRM — unificação de entidades duplicadas (organização, local, evento).
-- Re-aponta TODOS os vínculos do duplicado para o sobrevivente e faz
-- soft-delete do duplicado. A escolha de campos escalares é feita no client
-- (update normal) ANTES de chamar esta função.
--
-- Segurança: SECURITY DEFINER (precisa mexer em várias tabelas sob RLS), com
-- guarda explícita is_member(). Roda tudo numa transação (é uma função plpgsql).
-- ============================================================================

create or replace function crm_merge_entity(p_tipo text, p_survivor uuid, p_duplicate uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
  v_poly_audit text;  -- entity_type em audit_log / stage_history
  v_poly_user text;   -- entity_type em person_entities / entity_objections
  r record;
begin
  if not is_member() then raise exception 'forbidden'; end if;
  if p_survivor is null or p_duplicate is null or p_survivor = p_duplicate then
    raise exception 'sobrevivente e duplicado devem ser diferentes e não nulos';
  end if;

  if p_tipo = 'organization' then
    v_table := 'organizations'; v_poly_audit := 'organization'; v_poly_user := 'organization';
  elsif p_tipo = 'local' then
    v_table := 'crm_locals'; v_poly_audit := 'local'; v_poly_user := 'local';
  elsif p_tipo = 'evento' then
    v_table := 'crm_events'; v_poly_audit := 'crm_event'; v_poly_user := 'evento';
  else
    raise exception 'tipo inválido: %', p_tipo;
  end if;

  -- 1) Junções com unicidade composta: remove do duplicado o que já existe no
  --    sobrevivente, senão o re-apontamento (passo 2) viola o unique.
  if p_tipo = 'organization' then
    delete from org_segments s where s.organization_id = p_duplicate
      and exists (select 1 from org_segments s2 where s2.organization_id = p_survivor and s2.segment_id = s.segment_id);
    delete from organization_locals ol where ol.organization_id = p_duplicate
      and exists (select 1 from organization_locals o2 where o2.organization_id = p_survivor and o2.local_id = ol.local_id);
  elsif p_tipo = 'local' then
    delete from organization_locals ol where ol.local_id = p_duplicate
      and exists (select 1 from organization_locals o2 where o2.local_id = p_survivor and o2.organization_id = ol.organization_id);
  elsif p_tipo = 'evento' then
    delete from crm_event_artists a where a.crm_event_id = p_duplicate
      and exists (select 1 from crm_event_artists a2 where a2.crm_event_id = p_survivor and a2.artist_id = a.artist_id);
  end if;

  -- 2) Re-aponta todas as FKs reais (coluna única) que referenciam a tabela.
  for r in
    select (con.conrelid::regclass)::text as child_table, att.attname as child_col
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = v_table::regclass
      and array_length(con.conkey, 1) = 1
  loop
    execute format('update %I set %I = $1 where %I = $2', r.child_table, r.child_col, r.child_col)
      using p_survivor, p_duplicate;
  end loop;

  -- Organização é auto-referente (parent_id): impede o sobrevivente virar pai de si.
  if p_tipo = 'organization' then
    update organizations set parent_id = null where id = p_survivor and parent_id = p_survivor;
  end if;

  -- 3) Tabelas polimórficas (entity_type + entity_id).
  --    person_entities tem unique parcial (entity_type, entity_id, person_id): dedup antes.
  delete from person_entities pe
    where pe.entity_type = v_poly_user and pe.entity_id = p_duplicate
      and exists (select 1 from person_entities p2
                  where p2.entity_type = v_poly_user and p2.entity_id = p_survivor and p2.person_id = pe.person_id);
  update person_entities   set entity_id = p_survivor where entity_type = v_poly_user  and entity_id = p_duplicate;
  update entity_objections set entity_id = p_survivor where entity_type = v_poly_user  and entity_id = p_duplicate;
  update audit_log         set entity_id = p_survivor where entity_type = v_poly_audit and entity_id = p_duplicate;
  update stage_history     set entity_id = p_survivor where entity_type = v_poly_audit and entity_id = p_duplicate;

  -- 4) Soft-delete do duplicado (recuperável em Comercial → Logs).
  execute format('update %I set deleted_at = now() where id = $1', v_table) using p_duplicate;
end;
$$;

grant execute on function crm_merge_entity(text, uuid, uuid) to authenticated;
