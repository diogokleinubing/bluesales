/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Org default (multi-tenant futuro). Opcional: se ausente, busca-se na 1ª query. */
  readonly VITE_DEFAULT_ORG_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
