// Helpers para sincronizar filtros de tela com a querystring (voltar/F5 mantêm
// os filtros). Leitura: readStr/readBool/readArr a partir de URLSearchParams.
// Escrita: buildSearchParams omite valores default/vazios (URL mais limpa).

export function readStr(p: URLSearchParams, k: string, def = ''): string {
  return p.get(k) ?? def
}

export function readBool(p: URLSearchParams, k: string, def = false): boolean {
  const v = p.get(k)
  return v == null ? def : v === '1'
}

/** Lê um array (CSV). Ausente -> `def` (distingue "não setado" de "vazio"). */
export function readArr(p: URLSearchParams, k: string, def: string[] = []): string[] {
  const v = p.get(k)
  if (v == null) return def
  return v.split(',').filter(Boolean)
}

type Field =
  | { k: string; v: string; def?: string }
  | { k: string; v: boolean; def?: boolean }
  | { k: string; v: string[]; always?: boolean }

/** Monta a querystring a partir dos campos, omitindo vazios/defaults.
 *  `always` (arrays): escreve mesmo vazio (p/ distinguir "limpo" de "default").
 *  `def` (boolean): escreve só quando difere do default. */
export function buildSearchParams(fields: Field[]): URLSearchParams {
  const p = new URLSearchParams()
  for (const f of fields) {
    const v = (f as { v: unknown }).v
    if (Array.isArray(v)) {
      if (v.length || (f as { always?: boolean }).always) p.set(f.k, v.join(','))
    } else if (typeof v === 'boolean') {
      const def = (f as { def?: boolean }).def ?? false
      if (v !== def) p.set(f.k, v ? '1' : '0')
    } else {
      const ff = f as { k: string; v: string; def?: string }
      if (ff.v !== '' && ff.v !== (ff.def ?? '')) p.set(ff.k, ff.v)
    }
  }
  return p
}
