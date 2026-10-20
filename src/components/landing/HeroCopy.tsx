import { ArrowDownRight, ArrowRight, CheckCircle2 } from 'lucide-react'

const values = [
  'Satu alat untuk barang, jasa, dan pesanan custom',
  'Biaya, laba, dan margin terlihat jelas',
  'Siap disalin ke WhatsApp atau diunduh sebagai PDF',
]

export function HeroCopy() {
  return (
    <div className="qk-hero-copy">
      <p className="qk-availability">
        <span className="qk-availability-dot" aria-hidden="true" />
        Gratis <span aria-hidden="true">·</span> Tanpa daftar
        <span className="qk-availability-extra"> · Langsung pakai</span>
      </p>

      <h1 className="qk-hero-title">
        <span>Harga yang tepat,</span>{' '}
        <span>penawaran lebih cepat.</span>
      </h1>
      <p className="qk-hero-description">
        Hitung dari biaya Anda, tentukan margin, lalu buat penawaran yang rapi.
        Langsung di sini, tanpa perlu akun.
      </p>

      <ul className="qk-hero-values">
        {values.map((value) => (
          <li key={value}>
            <CheckCircle2 size={18} strokeWidth={1.7} aria-hidden="true" />
            <span>{value}</span>
          </li>
        ))}
      </ul>

      <a className="button button-primary qk-hero-cta" href="#quote-builder">
        Coba hitung sekarang
        <ArrowRight size={18} aria-hidden="true" />
      </a>
      <p className="qk-builder-cue">
        Mulai dari kalkulator di sini
        <ArrowDownRight size={22} strokeWidth={1.4} aria-hidden="true" />
      </p>
    </div>
  )
}
