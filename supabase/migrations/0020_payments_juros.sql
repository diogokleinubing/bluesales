-- ============================================================================
-- Meios de pagamento: filtro de juros (Todos / Com juros / Sem juros)
-- ----------------------------------------------------------------------------
-- payments_rollup passa a ter a dimensão com_juros (a venda teve valor_juros>0).
-- bi_payments_group ganha o parâmetro p_juros: 'all' | 'com' | 'sem'.
-- ============================================================================

alter table payments_rollup add column if not exists com_juros boolean;

-- Refresh reconstrói agrupando também por com_juros (coluna ao final).
create or replace function refresh_payments_rollup()
returns void
language plpgsql security definer set search_path = public
set statement_timeout = '600s'
as $$
begin
  truncate payments_rollup;
  insert into payments_rollup
  select
    s.org_id,
    extract(year from (s.data_venda at time zone 'utc'))::int,
    s.tipo_pdv,
    coalesce(s.forma_pagamento,'NA'), coalesce(s.operadora,'NA'),
    coalesce(s.parcelas,0),
    count(*)::bigint, sum(s.gmv), sum(s.receita_bt), sum(s.receita_liq),
    sum(s.mdr), sum(s.rebate),
    (coalesce(s.valor_juros,0) > 0)
  from sales s
  group by s.org_id,
    extract(year from (s.data_venda at time zone 'utc')),
    s.tipo_pdv, coalesce(s.forma_pagamento,'NA'),
    coalesce(s.operadora,'NA'), coalesce(s.parcelas,0),
    (coalesce(s.valor_juros,0) > 0);
end;
$$;

-- Substitui a assinatura antiga (4 args) pela nova (5 args com p_juros).
drop function if exists bi_payments_group(uuid, int, text[], text);

create or replace function bi_payments_group(
  p_org uuid, p_year int, p_pdv text[], p_dim text,
  p_juros text default 'all'
)
returns table(
  key text, qtd bigint, gmv numeric, receita_bt numeric,
  receita_liq numeric, mdr numeric, rebate numeric
)
language sql stable security definer set search_path = public
as $$
  select
    case p_dim
      when 'forma' then forma_pagamento
      when 'operadora' then operadora
      else parcelas::text
    end as key,
    coalesce(sum(qtd),0), coalesce(sum(gmv),0), coalesce(sum(receita_bt),0),
    coalesce(sum(receita_liq),0), coalesce(sum(v_mdr),0), coalesce(sum(v_rebate),0)
  from payments_rollup
  where org_id = p_org
    and y_venda = p_year
    and (p_pdv is null or array_length(p_pdv,1) is null or tipo_pdv = any(p_pdv))
    and (
      p_juros is null or p_juros = 'all'
      or (p_juros = 'com' and com_juros is true)
      or (p_juros = 'sem' and com_juros is not true)
    )
  group by 1;
$$;

revoke execute on function
  bi_payments_group(uuid, int, text[], text, text)
from anon, public;
grant execute on function
  bi_payments_group(uuid, int, text[], text, text)
to authenticated;

-- Reconstrói o rollup já com a coluna com_juros preenchida.
select refresh_payments_rollup();
