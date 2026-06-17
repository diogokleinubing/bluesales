-- Parcelamento com juros: agrega as vendas COM juros (valor_juros > 0) por
-- organizador (principal), UF do evento ou evento, com a média de parcelas,
-- a receita de juros e o GMV. Junta sales -> events -> organizations.
create or replace function bi_parcelamento(
  p_org uuid,
  p_year int,
  p_pdv text[],
  p_dim text,                  -- 'organizador' | 'uf' | 'evento'
  p_months int[] default null,
  p_limit int default null     -- evento: 100; demais: null (todos)
)
returns table(
  nome text,
  parcelas_media numeric,
  receita_juros numeric,
  gmv numeric
)
language sql stable security definer set search_path = public
as $$
  with base as (
    select
      case p_dim
        when 'organizador' then coalesce(pr.nome, 'Sem organizador')
        when 'uf' then coalesce(nullif(e.uf, ''), 'Sem UF')
        else s.codigo_evento
      end as gk,
      e.nome as ev_nome,
      s.parcelas, s.valor_juros, s.gmv
    from sales s
    join events e on e.id = s.event_id
    left join organizations o on o.id = e.organizador_org_id
    left join organizations pr on pr.id = coalesce(o.parent_id, o.id)
    where s.org_id = p_org
      and extract(year from s.data_venda at time zone 'utc')::int = p_year
      and coalesce(s.valor_juros, 0) > 0
      and (p_pdv is null or array_length(p_pdv, 1) is null or s.tipo_pdv = any(p_pdv))
      and (p_months is null or array_length(p_months, 1) is null or
           extract(month from s.data_venda at time zone 'utc')::int = any(p_months))
  )
  select
    case when p_dim = 'evento' then max(ev_nome) else gk end as nome,
    avg(nullif(parcelas, 0)::numeric) as parcelas_media,
    coalesce(sum(valor_juros), 0) as receita_juros,
    coalesce(sum(gmv), 0) as gmv
  from base
  group by gk
  order by coalesce(sum(gmv), 0) desc
  limit p_limit;
$$;

revoke execute on function bi_parcelamento(uuid, int, text[], text, int[], int) from public;
grant execute on function bi_parcelamento(uuid, int, text[], text, int[], int) to authenticated;
