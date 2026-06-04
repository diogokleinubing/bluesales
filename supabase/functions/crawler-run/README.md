# crawler-run — coleta do módulo Pesquisa

Orquestrador que coleta eventos das plataformas concorrentes e grava em
`crawled_events` (deduplicando por `url_evento`). Online e gratuitos são
descartados antes de inserir; regras de `crawler_ignore_rules` marcam
`ignorado=true`.

## Deploy

```bash
supabase functions deploy crawler-run
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas pelo runtime — não
precisam ser configuradas. Nenhum segredo vai para o git nem para o frontend.

## Agendamento semanal (pg_cron)

A migration `0056_pesquisa_cron.sql` cria o job `crawler-run-weekly`
(segunda, 06:00 UTC). Ele lê a URL e a chave do **Vault** em tempo de execução.
Cadastre os dois segredos **uma vez** (SQL editor do Supabase):

```sql
select vault.create_secret(
  'https://<PROJECT_REF>.supabase.co/functions/v1/crawler-run',
  'crawler_run_url');
select vault.create_secret('<SERVICE_ROLE_KEY>', 'crawler_service_key');
```

Disparo manual: botão **Executar agora** em Pesquisa → Configuração → Fontes
(usa o JWT do Gestor).

## ⚠️ Validação dos scrapers ANTES de confiar nos dados

Cada fonte tem o endpoint/seletores **isolados** no topo do seu arquivo em
`sources/`. Antes de usar os dados em produção, valide o retorno cru de 1 cidade
— **a partir do runtime da Edge Function**, não de máquina local:

- **Ingresse** (`ingresse.ts`) — API REST oficial pública. Mais estável.
  Confirmar nomes de parâmetros (`state`/`city`/`method`) e os caminhos
  `venue`, `sessions`, `prices`.
- **Sympla** (`sympla.ts`) — API JSON interna (não documentada). Confirmar a
  rota de busca e o shape dos campos de local/organizador/preço/data.
- **Guichê Web** / **Bilheteria Digital** (`*.ts`) — HTML server-side via
  cheerio. Confirmar a URL de listagem por cidade e os seletores dos cards.

> **Cloudflare:** todas as quatro estão atrás de Cloudflare. Pode ser
> necessário ajustar headers (`User-Agent`, `Accept-Language`) ou tratar
> challenge. Se uma fonte exigir browser real (JS), ela vira caso de **worker
> com Playwright** (fora do escopo destas Edge Functions) — como já mapeado
> para DiskIngressos e Q2.

Para inspecionar o cru, rode a função com um `console.log(JSON.stringify(...))`
temporário no scraper e veja em `supabase functions logs crawler-run`, ou peça
para o Diogo validar o payload campo a campo antes de mapear.

## Estrutura

```
crawler-run/
  index.ts                 orquestrador (auth, run/jobs, filtros, upsert)
  sources/
    ingresse.ts            edge_api  (API oficial)
    sympla.ts              edge_api  (API interna)
    guicheweb.ts           edge_html (cheerio)
    bilheteriadigital.ts   edge_html (cheerio)
../_shared/
  cors.ts  classify.ts  db.ts  types.ts
```

Adicionar uma nova fonte = 1 arquivo em `sources/` + 1 linha em
`crawler_sources` + registrar no mapa `SCRAPERS` do `index.ts`.
