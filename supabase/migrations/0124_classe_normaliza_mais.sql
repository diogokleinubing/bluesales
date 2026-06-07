-- Normaliza a categoria comercial na importação: valores com "+" no início
-- (ex.: "+A") viram o formato do CRM ("A+"). Demais classes (A/B/C) seguem iguais.

create or replace function set_org_classificacao(p_org uuid, p_codes int[], p_classes text[])
returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  update organizations o
    set classificacao = nc.classe_norm, updated_at = now()
  from (
    select v.code,
      case when upper(btrim(v.classe)) like '+%'
           then substr(upper(btrim(v.classe)), 2) || '+'
           else upper(btrim(v.classe)) end as classe_norm
    from unnest(p_codes, p_classes) as v(code, classe)
  ) nc
  where o.org_id = p_org
    and o.blueticket_code = nc.code
    and nc.classe_norm in ('A+', 'A', 'B', 'C')
    and o.classificacao is distinct from nc.classe_norm;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function set_org_classificacao(uuid, int[], text[]) to authenticated;
