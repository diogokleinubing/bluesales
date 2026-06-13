#!/usr/bin/env node
// ============================================================================
// Visualizador web da base de CNPJs (busca e navegação).
//
// Servidor local standalone: serve viewer.html e uma API JSON que chama as
// funções SQL criadas pelo schema.sql (cnpj_busca_empresas,
// cnpj_empresa_detalhe, cnpj_empresas_da_pessoa, cnpj_base_status).
// Não depende de nenhum app nem de login — só da connection string do Postgres.
//
// Uso:
//   node serve.mjs --db "postgresql://..." [--port 8799] [--no-ssl]
//   (ou env CNPJ_DB_URL / SUPABASE_DB_URL / DATABASE_URL)
//
// Depois abra http://localhost:8799
// ============================================================================

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const HERE = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const args = {
    db: process.env.CNPJ_DB_URL || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || null,
    port: 8799,
    host: '127.0.0.1',
    ssl: true,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--db') args.db = argv[++i]
    else if (a === '--port') args.port = Number(argv[++i])
    else if (a === '--host') args.host = argv[++i]
    else if (a === '--no-ssl') args.ssl = false
    else { console.error(`Argumento desconhecido: ${a}`); process.exit(1) }
  }
  return args
}

const args = parseArgs(process.argv)
if (!args.db) {
  console.error(
    'Falta a connection string do Postgres.\n' +
    'Passe --db "postgresql://..." ou defina CNPJ_DB_URL / SUPABASE_DB_URL.\n' +
    'No Supabase: Dashboard → Connect → Session pooler (porta 5432).',
  )
  process.exit(1)
}

// Datas (`date`) saem como string "AAAA-MM-DD" no JSON, não como Date JS.
pg.types.setTypeParser(1082, (v) => v)

const pool = new pg.Pool({
  connectionString: args.db,
  ssl: args.ssl ? { rejectUnauthorized: false } : false,
  max: 4,
})

const PAGE_SIZE = 50

// ---------------------------------------------------------------------------
// Rotas da API (todas via funções SQL — a lógica de busca mora na migration)
// ---------------------------------------------------------------------------
async function apiEmpresas(q) {
  const page = Math.max(0, Number(q.get('page') || 0))
  const { rows } = await pool.query(
    'select * from cnpj_busca_empresas($1, $2, $3, $4, $5, $6, $7)',
    [
      q.get('q') || null,
      q.get('uf') || null,
      q.get('municipio') || null,
      q.get('situacao') ? Number(q.get('situacao')) : null,
      q.get('matriz') !== '0',
      PAGE_SIZE + 1,
      page * PAGE_SIZE,
    ],
  )
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE }
}

async function apiEmpresa(basico) {
  const { rows } = await pool.query('select cnpj_empresa_detalhe($1) as d', [basico])
  return rows[0]?.d ?? {}
}

async function apiPessoas(q) {
  const { rows } = await pool.query(
    'select * from cnpj_empresas_da_pessoa($1, $2, $3)',
    [q.get('nome') || null, q.get('cpf') || null, 300],
  )
  return rows
}

async function apiStatus() {
  const { rows } = await pool.query('select cnpj_base_status() as s')
  return rows[0]?.s ?? {}
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const send = (code, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(code, { 'content-type': type })
    res.end(type.startsWith('application/json') ? JSON.stringify(body) : body)
  }
  try {
    if (url.pathname === '/') {
      // Lê a cada request: permite editar o HTML sem reiniciar o servidor.
      return send(200, readFileSync(path.join(HERE, 'viewer.html')), 'text/html; charset=utf-8')
    }
    if (url.pathname === '/api/status') return send(200, await apiStatus())
    if (url.pathname === '/api/empresas') return send(200, await apiEmpresas(url.searchParams))
    if (url.pathname === '/api/pessoas') return send(200, await apiPessoas(url.searchParams))
    const m = url.pathname.match(/^\/api\/empresa\/(\d{8})$/)
    if (m) return send(200, await apiEmpresa(m[1]))
    return send(404, { error: 'rota não encontrada' })
  } catch (e) {
    console.error(`${req.method} ${url.pathname}:`, e.message)
    return send(500, { error: e.message })
  }
})

server.listen(args.port, args.host, () => {
  console.log(`Base CNPJ no ar: http://${args.host === '0.0.0.0' ? 'localhost' : args.host}:${args.port}`)
})
