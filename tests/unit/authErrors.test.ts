import { describe, expect, it } from 'vitest'
import { translateAuthError } from '../../src/lib/cloud/authErrors'

describe('translateAuthError', () => {
  it.each([
    ['Invalid login credentials', 'Email atau kata sandi salah.'],
    ['Email not confirmed', 'Konfirmasi email Anda dulu lewat tautan yang dikirim.'],
    ['User already registered', 'Email ini sudah terdaftar. Masuk saja.'],
    ['Password should be at least 6 characters', 'Kata sandi minimal 8 karakter.'],
    ['email rate limit exceeded', 'Terlalu banyak percobaan. Tunggu sebentar.'],
    ['Unable to validate email address: invalid format', 'Format email tidak valid.'],
  ])('%s -> %s', (input, expected) => {
    expect(translateAuthError(input)).toBe(expected)
  })

  it('never echoes raw provider internals to the user', () => {
    const message = translateAuthError('duplicate key value violates unique constraint "users_email_partial_key"')
    expect(message).toBe('Gagal memproses permintaan. Coba lagi.')
    expect(message).not.toContain('constraint')
  })
})
