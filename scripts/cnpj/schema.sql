-- ============================================================================
-- Base de CNPJs da Receita Federal (Dados Abertos CNPJ).
--   Tabelas globais de referência (sem org_id), carregadas pelo importador
--   scripts/cnpj/import.mjs via COPY (conexão direta ao Postgres).
--   Fonte oficial: https://arquivos.receitafederal.gov.br (espelho CDN:
--   https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/).
--   Leitura liberada para qualquer usuário autenticado; escrita só pelo
--   importador (conexão direta, fora do PostgREST).
-- ============================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Tabelas de domínio (código → descrição)
-- ---------------------------------------------------------------------------
create table if not exists cnpj_cnaes         (codigo text primary key, descricao text);
create table if not exists cnpj_motivos       (codigo text primary key, descricao text);
create table if not exists cnpj_municipios    (codigo text primary key, descricao text);
create table if not exists cnpj_naturezas     (codigo text primary key, descricao text);
create table if not exists cnpj_paises        (codigo text primary key, descricao text);
create table if not exists cnpj_qualificacoes (codigo text primary key, descricao text);

-- ---------------------------------------------------------------------------
-- Empresas (dados da matriz: razão social, natureza, capital)
-- ---------------------------------------------------------------------------
create table if not exists cnpj_empresas (
  cnpj_basico text primary key,            -- 8 primeiros dígitos do CNPJ
  razao_social text,
  natureza_juridica text,                  -- código → cnpj_naturezas
  qualificacao_responsavel text,           -- código → cnpj_qualificacoes
  capital_social numeric(18,2),
  porte text,                              -- 00 N/I, 01 ME, 03 EPP, 05 demais
  ente_federativo text
);

-- ---------------------------------------------------------------------------
-- Estabelecimentos (matriz e filiais: endereço, situação, CNAE, contato)
-- ---------------------------------------------------------------------------
create table if not exists cnpj_estabelecimentos (
  cnpj_basico text not null,
  cnpj_ordem text not null,                -- 4 dígitos (0001 = matriz)
  cnpj_dv text not null,                   -- 2 dígitos verificadores
  matriz_filial smallint,                  -- 1 matriz, 2 filial
  nome_fantasia text,
  situacao_cadastral smallint,             -- 1 nula, 2 ativa, 3 suspensa, 4 inapta, 8 baixada
  data_situacao date,
  motivo_situacao text,                    -- código → cnpj_motivos
  cidade_exterior text,
  pais text,                               -- código → cnpj_paises
  data_inicio date,
  cnae_principal text,                     -- código → cnpj_cnaes
  cnae_secundaria text,                    -- códigos separados por vírgula
  tipo_logradouro text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cep text,
  uf text,
  municipio text,                          -- código → cnpj_municipios
  ddd1 text, telefone1 text,
  ddd2 text, telefone2 text,
  ddd_fax text, fax text,
  email text,
  situacao_especial text,
  data_situacao_especial date,
  primary key (cnpj_basico, cnpj_ordem, cnpj_dv)
);

-- ---------------------------------------------------------------------------
-- Sócios
-- ---------------------------------------------------------------------------
create table if not exists cnpj_socios (
  id bigint generated always as identity primary key,
  cnpj_basico text not null,
  identificador smallint,                  -- 1 PJ, 2 PF, 3 estrangeiro
  nome_socio text,
  cpf_cnpj_socio text,                     -- PF vem mascarado: ***123456**
  qualificacao text,                       -- código → cnpj_qualificacoes
  data_entrada date,
  pais text,
  representante_cpf text,
  representante_nome text,
  representante_qualificacao text,
  faixa_etaria smallint                    -- 0 N/A, 1..9 (0-12 … 80+)
);

-- ---------------------------------------------------------------------------
-- Simples Nacional / MEI
-- ---------------------------------------------------------------------------
create table if not exists cnpj_simples (
  cnpj_basico text primary key,
  opcao_simples boolean,
  data_opcao_simples date,
  data_exclusao_simples date,
  opcao_mei boolean,
  data_opcao_mei date,
  data_exclusao_mei date
);

