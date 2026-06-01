-- ============================================================================
-- Meios de pagamento: colunas em sales + rollup proprio + RPCs
-- ----------------------------------------------------------------------------
-- forma_pagamento canonica: CC (Credito), PIX, CD (Debito), BB (Boleto).
-- ============================================================================

alter table sales add column if not exists forma_pagamento text;
alter table sales add column if not exists parcelas int;
alter table sales add column if not exists operadora text;

-- Rollup proprio (cardinalidade alta nao cabe no sales_rollup principal).
drop table if exists payments_rollup cascade;
create table payments_rollup as
select
  s.org_id,
  extract(year from (s.data_venda at time zone 'utc'))::int as y_venda,
  s.tipo_pdv,
  coalesce(s.forma_pagamento, 'NA')                 as forma_pagamento,
  coalesce(s.operadora, 'NA')                       as operadora,
  coalesce(s.parcelas, 0)                           as parcelas,
  count(*)::bigint                                  as qtd,
  sum(s.gmv)                                        as gmv,
  sum(s.receita_bt)                                 as receita_bt,
  sum(s.receita_liq)                                as receita_liq,
  sum(s.mdr)                                        as v_mdr,
  sum(s.rebate)                                     as v_rebate
from sales s
group by s.org_id,
  extract(year from (s.data_venda at time zone 'utc')),
  s.tipo_pdv, coalesce(s.forma_pagamento,'NA'),
  coalesce(s.operadora,'NA'), coalesce(s.parcelas,0);

create index payments_rollup_org_y_idx on payments_rollup (org_id, y_venda);

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
    sum(s.mdr), sum(s.rebate)
  from sales s
  group by s.org_id,
    extract(year from (s.data_venda at time zone 'utc')),
    s.tipo_pdv, coalesce(s.forma_pagamento,'NA'),
    coalesce(s.operadora,'NA'), coalesce(s.parcelas,0);
end;
$$;

-- Anos disponiveis nos pagamentos.
create or replace function bi_payment_years(p_org uuid)
returns setof int
language sql stable security definer set search_path = public
as $$
  select distinct y_venda from payments_rollup
  where org_id = p_org and y_venda is not null
  order by y_venda desc;
$$;

-- Agregacao por dimensao: 'forma' | 'operadora' | 'parcelas'.
create or replace function bi_payments_group(
  p_org uuid, p_year int, p_pdv text[], p_dim text
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
  group by 1;
$$;

revoke execute on function
  refresh_payments_rollup(),
  bi_payment_years(uuid),
  bi_payments_group(uuid, int, text[], text)
from anon, public;
grant execute on function
  refresh_payments_rollup(),
  bi_payment_years(uuid),
  bi_payments_group(uuid, int, text[], text)
to authenticated;
