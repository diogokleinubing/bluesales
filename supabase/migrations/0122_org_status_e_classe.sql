-- ============================================================================
-- Ajuste de estratégia das organizações importadas:
--   (1) tira-as do estágio "Inativo" do funil (funil_stage_id = null);
--   (2) status_comercial = 'Ativo' para quem teve venda no BI de 2024 em diante;
--   (3) RPC para atualizar a classe (classificacao) a partir de categoria_comercial.
-- RPCs são reutilizáveis (chamadas também pela importação).
-- ============================================================================

-- (2) Marca Ativo quem teve venda >= p_min_year. Só toca quem está SEM status
--     (não sobrescreve status definido manualmente). Aditivo.
create or replace function mark_orgs_active_by_sales(p_org uuid, p_min_year int)
returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  update organizations org
    set status_comercial = 'Ativo', updated_at = now()
  where org.org_id = p_org
    and org.blueticket_code is not null
    and org.status_comercial is null
    and exists (
      select 1 from events e
      join sales_rollup r on r.event_id = e.id
      where e.org_id = p_org
        and e.codigo_organizador = org.blueticket_code
        and r.y_venda >= p_min_year
    );
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function mark_orgs_active_by_sales(uuid, int) to authenticated;

-- (3) Atualiza classificacao a partir de pares (codigo, classe). Só aceita as
--     classes válidas; ignora valores fora do conjunto (não quebra a constraint).
create or replace function set_org_classificacao(p_org uuid, p_codes int[], p_classes text[])
returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  update organizations o
    set classificacao = upper(btrim(v.classe)), updated_at = now()
  from unnest(p_codes, p_classes) as v(code, classe)
  where o.org_id = p_org
    and o.blueticket_code = v.code
    and upper(btrim(v.classe)) in ('A+', 'A', 'B', 'C')
    and o.classificacao is distinct from upper(btrim(v.classe));
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function set_org_classificacao(uuid, int[], text[]) to authenticated;

-- (1) Ajuste pontual: tira as importadas do estágio (Inativo -> sem estágio).
update organizations
  set funil_stage_id = null, updated_at = now()
  where blueticket_code is not null and funil_stage_id is not null;

-- (2) Ajuste pontual: marca Ativo por venda 2024+ em todos os tenants.
do $$
declare r record;
begin
  for r in select distinct org_id from organizations where blueticket_code is not null loop
    perform mark_orgs_active_by_sales(r.org_id, 2024);
  end loop;
end $$;
