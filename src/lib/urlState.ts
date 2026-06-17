// Helpers para sincronizar filtros de tela com a querystring (voltar/F5 mantêm
// os filtros). Leitura: readStr/readBool/readArr a partir de URLSearchParams.
// Escrita: buildSearchParams omite valores default/vazios (URL mais limpa).

export function readStr(p: URLSearchParams, k: string, def = ''): string {
  return p.get(k) ?? def
}

export function readBool(p: URLSearchParams, k: string): boolean {
  return p.get(k) === '1'
}

export function readArr(p: URLSearchParams, k: string): string[] {
  const v = p.get(k)
  return v ? v.split(',').filter(Boolean) : []
}

type Field =
  | { k: string; v: string; def?: string }
  | { k: string; v: boolean }
  | { k: string; v: string[] }

/** Monta a querystring a partir dos campos, omitindo vazios/defaults. */
export function buildSearchParams(fields: Field[]): URLSearchParams {
  const p = new URLSearchParams()
  for (const f of fields) {
    const v = (f as { v: unknown }).v
    if (Array.isArray(v)) {
      if (v.length) p.set(f.k, v.join(','))
    } else if (typeof v === 'boolean') {
      if (v) p.set(f.k, '1')
    } else {
      const ff = f as { k: string; v: string; def?: string }
      if (ff.v !== '' && ff.v !== (ff.def ?? '')) p.set(ff.k, ff.v)
    }
  }
  return p
}
