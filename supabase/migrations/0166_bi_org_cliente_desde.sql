-- ============================================================================
-- BI: ano "cliente desde" por organizador, para a coluna "Desde" de
-- /bi/analises/organizadores.
--
-- Regra de GRUPO: o ano é o MENOR (mais antigo) entre a organização principal
-- e todas as suas suborganizações — ou seja, desde quando QUALQUER empresa do
-- grupo virou cliente da Blueticket.
--
-- Chaveado por coalesce(pr.nome, 'Sem organizador') — exatamente a mesma chave
-- da dimensão "organizador" do bi_group (que já agrupa sub -> principal pelo
-- parent_id). Assim o match com a listagem é exato.
-- ============================================================================

create or replace function bi_org_cliente_desde(p_org uuid)
returns table(key text, cliente_desde int)
language sql stable security definer set search_path = public
as $$
  select
    coalesce(pr.nome, 'Sem organizador') as key,
    min(o.cliente_desde) as cliente_desde
  from organizations o
  join organizations pr on pr.id = coalesce(o.parent_id, o.id)
  where o.org_id = p_org
    and o.cliente_desde is not null
  group by 1;
$$;

grant execute on function bi_org_cliente_desde(uuid) to authenticated;
