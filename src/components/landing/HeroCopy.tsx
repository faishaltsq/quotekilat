import { ArrowDown, CheckCircle2 } from 'lucide-react'

const values = [
  'Satu alat untuk barang, jasa, dan pesanan custom',
  'Biaya, laba, dan margin terlihat jelas',
  'Siap disalin ke WhatsApp atau diunduh sebagai PDF',
]

export function HeroCopy() {
  return (
    <div className="qk-hero-copy">
      <h1 className="qk-hero-h1" id="hero-title">
        Ruang hitung QuoteKilat
      </h1>

      <ul className="qk-hero-values">
        {values.map((value) => (
          <li key={value}>
            <CheckCircle2 size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{value}</span>
          </li>
        ))}
      </ul>

      <p className="qk-hero-note">
        Gratis <span aria-hidden="true">·</span> tanpa akun <span aria-hidden="true">·</span> data tetap di perangkat
      </p>

      <a className="qk-hero-down" href="#harga">
        Paket &amp; Pro
        <ArrowDown size={14} aria-hidden="true" />
      </a>
    </div>
  )
}
