-- bi_parcelamento ganha filtros opcionais p_organizador / p_uf, para a
-- expansão (drill-down) dos eventos dentro de um organizador ou estado.
-- Muda a assinatura -> drop necessário.
drop function if exists bi_parcelamento(uuid, int, text[], text, int[], int);

create or replace function bi_parcelamento(
  p_org uuid,
  p_year int,
  p_pdv text[],
  p_dim text,                  -- 'organizador' | 'uf' | 'evento'
  p_months int[] default null,
  p_limit int default null,
  p_organizador text default null,
  p_uf text default null
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
        else r.codigo_evento
      end as gk,
      e.nome as ev_nome,
      r.parcelas, r.qtd, r.gmv, r.v_juros
    from parcelamento_rollup r
    join events e on e.id = r.event_id
    left join organizations o on o.id = e.organizador_org_id
    left join organizations pr on pr.id = coalesce(o.parent_id, o.id)
    where r.org_id = p_org
      and r.y_venda = p_year
      and (p_pdv is null or array_length(p_pdv, 1) is null or r.tipo_pdv = any(p_pdv))
      and (p_months is null or array_length(p_months, 1) is null or r.m_venda = any(p_months))
      and (p_organizador is null or coalesce(pr.nome, 'Sem organizador') = p_organizador)
      and (p_uf is null or coalesce(nullif(e.uf, ''), 'Sem UF') = p_uf)
  )
  select
    case when p_dim = 'evento' then max(ev_nome) else gk end as nome,
    sum(greatest(parcelas, 1)::numeric * qtd) / nullif(sum(qtd), 0) as parcelas_media,
    coalesce(sum(v_juros), 0) as receita_juros,
    coalesce(sum(gmv), 0) as gmv
  from base
  group by gk
  having coalesce(sum(v_juros), 0) > 0
  order by coalesce(sum(gmv), 0) desc
  limit p_limit;
$$;

revoke execute on function bi_parcelamento(uuid, int, text[], text, int[], int, text, text) from public;
grant execute on function bi_parcelamento(uuid, int, text[], text, int[], int, text, text) to authenticated;
