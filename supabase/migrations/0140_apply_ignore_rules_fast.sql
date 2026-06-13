-- ============================================================================
-- apply_ignore_rules (rápido): itera por regra. Para regras de NOME usa o
-- índice trigram (nome_norm gin_trgm_ops) via prefiltro LIKE + regex de borda
-- (mesma técnica do detect_event_artists) — poucos candidatos por regra em vez
-- de cruzar 26k eventos × 39 regras. Local/organizador (poucas regras) seguem
-- normalizando inline. Normalização unificada via pesquisa_norm.
-- ============================================================================

create or replace function apply_ignore_rules()
returns integer
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '180s'
as $$
declare
  r record;
  n integer;
  afetados integer := 0;
  kw_n text;
  kw_re text;
  kw_like text;
begin
  for r in
    select org_id, tipo, keyword
    from crawler_ignore_rules
    where ativo = true and trim(keyword) <> ''
  loop
    kw_n := pesquisa_norm(r.keyword);
    if length(kw_n) = 0 then continue; end if;
    kw_re := '[[:<:]]' || regexp_replace(kw_n, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '[[:>:]]';
    kw_like := '%' || replace(replace(replace(kw_n, '\', '\\'), '%', '\%'), '_', '\_') || '%';

    if r.tipo = 'nome_evento' then
      update crawled_events e
        set ignorado = true, ignorado_motivo = 'nome contém "' || r.keyword || '"'
      where e.org_id = r.org_id
        and coalesce(e.ignorado, false) = false
        and e.promovido_crm_event_id is null
        and e.nome_norm is not null
        and e.nome_norm like kw_like
        and e.nome_norm ~ kw_re;
    elsif r.tipo = 'local' then
      update crawled_events e
        set ignorado = true, ignorado_motivo = 'local contém "' || r.keyword || '"'
      where e.org_id = r.org_id
        and coalesce(e.ignorado, false) = false
        and e.promovido_crm_event_id is null
        and e.local_raw is not null
        and pesquisa_norm(e.local_raw) ~ kw_re;
    else -- organizador
      update crawled_events e
        set ignorado = true, ignorado_motivo = 'organizador contém "' || r.keyword || '"'
      where e.org_id = r.org_id
        and coalesce(e.ignorado, false) = false
        and e.promovido_crm_event_id is null
        and e.organizador_raw is not null
        and pesquisa_norm(e.organizador_raw) ~ kw_re;
    end if;

    get diagnostics n = row_count;
    afetados := afetados + n;
  end loop;
  return afetados;
end;
$$;

grant execute on function apply_ignore_rules() to authenticated;
