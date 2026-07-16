// Versão do app exibida no rodapé do menu. Incrementada a cada deploy para
// produção via `npm run version:bump` (scripts/bump-version.mjs).
export const APP_VERSION = '1.44'

// Injetado pelo Vite (vite.config.ts): true quando o build local tem mudanças
// ainda não publicadas (working tree sujo ou commits à frente do origin/main).
declare const __APP_LOCAL_CHANGES__: boolean
const LOCAL_CHANGES =
  typeof __APP_LOCAL_CHANGES__ !== 'undefined' && __APP_LOCAL_CHANGES__

/** Próximo minor (1.22 -> 1.23), usado para sinalizar a build local "à frente". */
function nextMinor(v: string): string {
  const m = v.match(/^(\d+)\.(\d+)$/)
  return m ? `${m[1]}.${Number(m[2]) + 1}` : v
}

/**
 * Versão exibida no rodapé. Em produção (checkout limpo do commit publicado) é
 * a própria APP_VERSION. Localmente, assim que há qualquer mudança não
 * publicada, mostra o próximo minor com sufixo "-dev" — deixando claro que o
 * local está diferente do servidor.
 */
export const DISPLAY_VERSION = LOCAL_CHANGES
  ? `${nextMinor(APP_VERSION)}-dev`
  : APP_VERSION
