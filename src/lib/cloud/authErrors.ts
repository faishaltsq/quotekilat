/** Supabase messages are English and often leak internals; keep the UI Indonesian. */
export function translateAuthError(message: string): string {
  // Supabase reports both prose messages and machine codes (over_email_send_
  // rate_limit); flattening underscores lets one set of patterns match both.
  const normalized = message.toLowerCase().replace(/_/g, ' ')
  if (normalized.includes('invalid login credentials')) return 'Email atau kata sandi salah.'
  if (normalized.includes('email not confirmed')) return 'Konfirmasi email Anda dulu lewat tautan yang dikirim.'
  if (normalized.includes('user already registered')) return 'Email ini sudah terdaftar. Masuk saja.'
  if (normalized.includes('password should be at least')) return 'Kata sandi minimal 8 karakter.'
  // Sending limits are a project quota, not a user mistake — the generic
  // "wait a moment" advice would send them retrying for no reason.
  if (normalized.includes('email rate limit') || normalized.includes('send rate limit')) {
    return 'Email konfirmasi tidak terkirim: batas pengiriman project tercapai. Coba lagi nanti.'
  }
  if (normalized.includes('rate limit') || normalized.includes('too many')) return 'Terlalu banyak percobaan. Tunggu sebentar.'
  if (normalized.includes('unable to validate email') || (normalized.includes('email address') && normalized.includes('invalid'))) {
    return 'Format email tidak valid.'
  }
  return 'Gagal memproses permintaan. Coba lagi.'
}
