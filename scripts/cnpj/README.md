# Base de CNPJs da Receita Federal — importador + visualizador standalone

Ferramenta **independente** (não faz parte do app bluesales) para importar o
cadastro público de CNPJs — empresas, estabelecimentos, sócios e Simples/MEI —
para um Postgres e navegar nos dados por uma página web local.

Tudo vive nesta pasta (`scripts/cnpj/`):

| Arquivo | O quê |
| --- | --- |
| `import.mjs` | Importador: baixa os ZIPs da Receita e carrega no Postgres via `COPY`. |
| `schema.sql` | Tabelas `cnpj_*`, índices e funções SQL de busca (aplicado com `--schema`). |
| `serve.mjs` | Servidor web local: serve `viewer.html` + API JSON sobre as funções SQL. |
| `viewer.html` | Front-end (busca, detalhe, pessoas) — HTML/JS puro, sem dependências. |

## Fonte dos dados

A Receita publica mensalmente os CSVs zipados em
<https://arquivos.receitafederal.gov.br> (repositório SERPRO+, link
"Dados Abertos CNPJ"). O importador baixa por padrão do espelho CDN da Casa
dos Dados, que replica os mesmos arquivos com download muito mais rápido:
<https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/>.

Cada pasta mensal (ex.: `2026-05-10/`) contém:

| Arquivo | Conteúdo | Tamanho aproximado |
| --- | --- | --- |
| `Empresas0..9.zip` | Razão social, natureza jurídica, capital, porte | ~600 MB |
| `Estabelecimentos0..9.zip` | Endereço, situação, CNAE, contatos (matriz/filiais) | ~5 GB |
| `Socios0..9.zip` | Quadro societário (CPF mascarado `***123456**`) | ~1 GB |
| `Simples.zip` | Opção Simples Nacional / MEI | ~0,3 GB |
| `Cnaes/Motivos/Municipios/Naturezas/Paises/Qualificacoes.zip` | Tabelas de domínio | KB |

CSVs em **latin1**, separados por `;`, campos entre aspas, **sem cabeçalho**.
A base completa tem ≈ 65 milhões de estabelecimentos — dezenas de GB no banco.
A Receita particiona os arquivos por hash (0–9), **não por UF**, então o
download é sempre o conjunto completo (~7 GB de ZIPs); o filtro `--uf` só reduz
o que entra no banco.

## Pré-requisitos

1. **Node** e, nesta pasta, `npm install` (instala `pg` e `pg-copy-streams`).
2. **`unzip`** no PATH (padrão no macOS/Linux).
3. **Connection string** de um Postgres com permissão de escrita (via `--db`
   ou env `CNPJ_DB_URL` / `SUPABASE_DB_URL` / `DATABASE_URL`).

### Postgres local via Docker (recomendado para uso standalone)

```bash
docker volume create cnpj-pgdata
docker run -d --name cnpj-local \
  -e POSTGRES_PASSWORD=cnpj -e POSTGRES_DB=cnpj \
  -v cnpj-pgdata:/var/lib/postgresql/data -p 55432:5432 postgres:16
# papel exigido pelo schema.sql (grants de leitura):
docker exec cnpj-local psql -U postgres -d cnpj -c "create role authenticated nologin"
```

Connection string: `postgresql://postgres:cnpj@localhost:55432/cnpj`
(ligar/desligar sem perder dados: `docker start/stop cnpj-local`).

## Importar

```bash
cd scripts/cnpj
npm install

# 1ª vez: aplica o schema (schema.sql) e importa Sul + Sudeste, só ativas:
node import.mjs --db "postgresql://postgres:cnpj@localhost:55432/cnpj" --no-ssl \
  --schema --uf PR,SC,RS,SP,RJ,MG,ES --ativas

# Só um estado:
node import.mjs --db "postgresql://..." --no-ssl --uf ES --ativas

# Brasil inteiro (horas de carga, dezenas de GB):
node import.mjs --db "postgresql://..." --no-ssl

# Teste rápido (10k linhas por arquivo):
node import.mjs --db "postgresql://..." --no-ssl --uf ES --max-rows 10000

# Reimportar só um bloco (ordem: lookups → estabelecimentos → empresas →
# socios → simples). Reusa os ZIPs já baixados em data/.
node import.mjs --db "postgresql://..." --no-ssl --uf ES --only socios
```

Outras opções: `--ref 2026-05-10` (pasta mensal específica), `--data-dir`
(onde guardar os ZIPs; padrão `data/`), `--mirror <url>`, `--no-ssl`
(Postgres local). `--help` mostra tudo.

### Como funciona

1. Descobre a pasta mensal mais recente no espelho (ou usa `--ref`).
2. Baixa os ZIPs (pula os já baixados com mesmo tamanho).
3. Para cada tabela: `TRUNCATE`, derruba índices secundários, descompacta em
   streaming (`unzip -p`) e injeta via `COPY` (sem arquivo intermediário),
   recria os índices e roda `ANALYZE`.
4. Com filtro de UF/ativas, os estabelecimentos entram primeiro e definem o
   conjunto de `cnpj_basico` (um bitset de 12,5 MB, escala para o país todo);
   empresas/sócios/Simples importam só esses CNPJs.
5. Cada arquivo carregado é registrado em `cnpj_import_meta`.

A importação é um *full refresh*: rodar de novo substitui os dados. Os ZIPs
baixados ficam em `data/` (no `.gitignore` desta pasta).

## Navegar (visualizador web)

```bash
cd scripts/cnpj
node serve.mjs --db "postgresql://postgres:cnpj@localhost:55432/cnpj" --no-ssl
# abre http://localhost:8799
```

Servidor local que serve `viewer.html` e uma API JSON sobre as funções SQL.
Três telas:

- **Empresas** — busca por razão social/fantasia/CNPJ com filtros de UF,
  município, situação e "só matriz", paginada.
- **Detalhe** — dados da empresa, Simples/MEI, endereço/contato, quadro de
  sócios (com link "Empresas desta pessoa") e estabelecimentos.
- **Pessoas & sócios** — busca por nome e/ou CPF, agrupada por pessoa, com as
  empresas em que ela participa. Aceita deep-link:
  `http://localhost:8799/#/pessoas?nome=fulano&cpf=123456`.

Opções: `--port 8799`, `--host 127.0.0.1` (use `--host 0.0.0.0` para expor na
rede — **não há autenticação**, cuidado), `--no-ssl` (Postgres local).
O CPF nos dados abertos vem mascarado (`***123456**`); a busca por pessoa usa
os 6 dígitos do meio (que não são únicos — combine com o nome para precisão).
