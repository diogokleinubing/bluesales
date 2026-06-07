-- ============================================================================
-- BI: a dimensão "organizador" passa a agrupar pela ORGANIZAÇÃO PRINCIPAL.
-- Resolve events.organizador_org_id -> organizations o -> principal pr
--   (pr = coalesce(o.parent_id, o.id)); rótulo = pr.nome (ou "Sem organizador").
-- A "chave" continua sendo o NOME (string), então o front (drill-down por nome)
-- não muda. Sub-organizações somam sob o nome da principal.
-- Redefinições mantêm assinaturas idênticas (grants preservados).
-- ============================================================================

-- ---------- bi_group ----------
create or replace function bi_group(
  p_org uuid, p_year int, p_datebase text, p_pdv text[], p_dim text,
  p_month_max int default null, p_months int[] default null
)
returns table(
  key text, qtd bigint, gmv numeric, gmv_online numeric,
  receita_bt numeric, receita_liq numeric, mdr numeric, rebate numeric
)
language sql stable security definer set search_path = public
as $$
  select
    case p_dim
      when 'segmento' then e.segmento when 'genero' then e.genero
      when 'organizador' then coalesce(pr.nome, 'Sem organizador') when 'local' then e.local
      when 'cidade' then e.cidade when 'uf' then e.uf
      when 'evento' then r.codigo_evento
    end as key,
    coalesce(sum(r.qtd),0),
    coalesce(sum(r.gmv),0),
    coalesce(sum(r.gmv) filter (where r.tipo_pdv = 'E'),0),
    coalesce(sum(r.receita_bt),0),
    coalesce(sum(r.receita_liq),0), coalesce(sum(r.v_mdr),0), coalesce(sum(r.v_rebate),0)
  from sales_rollup r
  left join events e on e.id = r.event_id
  left join organizations o on o.id = e.organizador_org_id
  left join organizations pr on pr.id = coalesce(o.parent_id, o.id)
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) = p_year
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
    and (p_month_max is null or
         (case when p_datebase='venda' then r.m_venda
               else extract(month from e.data_evento)::int end) <= p_month_max)
    and (p_months is null or array_length(p_months,1) is null or
         (case when p_datebase='venda' then r.m_venda
               else extract(month from e.data_evento)::int end) = any(p_months))
  group by 1;
$$;

-- ---------- bi_monthly_by_group ----------
create or replace function bi_monthly_by_group(
  p_org uuid, p_year int, p_datebase text, p_pdv text[], p_dim text, p_keys text[],
  p_months int[] default null
)
returns table(month int, key text, gmv numeric, receita_bt numeric,
  receita_liq numeric, mdr numeric, rebate numeric)
language sql stable security definer set search_path = public
as $$
  select
    (case when p_datebase='venda' then r.m_venda
          else extract(month from e.data_evento)::int end) - 1 as month,
    case p_dim
      when 'segmento' then e.segmento when 'genero' then e.genero
      when 'organizador' then coalesce(pr.nome, 'Sem organizador')
      when 'local' then e.local when 'cidade' then e.cidade
      when 'uf' then e.uf else r.codigo_evento end as key,
    coalesce(sum(r.gmv),0), coalesce(sum(r.receita_bt),0), coalesce(sum(r.receita_liq),0),
    coalesce(sum(r.v_mdr),0), coalesce(sum(r.v_rebate),0)
  from sales_rollup r
  left join events e on e.id = r.event_id
  left join organizations o on o.id = e.organizador_org_id
  left join organizations pr on pr.id = coalesce(o.parent_id, o.id)
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) = p_year
    and (case when p_datebase='venda' then r.m_venda
              else extract(month from e.data_evento)::int end) is not null
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
    and (p_months is null or array_length(p_months,1) is null or
         (case when p_datebase='venda' then r.m_venda
               else extract(month from e.data_evento)::int end) = any(p_months))
    and (case p_dim
      when 'segmento' then e.segmento when 'genero' then e.genero
      when 'organizador' then coalesce(pr.nome, 'Sem organizador')
      when 'local' then e.local when 'cidade' then e.cidade
      when 'uf' then e.uf else r.codigo_evento end) = any(p_keys)
  group by 1, 2;
$$;

