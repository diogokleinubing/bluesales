// Incrementa o minor da versão exibida no app (1.0 -> 1.1 -> 1.2 ...).
// Rodar antes de cada deploy para produção: `npm run version:bump`.
import { readFileSync, writeFileSync } from 'node:fs'

const file = new URL('../src/lib/version.ts', import.meta.url)
const txt = readFileSync(file, 'utf8')
const m = txt.match(/APP_VERSION = '(\d+)\.(\d+)'/)
if (!m) {
  console.error('Não encontrei APP_VERSION em src/lib/version.ts')
  process.exit(1)
}
const next = `${m[1]}.${Number(m[2]) + 1}`
writeFileSync(file, txt.replace(/APP_VERSION = '[^']*'/, `APP_VERSION = '${next}'`))
console.log(`Versão atualizada: ${m[1]}.${m[2]} -> ${next}`)
