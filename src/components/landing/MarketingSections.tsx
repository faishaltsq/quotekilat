import type { ReactNode } from 'react'
import {
  ArrowRight,
  Calculator,
  Check,
  FileText,
  HardDrive,
  Plus,
  ScanText,
  Search,
  Send,
} from 'lucide-react'
import { UpgradePanel } from '../billing/UpgradePanel'
import { useBilling } from '../../lib/billing/useBilling'

const benefits = [
  { icon: Calculator, title: 'Harga lebih terukur', copy: 'Hitung dari biaya dan target margin.' },
  { icon: FileText, title: 'Penawaran yang rapi', copy: 'Pratinjau dan PDF dasar, tanpa akun.' },
  { icon: Send, title: 'Siap dibagikan', copy: 'Salin teks untuk WhatsApp.' },
  { icon: HardDrive, title: 'Draf tetap lokal', copy: 'Tersimpan di browser perangkat ini.' },
]

const steps = [
  {
    number: '01',
    title: 'Masukkan biaya',
    copy: 'Pilih Barang, Jasa, atau Custom. Isi biaya yang benar-benar Anda keluarkan, bukan harga jual.',
  },
  {
    number: '02',
    title: 'Tentukan margin',
    copy: 'Atur target margin. Lihat harga jual, biaya penjualan, dan laba berubah mengikuti perhitungan.',
  },
  {
    number: '03',
    title: 'Buat & bagikan',
    copy: 'Periksa penawaran, lalu unduh PDF atau salin teks untuk dikirim sendiri lewat WhatsApp.',
  },
]

const faqs = [
  {
    question: 'Apa saja yang bisa dipakai tanpa akun?',
    answer:
      'Kalkulator Barang, Jasa, dan Custom, pratinjau penawaran, salin teks WhatsApp, PDF dasar, serta draf lokal bisa dipakai gratis tanpa daftar. Tidak ada kuota bulanan untuk membuat penawaran lokal di Fase 1.',
  },
  {
    question: 'Apa bedanya margin dan markup?',
    answer:
      'Margin membandingkan laba dengan harga jual. Markup membandingkan selisih harga jual dan biaya dengan biaya. QuoteKilat menggunakan target gross margin (margin kotor), bukan markup; biaya penjualan dan diskon ikut memengaruhi margin aktual.',
  },
  {
    question: 'Apakah pajak sudah termasuk?',
    answer:
      'Belum. Hasil perhitungan dan PDF dasar belum menghitung pajak secara otomatis. Periksa perlakuan pajak dan seluruh biaya sebelum mengirim penawaran. Angka laba yang ditampilkan bukan laba bersih setelah pajak.',
  },
  {
    question: 'Di mana data penawaran saya disimpan?',
    answer:
      'Data item dan perhitungan disimpan sebagai draf di localStorage browser ini. Nama pelanggan, nama bisnis, dan catatan hanya berada di memori secara bawaan; detail itu ikut tersimpan lokal hanya jika Anda memilih opsi penyimpanannya. Tidak ada sinkronisasi cloud. Hapus data perangkat hanya menghapus draf milik QuoteKilat, bukan data situs lain.',
  },
  {
    question: 'Bagaimana jika data browser saya dihapus?',
    answer:
      'Draf lokal dapat hilang ketika data browser dibersihkan, saat memakai mode privat, atau jika penyimpanan diblokir. Draf tidak berpindah otomatis ke perangkat lain. PDF yang sudah Anda unduh tetap menjadi salinan terpisah di perangkat Anda.',
  },
  {
    question: 'Apakah Smart Input dan Market Insights sudah aktif?',
    answer:
      'Belum. Keduanya masih rencana untuk tahap berikutnya. Fase 1 tidak memanggil model AI atau API pencarian; panel contoh tidak berisi hasil AI maupun harga pasar. Perhitungan harga saat ini memakai rumus deterministik dari input Anda.',
  },
  {
    question: 'Apakah harga yang dihitung merupakan harga pasar?',
    answer:
      'Bukan. Angka di kalkulator berasal dari biaya, target margin, biaya penjualan, pembulatan, dan diskon Anda. Referensi pasar nantinya perlu sumber, tanggal, satuan, wilayah, serta spesifikasi yang bisa dibandingkan. Tanpa sumber yang cukup, tidak ada rekomendasi harga pasar.',
  },
  {
    question: 'Bisakah saya berlangganan Pro sekarang?',
    answer:
      'Belum. Akun, penyimpanan cloud, AI, dan langganan belum tersedia. Harga Pro Rp59.000 per bulan beserta fitur dan kuotanya masih usulan beta, bukan penawaran berbayar yang aktif. Tidak ada pembelian atau penagihan di Fase 1.',
  },
]