-- ---------- bi_ytd_group ----------
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
      when 'organizador' then coalesce(pr.nome, 'Sem organizador')
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
  left join organizations o on o.id = e.organizador_org_id
  left join organizations pr on pr.id = coalesce(o.parent_id, o.id)
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) in (p_target_year, p_target_year-1)
    and (case when p_datebase='venda' then r.m_venda
              else extract(month from e.data_evento)::int end) - 1
        between least(p_mstart,p_mend) and greatest(p_mstart,p_mend)
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  group by 1, 2;
$$;

-- ---------- bi_events ----------
create or replace function bi_events(
  p_org uuid, p_year int, p_datebase text, p_pdv text[],
  p_search text default null, p_segmento text default null,
  p_organizador text default null, p_local text default null,
  p_cidade text default null, p_uf text default null, p_codigo text default null,
  p_order text default 'gmv', p_limit int default 100, p_offset int default 0,
  p_genero text default null, p_months int[] default null
)
returns table(
  codigo_evento text, nome text, segmento text, genero text, familia text,
  organizador text, local text, cidade text, uf text, data_evento date,
  qtd bigint, gmv numeric, gmv_online numeric, receita_bt numeric,
  receita_liq numeric, mdr numeric, rebate numeric, total_count bigint
)
language sql stable security definer set search_path = public
as $$
  with agg as (
    select
      r.codigo_evento,
      max(e.nome) as nome, max(e.segmento) as segmento, max(e.genero) as genero,
      max(e.familia) as familia, max(coalesce(pr.nome, 'Sem organizador')) as organizador,
      max(e.local) as local, max(e.cidade) as cidade, max(e.uf) as uf,
      max(e.data_evento) as data_evento,
      sum(r.qtd) as qtd, sum(r.gmv) as gmv,
      sum(r.gmv) filter (where r.tipo_pdv = 'E') as gmv_online,
      sum(r.receita_bt) as receita_bt,
      sum(r.receita_liq) as receita_liq, sum(r.v_mdr) as mdr, sum(r.v_rebate) as rebate
    from sales_rollup r
    left join events e on e.id = r.event_id
    left join organizations o on o.id = e.organizador_org_id
    left join organizations pr on pr.id = coalesce(o.parent_id, o.id)
    where r.org_id = p_org
      and (p_year is null or (case when p_datebase='venda' then r.y_venda
                else extract(year from e.data_evento)::int end) = p_year)
      and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
      and (p_months is null or array_length(p_months,1) is null or
           (case when p_datebase='venda' then r.m_venda
                 else extract(month from e.data_evento)::int end) = any(p_months))
    group by r.codigo_evento
  ), filt as (
    select * from agg
    where (p_segmento is null or coalesce(segmento,'Sem segmento') = p_segmento)
      and (p_genero is null or coalesce(genero,'Sem gênero') = p_genero)
      and (p_organizador is null or organizador = p_organizador)
      and (p_local is null or local = p_local)
      and (p_cidade is null or cidade = p_cidade)
      and (p_uf is null or uf = p_uf)
      and (p_codigo is null or codigo_evento = p_codigo)
      and (p_search is null or p_search = '' or
           (coalesce(nome,'') || ' ' || codigo_evento || ' ' ||
            coalesce(organizador,'') || ' ' || coalesce(local,'')) ilike '%'||p_search||'%')
  )
  select codigo_evento, nome, segmento, genero, familia, organizador, local,
    cidade, uf, data_evento, qtd, gmv, coalesce(gmv_online,0), receita_bt,
    receita_liq, mdr, rebate, count(*) over() as total_count
  from filt
  order by
    case p_order when 'receita_bt' then receita_bt when 'receita_liq' then receita_liq
                 when 'mdr' then mdr when 'rebate' then rebate else gmv end desc
  limit p_limit offset p_offset;
$$;

