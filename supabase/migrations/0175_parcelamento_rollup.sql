-- Rollup de parcelamento (por evento × ano/mês × pdv × parcelas), para a aba
-- "Parcelamento com Juros". Evita varrer a tabela `sales` crua a cada consulta
-- (o que estava causando timeout/500). Mesmo padrão do payments_rollup.
create table if not exists parcelamento_rollup (
  org_id uuid not null,
  event_id uuid,
  codigo_evento text,
  y_venda int,
  m_venda int,
  tipo_pdv text,
  parcelas int,
  qtd bigint,
  gmv numeric,
  v_juros numeric
);
create index if not exists parcelamento_rollup_org_y_idx on parcelamento_rollup (org_id, y_venda);

alter table parcelamento_rollup enable row level security;
revoke all on parcelamento_rollup from anon, authenticated;

create or replace function refresh_parcelamento_rollup()
returns void
language plpgsql security definer set search_path = public
set statement_timeout = '600s'
as $$
begin
  truncate parcelamento_rollup;
  insert into parcelamento_rollup
  select
    s.org_id, s.event_id, s.codigo_evento,
    extract(year from (s.data_venda at time zone 'utc'))::int,
    extract(month from (s.data_venda at time zone 'utc'))::int,
    s.tipo_pdv,
    coalesce(s.parcelas, 0),
    count(*)::bigint, sum(s.gmv), sum(coalesce(s.valor_juros, 0))
  from sales s
  where s.event_id is not null
  group by s.org_id, s.event_id, s.codigo_evento,
    extract(year from (s.data_venda at time zone 'utc')),
    extract(month from (s.data_venda at time zone 'utc')),
    s.tipo_pdv, coalesce(s.parcelas, 0);
end;
$$;

grant execute on function refresh_parcelamento_rollup() to authenticated;
select refresh_parcelamento_rollup();

-- RPC: lê do rollup. GMV = total do grupo; média de parcelas considera TODAS as
-- vendas (à vista conta como 1); só mostra grupos com alguma receita de juros.
create or replace function bi_parcelamento(
  p_org uuid,
  p_year int,
  p_pdv text[],
  p_dim text,
  p_months int[] default null,
  p_limit int default null
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
