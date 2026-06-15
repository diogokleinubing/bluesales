-- ============================================================================
-- BI: "cliente desde" por organizador — restringe ao universo do relatório.
--
-- A versão anterior retornava 1 linha por organização-com-ano em TODA a base
-- (milhares, vindas da importação Blueticket). O PostgREST corta a resposta da
-- RPC (~1000 linhas), então organizadores além do corte vinham sem "Desde".
--
-- Aqui devolvemos o ano APENAS para principais que aparecem nas vendas (mesmo
-- universo do bi_group → algumas centenas, sem risco de corte). Mantém a regra
-- de GRUPO: menor ano entre a principal e suas suborganizações.
-- ============================================================================

create or replace function bi_org_cliente_desde(p_org uuid)
returns table(key text, cliente_desde int)
language sql stable security definer set search_path = public
as $$
  with grupo as (
    -- menor cliente_desde por principal (principal + subs)
    select coalesce(o.parent_id, o.id) as principal_id,
           min(o.cliente_desde) as cliente_desde
    from organizations o
    where o.org_id = p_org and o.cliente_desde is not null
    group by 1
  ),
  vendas as (
    -- principais que realmente aparecem nas vendas (= linhas do relatório)
    select distinct coalesce(o.parent_id, o.id) as principal_id
    from sales_rollup r
    join events e on e.id = r.event_id
    join organizations o on o.id = e.organizador_org_id
    where r.org_id = p_org
  )
  select coalesce(pr.nome, 'Sem organizador') as key, g.cliente_desde
  from grupo g
  join vendas v on v.principal_id = g.principal_id
  join organizations pr on pr.id = g.principal_id;
$$;

grant execute on function bi_org_cliente_desde(uuid) to authenticated;
