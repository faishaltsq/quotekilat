import { describe, expect, it } from 'vitest'
import { redactPii } from '../../src/lib/ai/redact'

describe('redactPii', () => {
  it('removes an email address', () => {
    const result = redactPii('kirim invoice ke budi.santoso@example.co.id ya')
    expect(result.text).toBe('kirim invoice ke [email] ya')
    expect(result.count).toBe(1)
    expect(result.kinds).toContain('email')
  })

  it('removes Indonesian phone numbers in every shape people write them', () => {
    for (const phone of ['081234567890', '+6281234567890', '6281234567890']) {
      const result = redactPii(`wa ${phone} untuk konfirmasi`)
      expect(result.text).not.toContain(phone)
      expect(result.text).toContain('[telepon]')
    }
  })

  it('removes a 16 digit NIK but keeps a six digit price', () => {
    const result = redactPii('nik 3201234567890123, harga 150000 per unit')
    expect(result.text).toContain('[nik]')
    expect(result.text).not.toContain('3201234567890123')
    expect(result.text).toContain('150000')
  })

  it('removes NPWP before the digit sweep can claim it', () => {
    const result = redactPii('npwp 01.234.567.8-901.000 untuk invoice')
    expect(result.text).toContain('[npwp]')
    expect(result.kinds).toEqual(['npwp'])
  })

  it('removes account numbers written with separators', () => {
    const result = redactPii('transfer ke 1234-5678-9012 a/n Budi')
    expect(result.text).toContain('[nomor]')
    expect(result.text).not.toContain('1234-5678-9012')
  })

  it('removes links', () => {
    const result = redactPii('referensi https://somedrive.example.com/x/secret')
    expect(result.text).toBe('referensi [tautan]')
  })

  it('leaves the commercial content the parse depends on', () => {
    const text = 'Hampers 25 pcs, kain 60rb per pcs, kemasan 8000, margin 30%'
    const result = redactPii(text)
    expect(result.text).toBe(text)
    expect(result.count).toBe(0)
  })

  it('reports how many things it removed', () => {
    const result = redactPii('a@b.co dan 081234567890 dan 3201234567890123')
    expect(result.count).toBe(3)
  })
})
