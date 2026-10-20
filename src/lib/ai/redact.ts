/**
 * Strips identifiers that have no business leaving the device before the text
 * reaches a model provider. Prices and quantities are left alone: they are the
 * only reason the text is being sent.
 */

export type Redaction = { text: string; count: number; kinds: string[] }

type Rule = { kind: string; pattern: RegExp; replacement: string }

// Order matters. Structured identifiers are removed before the generic digit
// sweep, otherwise the 16-digit NIK rule would eat an NPWP or an account number
// and report the wrong reason.
const RULES: Rule[] = [
  { kind: 'email', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, replacement: '[email]' },
  { kind: 'tautan', pattern: /\b(?:https?:\/\/|www\.)\S+/gi, replacement: '[tautan]' },
  { kind: 'npwp', pattern: /\b\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}\b/g, replacement: '[npwp]' },
  { kind: 'nik', pattern: /\b\d{16}\b/g, replacement: '[nik]' },
  { kind: 'telepon', pattern: /(?:\+?62|0)8[1-9]\d{6,10}\b/g, replacement: '[telepon]' },
  // Account numbers are written with separators in practice. A bare 10-15 digit
  // run is left alone on purpose: it is far more often a large price.
  { kind: 'rekening', pattern: /\b\d{4}[-\s]\d{4}[-\s]\d{4,7}\b/g, replacement: '[nomor]' },
]

export function redactPii(input: string): Redaction {
  let text = input
  let count = 0
  const kinds = new Set<string>()
  for (const rule of RULES) {
    text = text.replace(rule.pattern, () => {
      count += 1
      kinds.add(rule.kind)
      return rule.replacement
    })
  }
  return { text, count, kinds: [...kinds] }
}