-- ---------------------------------------------------------------------------
-- Controle de importação (auditoria do importador)
-- ---------------------------------------------------------------------------
create table if not exists cnpj_import_meta (
  id bigint generated always as identity primary key,
  referencia text not null,                -- pasta mensal da Receita (ex.: 2026-05-10)
  arquivo text not null,                   -- ex.: Empresas0.zip
  linhas bigint not null,
  filtros text,                            -- ex.: uf=ES,RJ ativas
  importado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Índices de busca (o importador derruba e recria os secundários no full load)
-- ---------------------------------------------------------------------------
create index if not exists cnpj_empresas_razao_trgm
  on cnpj_empresas using gin (razao_social gin_trgm_ops);
create index if not exists cnpj_estab_fantasia_trgm
  on cnpj_estabelecimentos using gin (nome_fantasia gin_trgm_ops);
create index if not exists cnpj_estab_uf_mun
  on cnpj_estabelecimentos (uf, municipio);
create index if not exists cnpj_socios_basico
  on cnpj_socios (cnpj_basico);
create index if not exists cnpj_socios_nome_trgm
  on cnpj_socios using gin (nome_socio gin_trgm_ops);
create index if not exists cnpj_socios_cpf
  on cnpj_socios (cpf_cnpj_socio);

-- ---------------------------------------------------------------------------
-- RLS: leitura para autenticados; escrita apenas pela conexão direta.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'cnpj_cnaes','cnpj_motivos','cnpj_municipios','cnpj_naturezas','cnpj_paises',
    'cnpj_qualificacoes','cnpj_empresas','cnpj_estabelecimentos','cnpj_socios',
    'cnpj_simples','cnpj_import_meta'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select on %I to authenticated', t);
    execute format('drop policy if exists "cnpj leitura autenticado" on %I', t);
    execute format(
      'create policy "cnpj leitura autenticado" on %I for select to authenticated using (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: busca de empresas (por nome/CNPJ + filtros). Dois caminhos de plano:
--   - com busca textual: pré-seleciona cnpj_basico via índices trigram
--     (limitado a 5000 matches por ramo) e só então junta/filtra;
--   - sem busca: navegação por filtros ordenada pela PK.
-- Paginação por limit/offset; o front pede limit+1 para saber se há mais.
-- ---------------------------------------------------------------------------
create or replace function cnpj_busca_empresas(
  p_search text default null,
  p_uf text default null,
  p_municipio text default null,           -- nome (ilike) do município
  p_situacao smallint default null,
  p_so_matriz boolean default true,
  p_limit int default 50,
  p_offset int default 0
) returns table (
  cnpj_basico text,
  cnpj text,
  razao_social text,
  nome_fantasia text,
  matriz_filial smallint,
  situacao_cadastral smallint,
  uf text,
  municipio_nome text,
  cnae_principal text,
  cnae_descricao text,
  capital_social numeric,
  porte text,
  data_inicio date
) language plpgsql stable as $$
declare
  v_digits text := nullif(regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g'), '');
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if v_digits is not null and length(v_digits) >= 8 then
    -- Busca por CNPJ: casa o básico exato e, se vierem mais dígitos, o prefixo.
    return query
      select e.cnpj_basico, e.cnpj_basico || e.cnpj_ordem || e.cnpj_dv,
             emp.razao_social, e.nome_fantasia, e.matriz_filial, e.situacao_cadastral,
             e.uf, m.descricao, e.cnae_principal, c.descricao,
             emp.capital_social, emp.porte, e.data_inicio
      from cnpj_estabelecimentos e
      join cnpj_empresas emp on emp.cnpj_basico = e.cnpj_basico
      left join cnpj_municipios m on m.codigo = e.municipio
      left join cnpj_cnaes c on c.codigo = e.cnae_principal
      where e.cnpj_basico = left(v_digits, 8)
        and (e.cnpj_basico || e.cnpj_ordem || e.cnpj_dv) like v_digits || '%'
      order by e.cnpj_ordem
      limit p_limit offset p_offset;
  elsif v_search is not null then
    -- Busca textual: razão social OU nome fantasia (índices trigram).
    return query
      with alvo as (
        (select emp2.cnpj_basico from cnpj_empresas emp2
          where emp2.razao_social ilike '%' || v_search || '%' limit 5000)
        union
        (select e2.cnpj_basico from cnpj_estabelecimentos e2
          where e2.nome_fantasia ilike '%' || v_search || '%' limit 5000)
      )
      select e.cnpj_basico, e.cnpj_basico || e.cnpj_ordem || e.cnpj_dv,
             emp.razao_social, e.nome_fantasia, e.matriz_filial, e.situacao_cadastral,
             e.uf, m.descricao, e.cnae_principal, c.descricao,
             emp.capital_social, emp.porte, e.data_inicio
      from alvo a
      join cnpj_estabelecimentos e on e.cnpj_basico = a.cnpj_basico
      join cnpj_empresas emp on emp.cnpj_basico = e.cnpj_basico
      left join cnpj_municipios m on m.codigo = e.municipio
      left join cnpj_cnaes c on c.codigo = e.cnae_principal
      where (not p_so_matriz or e.matriz_filial = 1)
        and (p_uf is null or e.uf = p_uf)
        and (p_situacao is null or e.situacao_cadastral = p_situacao)
        and (p_municipio is null or m.descricao ilike '%' || p_municipio || '%')
      order by emp.razao_social
      limit p_limit offset p_offset;
  else
    -- Navegação sem busca: ordena pela PK (barato em bases grandes).
    return query
      select e.cnpj_basico, e.cnpj_basico || e.cnpj_ordem || e.cnpj_dv,
             emp.razao_social, e.nome_fantasia, e.matriz_filial, e.situacao_cadastral,
             e.uf, m.descricao, e.cnae_principal, c.descricao,
             emp.capital_social, emp.porte, e.data_inicio
      from cnpj_estabelecimentos e
      join cnpj_empresas emp on emp.cnpj_basico = e.cnpj_basico
      left join cnpj_municipios m on m.codigo = e.municipio
      left join cnpj_cnaes c on c.codigo = e.cnae_principal
      where (not p_so_matriz or e.matriz_filial = 1)
        and (p_uf is null or e.uf = p_uf)
        and (p_situacao is null or e.situacao_cadastral = p_situacao)
        and (p_municipio is null or m.descricao ilike '%' || p_municipio || '%')
      order by e.cnpj_basico, e.cnpj_ordem
      limit p_limit offset p_offset;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: detalhe completo de uma empresa (empresa + estabelecimentos + sócios
-- + Simples) em um único jsonb.
-- ---------------------------------------------------------------------------
create or replace function cnpj_empresa_detalhe(p_cnpj_basico text)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'empresa', (
      select to_jsonb(emp) || jsonb_build_object(
        'natureza_desc', n.descricao,
        'qualificacao_resp_desc', q.descricao
      )
      from cnpj_empresas emp
      left join cnpj_naturezas n on n.codigo = emp.natureza_juridica
      left join cnpj_qualificacoes q on q.codigo = emp.qualificacao_responsavel
      where emp.cnpj_basico = p_cnpj_basico
    ),
    'estabelecimentos', (
      select coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object(
        'cnpj', e.cnpj_basico || e.cnpj_ordem || e.cnpj_dv,
        'municipio_nome', m.descricao,
        'cnae_desc', c.descricao,
        'motivo_desc', mo.descricao
      ) order by e.matriz_filial, e.cnpj_ordem), '[]'::jsonb)
      from cnpj_estabelecimentos e
      left join cnpj_municipios m on m.codigo = e.municipio
      left join cnpj_cnaes c on c.codigo = e.cnae_principal
      left join cnpj_motivos mo on mo.codigo = e.motivo_situacao
      where e.cnpj_basico = p_cnpj_basico
    ),
    'socios', (
      select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object(
        'qualificacao_desc', q.descricao
      ) order by s.nome_socio), '[]'::jsonb)
      from cnpj_socios s
      left join cnpj_qualificacoes q on q.codigo = s.qualificacao
      where s.cnpj_basico = p_cnpj_basico
    ),
    'simples', (
      select to_jsonb(si) from cnpj_simples si where si.cnpj_basico = p_cnpj_basico
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- RPC: empresas de uma pessoa (busca em sócios por nome e/ou CPF).
--   O CPF nos dados abertos vem mascarado (***123456**); aceita o CPF
--   completo (usa os 6 dígitos do meio) ou exatamente esses 6 dígitos.
-- ---------------------------------------------------------------------------
create or replace function cnpj_empresas_da_pessoa(
  p_nome text default null,
  p_cpf text default null,
  p_limit int default 300
) returns table (
  nome_socio text,
  cpf_cnpj_socio text,
  identificador smallint,
  faixa_etaria smallint,
  cnpj_basico text,
  razao_social text,
  qualificacao text,
  qualificacao_desc text,
  data_entrada date,
  situacao_matriz smallint,
  uf text,
  municipio_nome text
) language plpgsql stable as $$
declare
  v_nome text := nullif(trim(coalesce(p_nome, '')), '');
  v_digits text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
  v_cpf_mask text := case
    when length(v_digits) = 11 then '***' || substr(v_digits, 4, 6) || '**'
    when length(v_digits) = 6 then '***' || v_digits || '**'
    else null
  end;
begin
  if v_nome is null and v_cpf_mask is null then
    return;
  end if;
  return query
    with alvo as (
      select s.id from cnpj_socios s
      where (v_nome is null or s.nome_socio ilike '%' || v_nome || '%')
        and (v_cpf_mask is null or s.cpf_cnpj_socio = v_cpf_mask)
      limit p_limit
    )
    select s.nome_socio, s.cpf_cnpj_socio, s.identificador, s.faixa_etaria,
           s.cnpj_basico, emp.razao_social, s.qualificacao, q.descricao,
           s.data_entrada, e.situacao_cadastral, e.uf, m.descricao
    from alvo a
    join cnpj_socios s on s.id = a.id
    left join cnpj_empresas emp on emp.cnpj_basico = s.cnpj_basico
    left join cnpj_qualificacoes q on q.codigo = s.qualificacao
    left join cnpj_estabelecimentos e
      on e.cnpj_basico = s.cnpj_basico and e.matriz_filial = 1
    left join cnpj_municipios m on m.codigo = e.municipio
    order by s.nome_socio, emp.razao_social;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: status da base (para o front mostrar referência/contagens sem count(*)
-- caro — usa as linhas registradas pelo importador).
-- ---------------------------------------------------------------------------
create or replace function cnpj_base_status()
returns jsonb language sql stable as $$
  select coalesce(jsonb_build_object(
    'referencia', (select max(referencia) from cnpj_import_meta),
    'importado_em', (select max(importado_em) from cnpj_import_meta),
    'filtros', (select filtros from cnpj_import_meta order by importado_em desc limit 1),
    'empresas', (select coalesce(sum(linhas), 0) from cnpj_import_meta
                  where referencia = (select max(referencia) from cnpj_import_meta)
                    and arquivo like 'Empresas%'),
    'estabelecimentos', (select coalesce(sum(linhas), 0) from cnpj_import_meta
                  where referencia = (select max(referencia) from cnpj_import_meta)
                    and arquivo like 'Estabelecimentos%'),
    'socios', (select coalesce(sum(linhas), 0) from cnpj_import_meta
                  where referencia = (select max(referencia) from cnpj_import_meta)
                    and arquivo like 'Socios%')
  ), '{}'::jsonb)
$$;

grant execute on function cnpj_busca_empresas to authenticated;
grant execute on function cnpj_empresa_detalhe to authenticated;
grant execute on function cnpj_empresas_da_pessoa to authenticated;
grant execute on function cnpj_base_status to authenticated;
