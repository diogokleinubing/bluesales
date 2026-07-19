// Template "Newsletter de Produto": definição das seções (consumidas pelo editor)
// e o renderizador para HTML email-safe (tabelas + CSS inline, fontes web-safe).
// As matérias (Destaque / Novidades / Como usar) entram como resumo + link
// "Saiba mais" -> /conteudo/<codigo> (conteúdo completo na landing pública).

export interface ConteudoRef {
  codigo: string
  titulo: string
  resumo: string | null
  cover_url: string | null
}

export interface NewsletterProdutoData {
  edicao: string
  mensagemInicial: string
  destaque: ConteudoRef | null
  novidades: ConteudoRef[]
  comoUsar: ConteudoRef[]
  mensagemFinal: string
}

export interface RenderContext {
  baseUrl: string
  unsubscribeUrl?: string
}

/** Seções do template (dirige o editor por seções na mensagem). */
export const NEWSLETTER_SECOES = [
  { key: 'mensagem_inicial', label: 'Mensagem inicial', tipo: 'texto' as const },
  { key: 'destaque', label: 'Destaque do mês', tipo: 'materia_unica' as const, secao: 'destaque' as const },
  { key: 'novidades', label: 'Outras novidades', tipo: 'materia_lista' as const, secao: 'novidade' as const },
  { key: 'como_usar', label: 'Como usar melhor', tipo: 'materia_lista' as const, secao: 'como_usar' as const },
  { key: 'mensagem_final', label: 'Mensagem final', tipo: 'texto' as const },
]

const LOGO = 'https://cdn.blueticket.com.br/assets/bt-logo-azul.png'
const BRAND = '#2f6df6'
const BG = '#edeef2'
const CARD = '#ffffff'
const TEXT = '#1a1c23'
const MUTED = '#6b7280'
const BORDER = '#e5e7eb'
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Texto simples -> parágrafos email-safe (mantém quebras de linha). */
function paragraphs(text: string): string {
  const t = (text ?? '').trim()
  if (!t) return ''
  return t
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${TEXT}">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function botao(href: string, label: string): string {
  return `<a href="${esc(href)}" target="_blank" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 16px;border-radius:8px">${esc(label)}</a>`
}

function link(codigo: string, base: string): string {
  const href = `${base.replace(/\/$/, '')}/conteudo/${codigo}`
  return `<a href="${esc(href)}" target="_blank" style="color:${BRAND};text-decoration:none;font-weight:600;font-size:13px">Saiba mais &rarr;</a>`
}

function sectionTitle(label: string): string {
  return `<tr><td style="padding:28px 28px 4px"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${BRAND}">${esc(label)}</div></td></tr>`
}

function destaqueBlock(item: ConteudoRef, base: string): string {
  const cover = item.cover_url
    ? `<img src="${esc(item.cover_url)}" alt="" width="544" style="display:block;width:100%;max-width:544px;border-radius:10px;margin-bottom:14px" />`
    : ''
  return `<tr><td style="padding:6px 28px 8px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD};border:1px solid ${BORDER};border-radius:12px">
      <tr><td style="padding:18px">
        ${cover}
        <div style="font-size:20px;font-weight:700;line-height:1.3;color:${TEXT};margin-bottom:8px">${esc(item.titulo)}</div>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${MUTED}">${esc(item.resumo ?? '')}</p>
        ${botao(`${base.replace(/\/$/, '')}/conteudo/${item.codigo}`, 'Saiba mais')}
      </td></tr>
    </table>
  </td></tr>`
}

function itemRow(item: ConteudoRef, base: string): string {
  return `<tr><td style="padding:6px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${BORDER}">
      <tr><td style="padding:12px 0">
        <div style="font-size:16px;font-weight:600;line-height:1.35;color:${TEXT};margin-bottom:4px">${esc(item.titulo)}</div>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:${MUTED}">${esc(item.resumo ?? '')}</p>
        ${link(item.codigo, base)}
      </td></tr>
    </table>
  </td></tr>`
}

/** Monta o HTML final da newsletter de produto. */
export function renderNewsletterProduto(data: NewsletterProdutoData, ctx: RenderContext): string {
  const base = ctx.baseUrl || ''
  const rows: string[] = []

  // Cabeçalho.
  rows.push(`<tr><td style="padding:28px 28px 8px">
    <table role="presentation" width="100%"><tr>
      <td><img src="${LOGO}" alt="Blueticket" height="26" style="display:block;height:26px;width:auto;border:0" /></td>
      <td align="right" style="font-size:12px;color:${MUTED}">${esc(data.edicao)}</td>
    </tr></table>
  </td></tr>`)

  // Mensagem inicial.
  if (data.mensagemInicial.trim()) {
    rows.push(`<tr><td style="padding:8px 28px 0">${paragraphs(data.mensagemInicial)}</td></tr>`)
  }

  // Destaque do mês.
  if (data.destaque) {
    rows.push(sectionTitle('Destaque do mês'))
    rows.push(destaqueBlock(data.destaque, base))
  }

  // Outras novidades.
  if (data.novidades.length > 0) {
    rows.push(sectionTitle('Outras novidades'))
    for (const it of data.novidades) rows.push(itemRow(it, base))
  }

  // Como usar melhor.
  if (data.comoUsar.length > 0) {
    rows.push(sectionTitle('Como usar melhor'))
    for (const it of data.comoUsar) rows.push(itemRow(it, base))
  }

  // Mensagem final.
  if (data.mensagemFinal.trim()) {
    rows.push(`<tr><td style="padding:20px 28px 0">${paragraphs(data.mensagemFinal)}</td></tr>`)
  }

  // Rodapé. Link de descadastro: por padrão usa o placeholder de substituição
  // do SparkPost ({{unsubscribe_url}}), preenchido por destinatário no disparo.
  const unsub = `<a href="${esc(ctx.unsubscribeUrl || '{{unsubscribe_url}}')}" style="color:${MUTED};text-decoration:underline">descadastrar</a>`
  rows.push(`<tr><td style="padding:28px">
    <div style="border-top:1px solid ${BORDER};padding-top:16px;font-size:12px;line-height:1.6;color:${MUTED}">
      Você recebe este email por fazer parte da base Blueticket.<br>Para não receber mais, ${unsub}.
    </div>
  </td></tr>`)

  // Renderização consistente entre apps: x-apple-disable-message-reformatting
  // impede o iOS Mail de reescalar o texto; text-size-adjust trava o ajuste
  // automático; a largura é fluida (100% até 600px) para o iOS não "diminuir"
  // um layout de largura fixa. Fonte repetida em body/table/td p/ o Gmail.
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no"><title>${esc(data.edicao)}</title>
<style>
  html,body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%}
  body,table,td{font-family:${FONT}}
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
</style></head>
<body style="margin:0;padding:0;background:${BG};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${CARD};border-radius:14px;font-family:${FONT}">
        ${rows.join('\n')}
      </table>
    </td></tr>
  </table>
</body></html>`
}
