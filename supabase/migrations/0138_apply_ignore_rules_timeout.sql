-- ============================================================================
-- apply_ignore_rules: estende o statement_timeout da função (mesmo padrão de
-- detect_event_artists). Aplicar as regras aos ~26k eventos já capturados
-- estourava o statement_timeout curto do PostgREST (RPC autenticado).
-- A semântica de match permanece idêntica.
-- ============================================================================

create or replace function apply_ignore_rules()
returns integer
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '180s'
as $$
declare
  afetados integer;
begin
  with norm_events as (
    select
      e.id,
      e.org_id,
      regexp_replace(unaccent(lower(coalesce(e.nome, ''))), '[-_[:space:]]+', ' ', 'g') as nome_n,
      regexp_replace(unaccent(lower(coalesce(e.local_raw, ''))), '[-_[:space:]]+', ' ', 'g') as local_n,
      regexp_replace(unaccent(lower(coalesce(e.organizador_raw, ''))), '[-_[:space:]]+', ' ', 'g') as org_n
    from crawled_events e
    where coalesce(e.ignorado, false) = false
      and e.promovido_crm_event_id is null
  ),
  rules as (
    select
      cir.org_id,
      cir.tipo,
      cir.keyword as kw_orig,
      '\y' || regexp_replace(
        regexp_replace(unaccent(lower(cir.keyword)), '[-_[:space:]]+', ' ', 'g'),
        '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'
      ) || '\y' as kw_re
    from crawler_ignore_rules cir
    where cir.ativo = true and trim(cir.keyword) <> ''
  ),
  matches as (
    select distinct on (ne.id)
      ne.id,
      case r.tipo when 'nome_evento' then 'nome' when 'local' then 'local' else 'organizador' end as campo,
      r.kw_orig
    from norm_events ne
    join rules r on r.org_id = ne.org_id
    where (r.tipo = 'nome_evento' and ne.nome_n ~ r.kw_re)
       or (r.tipo = 'local' and ne.local_n ~ r.kw_re)
       or (r.tipo = 'organizador' and ne.org_n ~ r.kw_re)
    order by ne.id
  )
  update crawled_events e
    set ignorado = true,
        ignorado_motivo = m.campo || ' contém "' || m.kw_orig || '"'
  from matches m
  where e.id = m.id;

  get diagnostics afetados = row_count;
  return afetados;
end;
$$;

grant execute on function apply_ignore_rules() to authenticated;
