import { defineConfig } from 'vite'
import path from 'node:path'
import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Há mudanças locais ainda não publicadas? (working tree sujo OU commits à
 * frente do origin/main). Calculado no build/serve. Na Vercel o checkout é
 * limpo e do commit publicado -> false (mostra a versão "limpa" do servidor).
 */
function hasLocalChanges(): boolean {
  // Em builds de produção/CI (Vercel) é sempre a versão publicada — nunca "-dev".
  if (process.env.VERCEL || process.env.CI) return false
  try {
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim().length > 0
    if (dirty) return true
    const ahead = execSync('git rev-list --count origin/main..HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim()
    return ahead !== '' && ahead !== '0'
  } catch {
    return false
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_LOCAL_CHANGES__: JSON.stringify(hasLocalChanges()),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Falha em vez de pular para outra porta se a 5173 estiver ocupada,
    // assim o dev server abre sempre no mesmo endereço.
    strictPort: true,
  },
})
