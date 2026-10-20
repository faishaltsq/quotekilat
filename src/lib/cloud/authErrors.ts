/** Supabase messages are English and often leak internals; keep the UI Indonesian. */
export function translateAuthError(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login credentials')) return 'Email atau kata sandi salah.'
  if (normalized.includes('email not confirmed')) return 'Konfirmasi email Anda dulu lewat tautan yang dikirim.'
  if (normalized.includes('user already registered')) return 'Email ini sudah terdaftar. Masuk saja.'
  if (normalized.includes('password should be at least')) return 'Kata sandi minimal 8 karakter.'
  if (normalized.includes('rate limit') || normalized.includes('too many')) return 'Terlalu banyak percobaan. Tunggu sebentar.'
  if (normalized.includes('unable to validate email')) return 'Format email tidak valid.'
  return 'Gagal memproses permintaan. Coba lagi.'
}
