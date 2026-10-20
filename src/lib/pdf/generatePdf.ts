import { PDFDocument, PageSizes, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fontUrl from './fonts/NotoSans-Regular.ttf?url'
import type { QuoteSnapshot } from '../quotation/quote'
import { getCustomerQuoteLines } from '../quotation/presentation'
import { wrapPdfText } from './layout'

export type QuotePdfOptions = {
  /** Optional local font bytes for deterministic tests or an offline caller. */
  fontBytes?: Uint8Array
}

async function loadFont(): Promise<Uint8Array> {
  const response = await fetch(fontUrl)
  if (!response.ok) throw new Error('Font PDF lokal gagal dimuat. Silakan coba lagi.')
  return new Uint8Array(await response.arrayBuffer())
}

/** Browser-only document generation; no quotation data leaves the device. */
export async function generateQuotePdf(
  quote: QuoteSnapshot,
  options: QuotePdfOptions = {},
): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  document.registerFontkit(fontkit)
  const font = await document.embedFont(options.fontBytes ?? await loadFont(), { subset: true })
  const lines = getCustomerQuoteLines(quote)
  const supported = new Set(font.getCharacterSet())
  const unsupported = new Set<string>()
  for (const character of ['PENAWARAN', ...lines].join('\n')) {
    if ('\n\r\t'.includes(character)) continue
    const codePoint = character.codePointAt(0) ?? 0
    if (!supported.has(codePoint) || /\p{C}/u.test(character)) {
      unsupported.add(`U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`)
    }
  }
  if (unsupported.size > 0) {
    throw new Error(`Karakter ${[...unsupported].slice(0, 8).join(', ')} tidak didukung font PDF Noto Sans. Ubah atau hapus karakter tersebut lalu coba lagi.`)
  }
  const date = new Date(quote.createdAt)
  document.setTitle(`Penawaran ${quote.id}`)
  document.setCreator('QuoteKilat')
  document.setProducer('QuoteKilat')
  document.setLanguage('id-ID')
  document.setCreationDate(date)
  document.setModificationDate(date)

  const margin = 48
  const bottom = 64
  const lineHeight = 20
  const color = rgb(0.09, 0.13, 0.24)
  let page = document.addPage(PageSizes.A4)
  let y = page.getHeight() - 100
  const drawHeader = () => {
    page.drawText('PENAWARAN', { x: margin, y: page.getHeight() - 60, size: 20, font, color })
    page.drawLine({
      start: { x: margin, y: page.getHeight() - 78 },
      end: { x: page.getWidth() - margin, y: page.getHeight() - 78 },
      thickness: 0.75,
      color: rgb(0.78, 0.82, 0.9),
    })
  }
  const nextPage = () => {
    page = document.addPage(PageSizes.A4)
    y = page.getHeight() - 100
    drawHeader()
  }
  drawHeader()
  for (const text of lines) {
    // Keep subtotal, discount, total and tax treatment together at page boundaries.
    if (text.startsWith('Subtotal (dibulatkan):') && y - 3 * lineHeight < bottom) nextPage()
    if (text === 'Catatan:' && y - lineHeight < bottom) nextPage()
    for (const line of wrapPdfText(text, font, 12, page.getWidth() - 2 * margin)) {
      if (y < bottom) nextPage()
      page.drawText(line, { x: margin, y, size: 12, font, color })
      y -= lineHeight
    }
  }
  const pages = document.getPages()
  pages.forEach((currentPage, index) => {
    currentPage.drawText(`${quote.id} | Halaman ${index + 1}/${pages.length}`, {
      x: margin, y: 32, size: 10, font, color: rgb(0.32, 0.38, 0.49),
    })
  })
  return document.save()
}

/** Download the same snapshot; the temporary object URL is released after use. */
export async function downloadQuotePdf(quote: QuoteSnapshot): Promise<void> {
  const bytes = await generateQuotePdf(quote)
  const blob = new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${quote.id}.pdf`
  anchor.hidden = true
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    // Immediate revocation can cancel a download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
