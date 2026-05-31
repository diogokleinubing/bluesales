-- ============================================================================
-- Eventos recorrentes ("famílias") — associar edições entre anos
-- ----------------------------------------------------------------------------
-- events.familia: chave da família (cache, recalculável), ex.:
--   "Prime Rock Brasil BH 2025" e "...2026" -> família "Prime Rock Brasil BH".
-- Híbrido: sugerida pelo nome (no client) e ajustável por override por evento.
-- ============================================================================

alter table events add column if not exists familia text;
create index if not exists events_org_familia_idx on events (org_id, familia);

create table if not exists event_family_override (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  codigo_evento text not null,
  familia text not null,
  unique (org_id, codigo_evento)
);

alter table event_family_override enable row level security;
drop policy if exists event_family_override_authenticated_all on event_family_override;
create policy event_family_override_authenticated_all
  on event_family_override for all to authenticated using (true) with check (true);

-- Grava a família de vários eventos de uma vez (update set-based).
create or replace function set_event_families(
  p_org uuid, p_codigos text[], p_familias text[]
)
returns int
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $$
declare
  n int;
begin
  update events e
  set familia = v.familia
  from unnest(p_codigos, p_familias) as v(codigo, familia)
  where e.org_id = p_org
    and e.codigo_evento = v.codigo
    and e.familia is distinct from v.familia;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- YTD por dimensão, agora também aceita 'familia'.
create or replace function bi_ytd_group(
  p_org uuid, p_target_year int, p_mstart int, p_mend int, p_datebase text,
  p_pdv text[], p_dim text
)
returns table(key text, is_target boolean, gmv numeric, receita_bt numeric,
  receita_liq numeric, mdr numeric, rebate numeric)
language sql stable security definer set search_path = public
as $$
  select
    case p_dim
      when 'segmento' then e.segmento
      when 'organizador' then e.organizador
      when 'local' then e.local
      when 'cidade' then e.cidade
      when 'uf' then e.uf
      when 'familia' then e.familia
      else r.codigo_evento
    end as key,
    (case when p_datebase='venda' then r.y_venda
          else extract(year from e.data_evento)::int end) = p_target_year as is_target,
    coalesce(sum(r.gmv),0), coalesce(sum(r.receita_bt),0), coalesce(sum(r.receita_liq),0),
    coalesce(sum(r.v_mdr),0), coalesce(sum(r.v_rebate),0)
  from sales_rollup r
  left join events e on e.id = r.event_id
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) in (p_target_year, p_target_year-1)
    and (case when p_datebase='venda' then r.m_venda
              else extract(month from e.data_evento)::int end) - 1
        between least(p_mstart,p_mend) and greatest(p_mstart,p_mend)
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  group by 1, 2;
$$;

-- ----------------------------------------------------------------------------
-- Correção: garantir bi_events (com p_year opcional) e bi_popular_venues, que
-- foram adicionadas ao 0004 após a aplicação original e podem estar ausentes.
-- ----------------------------------------------------------------------------
create or replace function bi_events(
  p_org uuid, p_year int, p_datebase text, p_pdv text[],
  p_search text default null, p_segmento text default null,
  p_organizador text default null, p_local text default null,
  p_cidade text default null, p_uf text default null, p_codigo text default null,
  p_order text default 'gmv', p_limit int default 100, p_offset int default 0
)
returns table(
  codigo_evento text, nome text, segmento text, organizador text, local text,
  cidade text, uf text, data_evento date, qtd bigint,
  gmv numeric, receita_bt numeric, receita_liq numeric, mdr numeric, rebate numeric,
  total_count bigint
)
language sql stable security definer set search_path = public
as $$
  with agg as (
    select
      r.codigo_evento,
      max(e.nome) as nome, max(e.segmento) as segmento, max(e.organizador) as organizador,
      max(e.local) as local, max(e.cidade) as cidade, max(e.uf) as uf,
      max(e.data_evento) as data_evento,
      sum(r.qtd) as qtd, sum(r.gmv) as gmv, sum(r.receita_bt) as receita_bt,
      sum(r.receita_liq) as receita_liq, sum(r.v_mdr) as mdr, sum(r.v_rebate) as rebate
    from sales_rollup r
    left join events e on e.id = r.event_id
    where r.org_id = p_org
      and (p_year is null or (case when p_datebase='venda' then r.y_venda
                else extract(year from e.data_evento)::int end) = p_year)
      and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
    group by r.codigo_evento
  ), filt as (
    select * from agg
    where (p_segmento is null or coalesce(segmento,'Sem segmento') = p_segmento)
      and (p_organizador is null or organizador = p_organizador)
      and (p_local is null or local = p_local)
      and (p_cidade is null or cidade = p_cidade)
      and (p_uf is null or uf = p_uf)
      and (p_codigo is null or codigo_evento = p_codigo)
      and (p_search is null or p_search = '' or
           (coalesce(nome,'') || ' ' || codigo_evento || ' ' ||
            coalesce(organizador,'') || ' ' || coalesce(local,'')) ilike '%'||p_search||'%')
  )
  select codigo_evento, nome, segmento, organizador, local, cidade, uf, data_evento,
    qtd, gmv, receita_bt, receita_liq, mdr, rebate,
    count(*) over() as total_count
  from filt
  order by
    case p_order when 'receita_bt' then receita_bt when 'receita_liq' then receita_liq
                 when 'mdr' then mdr when 'rebate' then rebate else gmv end desc
  limit p_limit offset p_offset;
$$;

create or replace function bi_popular_venues(
  p_org uuid, p_search text default null, p_limit int default 200
)
returns table(local text, eventos bigint)
language sql stable security definer set search_path = public
as $$
  select e.local, count(distinct r.codigo_evento) as eventos
  from sales_rollup r
  join events e on e.id = r.event_id
  where r.org_id = p_org
    and e.local is not null and e.local <> ''
    and (p_search is null or p_search = '' or e.local ilike '%'||p_search||'%')
  group by e.local
  order by eventos desc
  limit p_limit;
$$;

revoke execute on function
  set_event_families(uuid, text[], text[]),
  bi_events(uuid, int, text, text[], text, text, text, text, text, text, text, text, int, int),
  bi_popular_venues(uuid, text, int)
from anon, public;
grant execute on function
  set_event_families(uuid, text[], text[]),
  bi_events(uuid, int, text, text[], text, text, text, text, text, text, text, text, int, int),
  bi_popular_venues(uuid, text, int)
to authenticated;