-- ---------- bi_prov_stats ----------
create or replace function bi_prov_stats(
  p_org uuid, p_base_year int, p_target_year int, p_datebase text, p_pdv text[]
)
returns table(organizador text, gmv_base numeric, ytd numeric, base_ytg numeric)
language sql stable security definer set search_path = public
as $$
  with cutoff as (
    select coalesce(max(
      case when p_datebase='venda' then r.m_venda
           else extract(month from e.data_evento)::int end), 0) as m
    from sales_rollup r
    left join events e on e.id = r.event_id
    where r.org_id = p_org
      and (case when p_datebase='venda' then r.y_venda
                else extract(year from e.data_evento)::int end) = p_target_year
      and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  )
  select
    coalesce(pr.nome, 'Sem organizador') as organizador,
    coalesce(sum(r.gmv) filter (where
      (case when p_datebase='venda' then r.y_venda
            else extract(year from e.data_evento)::int end) = p_base_year), 0) as gmv_base,
    coalesce(sum(r.gmv) filter (where
      (case when p_datebase='venda' then r.y_venda
            else extract(year from e.data_evento)::int end) = p_target_year), 0) as ytd,
    coalesce(sum(r.gmv) filter (where
      (case when p_datebase='venda' then r.y_venda
            else extract(year from e.data_evento)::int end) = p_base_year
      and (case when p_datebase='venda' then r.m_venda
                else extract(month from e.data_evento)::int end) > (select m from cutoff)), 0) as base_ytg
  from sales_rollup r
  left join events e on e.id = r.event_id
  left join organizations o on o.id = e.organizador_org_id
  left join organizations pr on pr.id = coalesce(o.parent_id, o.id)
  where r.org_id = p_org
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) in (p_base_year, p_target_year)
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  group by 1
  having coalesce(sum(r.gmv),0) <> 0;
$$;

-- ---------- bi_prov_org_events ----------
create or replace function bi_prov_org_events(
  p_org uuid, p_organizador text, p_year int,
  p_month_min int, p_month_max int, p_datebase text, p_pdv text[]
)
returns table(codigo_evento text, nome text, data_evento date, gmv numeric)
language sql stable security definer set search_path = public
as $$
  select
    e.codigo_evento,
    e.nome,
    e.data_evento,
    sum(r.gmv) as gmv
  from sales_rollup r
  join events e on e.id = r.event_id
  left join organizations o on o.id = e.organizador_org_id
  left join organizations pr on pr.id = coalesce(o.parent_id, o.id)
  where r.org_id = p_org
    and coalesce(pr.nome, 'Sem organizador') = p_organizador
    and (case when p_datebase='venda' then r.y_venda
              else extract(year from e.data_evento)::int end) = p_year
    and (case when p_datebase='venda' then r.m_venda
              else extract(month from e.data_evento)::int end) between p_month_min and p_month_max
    and (p_pdv is null or array_length(p_pdv,1) is null or r.tipo_pdv = any(p_pdv))
  group by e.codigo_evento, e.nome, e.data_evento
  having sum(r.gmv) <> 0
  order by sum(r.gmv) desc;
$$;

-- ---------- Provisionamento: remapeia item_key (nome -> nome da principal) ----
-- Best-effort: casa o item_key (nome salvo) com uma organização e move o forecast
-- para o NOME DA PRINCIPAL. Se já houver linha na chave da principal, soma e
-- remove a antiga. Especiais ("__OUTROS__", "novo_%") são preservados.
-- Rodar DEPOIS de importar as organizações.
create or replace function migrate_provisioning_to_principal(p_org uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer := 0; rec record;
begin
  for rec in
    select pv.id, pv.base_year, pv.target_year, pv.item_key, pv.forecast, pr.nome as principal_nome
    from provisioning pv
    join organizations o on o.org_id = p_org and lower(o.nome) = lower(pv.item_key)
    join organizations pr on pr.id = coalesce(o.parent_id, o.id)
    where pv.org_id = p_org
      and pv.item_key <> '__OUTROS__'
      and pv.item_key not like 'novo_%'
      and pr.nome is distinct from pv.item_key
  loop
    if exists (
      select 1 from provisioning x
      where x.org_id = p_org and x.base_year = rec.base_year
        and x.target_year = rec.target_year and x.item_key = rec.principal_nome
    ) then
      update provisioning x
        set forecast = coalesce(x.forecast,0) + coalesce(rec.forecast,0), updated_at = now()
        where x.org_id = p_org and x.base_year = rec.base_year
          and x.target_year = rec.target_year and x.item_key = rec.principal_nome;
      delete from provisioning where id = rec.id;
    else
      update provisioning
        set item_key = rec.principal_nome, nome = rec.principal_nome, updated_at = now()
        where id = rec.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function migrate_provisioning_to_principal(uuid) to authenticated;
