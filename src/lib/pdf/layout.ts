import type { PDFFont } from 'pdf-lib'

const graphemes = new Intl.Segmenter('id', { granularity: 'grapheme' })

/** Break at words where possible, and at grapheme boundaries for long URLs/names. */
export function wrapPdfText(text: string, font: PDFFont, size: number, width: number): string[] {
  const result: string[] = []
  const fits = (value: string) => font.widthOfTextAtSize(value, size) <= width
  for (const paragraph of text.replace(/\r\n?/g, '\n').replaceAll('\t', '    ').split('\n')) {
    let line = ''
    const words = paragraph.match(/\S+/gu) ?? []
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (fits(candidate)) {
        line = candidate
        continue
      }
      if (line) result.push(line)
      line = ''
      if (fits(word)) {
        line = word
        continue
      }
      for (const { segment } of graphemes.segment(word)) {
        if (!fits(segment)) throw new Error('Teks terlalu lebar untuk halaman PDF.')
        if (line && !fits(line + segment)) {
          result.push(line)
          line = segment
        } else {
          line += segment
        }
      }
    }
    result.push(line)
  }
  return result
}
