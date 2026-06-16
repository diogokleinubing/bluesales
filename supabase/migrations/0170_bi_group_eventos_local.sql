-- bi_group: além de qtd (vendas) e somas, retorna a contagem de EVENTOS
-- distintos por grupo e, para a dimensão local, a cidade/UF do local.
-- Assinatura idêntica à 0118; muda o tipo de retorno (drop necessário).
drop function if exists bi_group(uuid, integer, text, text[], text, integer, integer[]);
create or replace function bi_group(
  p_org uuid, p_year int, p_datebase text, p_pdv text[], p_dim text,
  p_month_max int default null, p_months int[] default null
)
returns table(
  key text, qtd bigint, eventos bigint, gmv numeric, gmv_online numeric,
  receita_bt numeric, receita_liq numeric, mdr numeric, rebate numeric,
  cidade text, uf text
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
    count(distinct r.codigo_evento),
    coalesce(sum(r.gmv),0),
    coalesce(sum(r.gmv) filter (where r.tipo_pdv = 'E'),0),
    coalesce(sum(r.receita_bt),0),
    coalesce(sum(r.receita_liq),0), coalesce(sum(r.v_mdr),0), coalesce(sum(r.v_rebate),0),
    max(e.cidade), max(e.uf)
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

-- Recriação dropou os grants: bloqueia anon e libera autenticados (igual 0005).
revoke execute on function bi_group(uuid, int, text, text[], text, int, int[]) from anon, public;
grant execute on function bi_group(uuid, int, text, text[], text, int, int[]) to authenticated;
