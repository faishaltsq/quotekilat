import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PDFDocument } from 'pdf-lib'
import { createQuote, formatWhatsApp } from '../../src/lib/quotation/quote'
import { downloadQuotePdf, generateQuotePdf } from '../../src/lib/pdf/generatePdf'
import type { PricingResult } from '../../src/lib/pricing/types'

const pricing: PricingResult = {
  baseCost: 175000,
  minimumPrice: 250000,
  roundedPrice: 250000,
  discountAmount: 25000,
  finalPrice: 225000,
  sellingFees: 11250,
  profit: 38750,
  actualMarginBps: 1722,
  belowTarget: true,
  unitPrice: 75000,
  costLines: [{ label: 'BIAYA RAHASIA', amount: 175000 }],
}

function quoteWith(overrides: Partial<Parameters<typeof createQuote>[0]> = {}) {
  return createQuote({
    title: 'Cetak katalog',
    businessName: 'Kreasi Nusantara',
    customerName: 'José Wijaya',
    notes: 'Pengiriman setelah persetujuan.',
    validDays: 7,
    ...overrides,
  }, 'goods', 3, pricing, new Date('2026-10-20T16:45:00.000Z'))
}

function fontBytes() {
  return new Uint8Array(readFileSync(`${process.cwd()}/src/lib/pdf/fonts/NotoSans-Regular.ttf`))
}

