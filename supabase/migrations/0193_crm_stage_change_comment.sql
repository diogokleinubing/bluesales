-- Permite anexar uma observação (comentario) à mudança de estágio de uma
-- entidade, gravada no próprio registro de stage_history — como uma nota
-- vinculada àquela mudança de histórico.
--
-- Mecanismo: a RPC crm_change_stage() seta um GUC de sessão (transação-local) e
-- então atualiza a coluna de estágio; o trigger crm_stage_history() — que roda na
-- mesma transação — lê esse GUC e grava em stage_history.comentario. Outros
-- caminhos que mudam o estágio sem setar o GUC continuam gravando comentario nulo.

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
      from_stage_id, to_stage_id, user_id, comentario)
    values (NEW.org_id, crm_entity_type(TG_TABLE_NAME), NEW.id, v_ftype,
      old_stage, new_stage, auth.uid(),
      nullif(current_setting('app.stage_comentario', true), ''));
    insert into audit_log(org_id, entity_type, entity_id, user_id, action,
      field_name, old_value, new_value)
    values (NEW.org_id, crm_entity_type(TG_TABLE_NAME), NEW.id, auth.uid(),
      'stage_change', col, old_stage::text, new_stage::text);
  end if;
  return NEW;
end;
$$;

-- Muda o estágio de relacionamento (org/local/evento) ou o estágio da
-- oportunidade, registrando a observação no histórico. SECURITY INVOKER: respeita
-- as políticas de RLS de quem chama (o mesmo acesso já usado nos updates diretos).
create or replace function crm_change_stage(
  p_tipo text,
  p_id uuid,
  p_stage uuid,
  p_comentario text default null
) returns void
language plpgsql
as $$
begin
  perform set_config('app.stage_comentario', coalesce(p_comentario, ''), true);
  if p_tipo in ('org', 'organization') then
    update organizations set funil_stage_id = p_stage where id = p_id;
  elsif p_tipo = 'local' then
    update crm_locals set funil_stage_id = p_stage where id = p_id;
  elsif p_tipo = 'evento' then
    update crm_events set funil_stage_id = p_stage where id = p_id;
  elsif p_tipo = 'opportunity' then
    update opportunities set stage_id = p_stage where id = p_id;
  else
    raise exception 'crm_change_stage: tipo inválido %', p_tipo;
  end if;
end;
$$;

grant execute on function crm_change_stage(text, uuid, uuid, text) to authenticated;