function BenefitStrip() {
  return (
    <section className="qk-benefit-strip" id="fitur" aria-label="Fitur dasar QuoteKilat">
      <div className="container">
        <ul className="qk-benefits">
          {benefits.map(({ icon: Icon, title, copy }) => (
            <li key={title}>
              <Icon className="qk-benefit-icon" size={22} strokeWidth={1.65} aria-hidden="true" />
              <div>
                <h2>{title}</h2>
                <p>{copy}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section className="qk-section qk-how-section" id="cara-kerja" aria-labelledby="qk-how-title">
      <div className="container">
        <div className="qk-section-heading qk-split-heading">
          <div>
            <p className="qk-eyebrow">Cara kerja</p>
            <h2 id="qk-how-title">Dari biaya, jadi penawaran.</h2>
          </div>
          <p className="qk-section-description">
            Tiga langkah yang jelas. Anda tetap memegang kendali atas angka dan penawaran akhirnya.
          </p>
        </div>
        <ol className="qk-steps">
          {steps.map((step) => (
            <li key={step.number}>
              <span className="qk-step-number" aria-hidden="true">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function MarketInsights() {
  const { status: billing } = useBilling()
  const isPro = billing?.plan === 'pro'

  return (
    <section className="qk-section qk-insights-section" aria-labelledby="qk-insights-title">
      <div className="container qk-insights-layout">
        <div className="qk-insights-copy">
          <p className="qk-eyebrow">Rencana tahap berikutnya</p>
          <h2 className="qk-section-title" id="qk-insights-title">
            Harga pasar perlu konteks, bukan tebakan.
          </h2>
          <p className="qk-section-description">
            Market Insights dirancang untuk membandingkan referensi yang punya sumber,
            tanggal, dan spesifikasi yang jelas. Bukan mengganti perhitungan biaya Anda.
          </p>
          {isPro ? (
            <a className="button button-secondary qk-future-button" href="/#quote-builder">
              <Search size={17} aria-hidden="true" />
              Cek harga pasar
            </a>
          ) : (
            <>
              <button
                className="button button-secondary qk-future-button"
                type="button"
                disabled
                aria-describedby="qk-market-unavailable"
              >
                <Search size={17} aria-hidden="true" />
                Cek harga pasar · belum aktif
              </button>
              <p className="qk-future-note" id="qk-market-unavailable">
                Butuh paket Pro. Kuota harga pasar belum aktif di paket gratis.
              </p>
            </>
          )}

          <div className="qk-smart-preview">
            <ScanText size={20} strokeWidth={1.6} aria-hidden="true" />
            <div>
              <h3>Isi pesanan, tanpa mengetik ulang.</h3>
              <p id="qk-smart-available">
                Tempel catatan pesanan, periksa usulan isian, lalu terapkan sendiri. Angka yang tidak disebut tidak ditebak.
              </p>
              <a className="qk-smart-button" href="/#quote-builder" aria-describedby="qk-smart-available">
                Coba Smart Input
                <ArrowRight size={13} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>

        <article className="qk-market-demo" aria-labelledby="qk-market-demo-title">
          <div className="qk-demo-status">
            <span className="qk-demo-label">Contoh tampilan</span>
            <span className="qk-pending-label">Belum aktif</span>
          </div>
          <h3 id="qk-market-demo-title">Market Insights</h3>
          <p className="qk-demo-description">Referensi yang bisa diperiksa, saat fitur tersedia.</p>

          <dl className="qk-market-range">
            <div>
              <dt>Kisaran harga teramati</dt>
              <dd>—</dd>
            </div>
          </dl>
          <table className="qk-market-table">
            <caption>Struktur referensi harga · belum ada sumber</caption>
            <thead>
              <tr>
                <th scope="col">Sumber</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Satuan</th>
                <th scope="col">Harga</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>—</td><td>—</td><td>—</td><td>—</td></tr>
            </tbody>
          </table>
          <dl className="qk-market-context">
            <div><dt>Wilayah</dt><dd>—</dd></div>
            <div><dt>Kecocokan spesifikasi</dt><dd>—</dd></div>
            <div><dt>Kecukupan referensi</dt><dd>—</dd></div>
          </dl>
          <p className="qk-demo-disclosure">
            Belum ada sumber atau harga yang diverifikasi. Ini hanya contoh struktur informasi,
            bukan data pasar atau rekomendasi harga.
          </p>
        </article>
      </div>
    </section>
  )
}

function PlanFeature({ children, future = false }: { children: ReactNode; future?: boolean }) {
  return (
    <li>
      {future ? <span className="qk-future-dash" aria-hidden="true">—</span> : <Check size={16} aria-hidden="true" />}
      <span>{future && <span className="qk-later">Nanti: </span>}{children}</span>
    </li>
  )
}

export function PricingPlans() {
  return (
    <section className="qk-section qk-pricing-section" id="harga" aria-labelledby="qk-pricing-title">
      <div className="container">
        <div className="qk-section-heading qk-split-heading">
          <div>
            <p className="qk-eyebrow">Pilihan penggunaan</p>
            <h2 id="qk-pricing-title">Mulai gratis. Tetap di tangan Anda.</h2>
          </div>
          <p className="qk-section-description">
            Guest sudah bisa dipakai. Paket akun dan Pro di bawah masih rencana;
            tidak ada pembelian atau penagihan saat ini.
          </p>
        </div>

        <div className="qk-plans">
          <article className="qk-plan qk-plan-active" aria-labelledby="qk-plan-guest">
            <p className="qk-plan-status">Tersedia sekarang</p>
            <h3 id="qk-plan-guest">Guest</h3>
            <p className="qk-plan-intro">Untuk penawaran yang perlu selesai hari ini.</p>
            <p className="qk-plan-price">Rp0</p>
            <p className="qk-plan-period">Tanpa akun. Tanpa langganan.</p>
            <ul className="qk-plan-features">
              <PlanFeature>Kalkulator Barang, Jasa & Custom</PlanFeature>
              <PlanFeature>Pratinjau dan PDF dasar</PlanFeature>
              <PlanFeature>Teks siap salin untuk WhatsApp</PlanFeature>
              <PlanFeature>Draf lokal di perangkat</PlanFeature>
            </ul>
            <a className="button button-primary qk-plan-cta" href="/#quote-builder">
              Pakai gratis sekarang <ArrowRight size={17} aria-hidden="true" />
            </a>
          </article>

          <article className="qk-plan qk-plan-future" aria-labelledby="qk-plan-free">
            <p className="qk-plan-status">Rencana · belum aktif</p>
            <h3 id="qk-plan-free">Free Account</h3>
            <p className="qk-plan-intro">Usulan untuk menyimpan penawaran lintas perangkat.</p>
            <p className="qk-plan-price">Rp0</p>
            <p className="qk-plan-period">Usulan paket akun gratis.</p>
            <ul className="qk-plan-features">
              <PlanFeature future>Seluruh fitur Guest</PlanFeature>
              <PlanFeature future>5 penawaran cloud per bulan</PlanFeature>
              <PlanFeature future>Riwayat cloud dasar</PlanFeature>
              <PlanFeature future>Akses lintas perangkat</PlanFeature>
            </ul>
            <p className="qk-plan-unavailable">Pendaftaran akun belum tersedia</p>
          </article>

          <article className="qk-plan qk-plan-future" aria-labelledby="qk-plan-pro">
          <p className="qk-plan-status">Sandbox · uji coba</p>
            <h3 id="qk-plan-pro">Pro</h3>
            <p className="qk-plan-intro">Usulan untuk kebutuhan penawaran yang berulang.</p>
            <p className="qk-plan-price">Rp59.000</p>
            <p className="qk-plan-period">/ bulan · usulan beta, belum berlaku</p>
            <ul className="qk-plan-features">
              <PlanFeature future>100 penawaran cloud per bulan</PlanFeature>
              <PlanFeature future>PDF dengan identitas bisnis</PlanFeature>
              <PlanFeature future>Preset dan daftar pelanggan</PlanFeature>
              <PlanFeature future>AI berkuota, setelah siap</PlanFeature>
            </ul>
            <p className="qk-plan-unavailable">Pembayaran QRIS uji coba lewat KlikQRIS sandbox</p>
          </article>
        </div>
        <UpgradePanel />
        <p className="qk-pricing-footnote">
          Harga, kuota, dan fitur paket mendatang masih perlu divalidasi dan dapat berubah.
          Batas cloud yang direncanakan tidak membatasi penggunaan kalkulator lokal.
        </p>
      </div>
    </section>
  )
}

function FAQ() {
  return (
    <section className="qk-section qk-faq-section" id="faq" aria-labelledby="qk-faq-title">
      <div className="container qk-faq-layout">
        <div className="qk-faq-intro">
          <p className="qk-eyebrow">Pertanyaan umum</p>
          <h2 className="qk-section-title" id="qk-faq-title">Yang perlu Anda tahu.</h2>
          <p className="qk-section-description">
            Tentang angka, data Anda, dan apa yang sudah bisa dipakai.
          </p>
          <a className="qk-text-link" href="/#quote-builder">
            Kembali ke kalkulator <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <div className="qk-faq-list">
          {faqs.map(({ question, answer }) => (
            <details className="qk-faq-item" key={question}>
              <summary>
                <span>{question}</span>
                <Plus className="qk-faq-plus" size={18} strokeWidth={1.7} aria-hidden="true" />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function MarketingSections() {
  return (
    <>
      <BenefitStrip />
      <HowItWorks />
      <MarketInsights />
      <PricingPlans />
      <FAQ />
    </>
  )
}