async function parsePdf(bytes: Uint8Array) {
  const loading = getDocument({ data: bytes.slice(), useSystemFonts: false })
  const document = await loading.promise
  try {
    const pages = []
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number)
      const content = await page.getTextContent()
      const items = content.items.flatMap((item) => 'str' in item ? [item] : [])
      pages.push({ width: page.view[2], height: page.view[3], items })
    }
    return {
      pageCount: document.numPages,
      pages,
      text: pages.map((page) => page.items.map((item) => item.str).join('\n')).join('\n'),
    }
  } finally {
    await loading.destroy()
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('customer quotation PDF', () => {
  it('downloads actual PDF bytes under the existing snapshot number using only a local font request', async () => {
    const quote = quoteWith()
    const fetchFont = vi.fn().mockResolvedValue(new Response(fontBytes()))
    const createObjectURL = vi.fn().mockReturnValue('blob:quotation-download')
    const revokeObjectURL = vi.fn()
    const OriginalURL = URL
    vi.stubGlobal('fetch', fetchFont)
    vi.stubGlobal('URL', class extends OriginalURL {
      static createObjectURL = createObjectURL
      static revokeObjectURL = revokeObjectURL
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe(`${quote.id}.pdf`)
      expect(this.href).toBe('blob:quotation-download')
      expect(this.isConnected).toBe(true)
    })
    await downloadQuotePdf(quote)
    expect(click).toHaveBeenCalledTimes(1)
    expect(fetchFont).toHaveBeenCalledTimes(1)
    expect(fetchFont.mock.calls[0]).toHaveLength(1)
    expect(fetchFont.mock.calls[0][0]).not.toMatch(/^https?:\/\//)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toBe('application/pdf')
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(blob)
    })
    expect((await parsePdf(new Uint8Array(buffer))).text).toContain(quote.id)
    expect(document.querySelector('a[download]')).toBeNull()
    await vi.waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:quotation-download'), { timeout: 2000 })
  })

  it('preserves supported non-ASCII names and composed accents in actual extracted PDF text', async () => {
    const customerName = 'Łukasz Nguyễn – José / Кирилл / Ελληνικά'
    const quote = quoteWith({ customerName, businessName: 'Œuvre & Co', notes: 'Office offline, fi ffi ff fl. Cafe\u0301.' })
    const pdf = await parsePdf(await generateQuotePdf(quote, { fontBytes: fontBytes() }))
    expect(pdf.text).toContain(customerName)
    expect(pdf.text).toContain('Œuvre & Co')
    expect(pdf.text.normalize('NFC')).toContain('Office offline, fi ffi ff fl. Café.')
  })

  it('wraps long names and unbroken URLs, paginates notes, and keeps all text and totals inside readable bounds', async () => {
    const url = `https://example.test/${'abcdefghijklmnop0123456789'.repeat(40)}`
    const noteLines = Array.from({ length: 90 }, (_, index) => `Catatan-ke-${index}: persetujuan pelanggan sebelum produksi.`)
    const quote = quoteWith({
      businessName: 'Usaha '.repeat(24),
      customerName: 'Łukasz'.repeat(30),
      title: 'Katalog produk dengan spesifikasi lengkap '.repeat(16),
      notes: `${url}\r\n${noteLines.join('\n')}\nSELESAI`,
    })
    const pdf = await parsePdf(await generateQuotePdf(quote, { fontBytes: fontBytes() }))
    expect(pdf.pageCount).toBeGreaterThan(1)
    // Page furniture must not be counted as part of a URL spanning two pages.
    const bodyText = pdf.pages.flatMap((page) => page.items)
      .filter((item) => item.str !== 'PENAWARAN' && !item.str.includes('Halaman '))
      .map((item) => item.str).join('').replace(/\s/g, '')
    expect(bodyText).toContain(url)
    expect(bodyText).toContain('Łukasz'.repeat(30))
    for (const line of noteLines) expect(pdf.text).toContain(line)
    expect(pdf.text).toContain('SELESAI')
    const totalsPage = pdf.pages.find((page) => page.items.some((item) => item.str.includes('Subtotal (dibulatkan)')))
    expect(totalsPage?.items.map((item) => item.str).join(' ')).toContain('Total: Rp225.000')
    for (const page of pdf.pages) {
      const text = page.items.filter((item) => item.str.trim())
      for (const item of text) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(47.9)
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(page.width - 47)
        expect(item.transform[5]).toBeGreaterThanOrEqual(28)
        expect(item.transform[5] + item.height).toBeLessThanOrEqual(page.height - 35)
      }
      const body = text.filter((item) => !item.str.includes('Halaman '))
      for (let index = 1; index < body.length; index += 1) {
        expect(body[index].height).toBeGreaterThanOrEqual(12)
        expect(body[index - 1].transform[5] - body[index].transform[5]).toBeGreaterThanOrEqual(16)
      }
    }
  })

  it.each([
    ['emoji', 'Studio 🙂', 'U+1F642'],
    ['CJK', '漢字 商店', 'U+6F22'],
    ['invisible formatting', 'Nama\u200Dpelanggan', 'U+200D'],
  ])('explicitly rejects unsupported %s instead of exporting missing or invisible glyphs', async (_kind, customerName, codePoint) => {
    await expect(generateQuotePdf(quoteWith({ customerName }), { fontBytes: fontBytes() })).rejects.toThrow(
      new RegExp(`Karakter.*${codePoint.replace('+', '\\+')}.*tidak didukung`),
    )
  })

  it('creates a real PDF with the same snapshot and amounts as WhatsApp, without internal finances', async () => {
    const quote = quoteWith()
    const bytes = await generateQuotePdf(quote, { fontBytes: fontBytes() })
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const metadata = await PDFDocument.load(bytes)
    expect(metadata.getCreationDate()?.toISOString()).toBe(quote.createdAt)
    const pdf = await parsePdf(bytes)
    expect(pdf.pageCount).toBe(1)
    for (const value of [quote.id, 'José Wijaya', 'Cetak katalog', '20 Oktober 2026', '27 Oktober 2026', 'Rp250.000', 'Rp25.000', 'Rp225.000', 'Rp75.000']) {
      expect(pdf.text).toContain(value)
      expect(formatWhatsApp(quote)).toContain(value)
    }
    expect(pdf.text).toContain('Belum termasuk pajak')
    expect(pdf.text).toContain('Pengiriman setelah persetujuan.')
    expect(pdf.text).not.toMatch(/BIAYA RAHASIA|175[.\s]?000|11[.\s]?250|38[.\s]?750|modal|margin|profit|sellingFees|belowTarget/i)
  })
})
