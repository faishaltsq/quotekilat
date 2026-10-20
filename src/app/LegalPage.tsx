import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

type LegalPageProps = { kind: 'privacy' | 'terms' }

type LegalSection = {
  id: string
  heading: string
  paragraphs: string[]
}

const privacySections: LegalSection[] = [
  {
    id: 'pemrosesan-lokal',
    heading: '1. Perhitungan dilakukan di perangkat Anda',
    paragraphs: [
      'Fase 1 QuoteKilat adalah alat hitung dan pembuat penawaran tanpa akun. Perhitungan, pratinjau, dan pembuatan PDF berjalan di browser. Isi penawaran tidak dikirim ke API AI, layanan pencarian, penyimpanan cloud, atau penyedia pembayaran oleh aplikasi ini.',
      'Berkas aplikasi dan font tetap dimuat dari host situs. Font antarmuka dan PDF dibundel bersama aplikasi, bukan diminta ke layanan font pihak ketiga. Penanganan data koneksi teknis oleh penyedia hosting perlu ditetapkan pemilik produk sebelum kebijakan ini difinalkan.',
    ],
  },
  {
    id: 'data-draf',
    heading: '2. Data draf yang disimpan secara lokal',
    paragraphs: [
      'Nama item, jenis perhitungan, kuantitas, biaya, target margin, diskon, biaya penjualan, dan pengaturan pembulatan disimpan sebagai draf di localStorage browser ini. Tujuannya agar data perhitungan dapat dipulihkan setelah halaman dimuat ulang. Hindari menaruh data pribadi pada nama item atau kolom biaya.',
      'Nama pelanggan, nama bisnis, dan catatan hanya disimpan dalam memori secara bawaan. Detail ini tidak ikut disimpan ke localStorage kecuali Anda secara eksplisit mengaktifkan opsi penyimpanan detail pribadi di perangkat. Tanpa pilihan tersebut, detail yang hanya ada di memori tidak dipulihkan setelah muat ulang atau sesi aplikasi berakhir.',
      'Jika opsi itu diaktifkan, detail pribadi menjadi bagian dari draf lokal yang sama. Ini bukan persetujuan untuk mengunggah data ke cloud atau memprosesnya dengan AI. Tidak ada sinkronisasi lintas perangkat di Fase 1.',
    ],
  },
  {
    id: 'ekspor-dan-berbagi',
    heading: '3. PDF, clipboard, dan berbagi penawaran',
    paragraphs: [
      'PDF dibuat di perangkat setelah Anda memilih Unduh PDF. Berkas dapat memuat nama pelanggan, nama bisnis, dan catatan yang sedang Anda isi, meskipun Anda tidak mengaktifkan penyimpanan detail pribadi. Periksa pratinjau sebelum mengunduh atau membagikan berkas.',
      'Salin WhatsApp menyalin teks ke clipboard perangkat atau menampilkan teks untuk disalin manual jika akses clipboard ditolak. Tindakan itu tidak otomatis mengirim pesan. Anda sendiri memilih penerima dan mengirimkannya melalui WhatsApp atau aplikasi lain; penanganan data sesudahnya mengikuti aplikasi dan pengaturan perangkat tersebut.',
    ],
  },
  {
    id: 'pelacakan',
    heading: '4. Tidak ada analitik atau integrasi aktif',
    paragraphs: [
      'Tidak ada analitik, piksel pemasaran, pelacak pihak ketiga, akun pengguna, API AI, API pencarian harga, sinkronisasi cloud, atau pembayaran yang diaktifkan oleh QuoteKilat pada Fase 1. Smart Input dan Market Insights ditandai belum aktif; panel contohnya bukan hasil pemrosesan data Anda.',
      'localStorage digunakan untuk draf, bukan untuk iklan atau pelacakan. Kebijakan ini tidak mencakup ekstensi browser, perangkat lunak perangkat, atau layanan lain yang Anda pilih sendiri saat membagikan penawaran.',
    ],
  },
  {
    id: 'masa-simpan',
    heading: '5. Masa simpan dan keterbatasan browser',
    paragraphs: [
      'Draf tersimpan sampai Anda menghapusnya, membersihkan data situs, atau browser menghapus penyimpanannya. localStorage bukan pencadangan: mode privat, batas penyimpanan, atau pengaturan browser dapat membuat draf tidak tersimpan atau hilang.',
      'QuoteKilat tidak memberi enkripsi tambahan pada localStorage. Orang yang menggunakan profil browser yang sama dapat mengakses draf tersebut. Jangan aktifkan penyimpanan detail pribadi pada perangkat bersama jika Anda tidak ingin detail itu tertinggal.',
    ],
  },
  {
    id: 'hapus-data',
    heading: '6. Menghapus data perangkat',
    paragraphs: [
      'Kontrol Hapus data perangkat hanya menghapus kunci draf milik QuoteKilat beserta detail pribadi yang ikut tersimpan di dalamnya. Kontrol ini tidak menghapus seluruh localStorage, cookie, atau data situs lain. Anda juga dapat menghapus data situs melalui pengaturan browser.',
      'Penghapusan draf tidak menghapus PDF yang sudah diunduh, isi clipboard yang dikelola perangkat, atau pesan yang sudah Anda kirim. Hapus salinan tersebut secara terpisah jika diperlukan.',
    ],
  },
  {
    id: 'perubahan-fitur',
    heading: '7. Jika fitur online ditambahkan',
    paragraphs: [
      'Akun, penyimpanan cloud, AI, dan pembayaran memerlukan penjelasan baru mengenai data, tujuan pemrosesan, penerima, masa simpan, serta kontrol pengguna sebelum diaktifkan. Draf lokal tidak boleh otomatis diunggah hanya karena fitur baru tersedia.',
      'Dokumen ini harus diperbarui sesuai implementasi nyata. Daftar rencana fitur dan paket pada halaman utama bukan pernyataan bahwa integrasinya sudah berjalan.',
    ],
  },
  {
    id: 'pengelola',
    heading: '8. Identitas dan kontak pengelola',
    paragraphs: [
      'Identitas badan usaha, alamat, kanal kontak resmi, serta prosedur permintaan privasi belum ditetapkan dalam draf ini. Pemilik produk perlu melengkapinya sebelum kebijakan difinalkan dan layanan komersial diperluas. Tidak ada identitas atau alamat pengelola yang direkayasa pada halaman ini.',
    ],
  },
]

const termsSections: LegalSection[] = [
  {
    id: 'cakupan',
    heading: '1. Cakupan Fase 1',
    paragraphs: [
      'QuoteKilat membantu menghitung harga dari biaya dan target gross margin, membuat pratinjau penawaran, menyalin teks, serta mengunduh PDF dasar. Fitur Guest ini dapat digunakan tanpa membuat akun. Aplikasi bukan sistem akuntansi, sistem perpajakan, bukti pembayaran, atau layanan riset harga pasar aktif.',
      'Fase 1 merupakan versi awal. Halaman ini adalah draf syarat untuk ditinjau pemilik produk; detail identitas pengelola, mekanisme kontak, dan ketentuan komersial belum final.',
    ],
  },
  {
    id: 'perhitungan',
    heading: '2. Input dan hasil perhitungan',
    paragraphs: [
      'Anda menentukan biaya, kuantitas, margin, biaya penjualan, pembulatan, dan diskon. Hasil dihitung menggunakan rumus deterministik, bukan tebakan AI. Target margin menggunakan laba terhadap harga jual; nilainya berbeda dari markup yang dihitung terhadap biaya.',
      'Harga yang dihasilkan bukan jaminan harga pasar, keuntungan, permintaan, atau kesediaan pelanggan membayar. Kesalahan atau biaya yang belum dimasukkan akan memengaruhi hasil. Tinjau rincian, margin aktual setelah diskon, dan kesesuaian spesifikasi sebelum menetapkan penawaran akhir.',
      'QuoteKilat belum menghitung pajak secara otomatis. Biaya tambahan yang tidak Anda masukkan juga tidak diasumsikan tercakup. Laba kotor pada layar bukan laba bersih setelah pajak.',
    ],
  },
  {
    id: 'dokumen',
    heading: '3. Memeriksa dan membagikan penawaran',
    paragraphs: [
      'Periksa nama, item, jumlah, harga, tanggal, masa berlaku jika digunakan, dan catatan sebelum membagikan dokumen. PDF dasar adalah dokumen penawaran, bukan faktur pajak atau bukti bahwa pelanggan telah membayar atau menerima penawaran.',
      'Menyalin teks tidak otomatis mengirim pesan ke WhatsApp. Anda mengendalikan pengiriman dan penerimanya. Kesepakatan dengan pelanggan serta isi dan syarat penawaran akhir ditentukan oleh Anda dan pelanggan, bukan oleh tombol ekspor aplikasi.',
    ],
  },
  {
    id: 'draf-lokal',
    heading: '4. Draf dan tanggung jawab atas salinan',
    paragraphs: [
      'Data item dan perhitungan disimpan lokal di browser. Nama pelanggan, nama bisnis, serta catatan hanya berada dalam memori secara bawaan, kecuali Anda secara eksplisit memilih penyimpanan detail pribadi di perangkat. Tidak ada pencadangan cloud atau pemulihan lintas perangkat di Fase 1.',
      'Draf dapat hilang saat data browser dihapus, penyimpanan diblokir, atau perangkat berubah. Simpan PDF yang diperlukan secara terpisah. Hapus data perangkat hanya menghapus kunci draf milik QuoteKilat, bukan data situs lain atau salinan yang telah diekspor.',
    ],
  },
  {
    id: 'fitur-mendatang',
    heading: '5. Fitur, paket, dan harga yang masih diusulkan',
    paragraphs: [
      'Guest tersedia gratis. Free Account, kuota penyimpanan cloud, Pro, Smart Input, dan Market Insights masih rencana. Harga Pro Rp59.000 per bulan adalah usulan beta yang belum berlaku; fitur, harga, dan kuota dapat berubah setelah validasi.',
      'Tidak ada pembelian, penagihan, perpanjangan otomatis, atau langganan berbayar aktif pada Fase 1. Menampilkan rencana paket tidak mengaktifkan hak akses berbayar. Ketentuan pembayaran, pembatalan, dan pengembalian dana harus ditetapkan sebelum layanan berbayar ditawarkan.',
      'Panel Market Insights hanya contoh struktur informasi. Tanda — berarti data belum tersedia, bukan harga nol. Tidak ada sumber harga terverifikasi atau hasil AI yang dijanjikan dari panel tersebut.',
    ],
  },
  {
    id: 'penggunaan',
    heading: '6. Penggunaan yang sesuai',
    paragraphs: [
      'Gunakan data yang boleh Anda proses dan bagikan. Jangan memasukkan informasi pribadi yang tidak diperlukan atau memakai dokumen untuk menyamar sebagai pihak lain, menyatakan pembayaran palsu, atau menyesatkan penerima mengenai isi penawaran.',
      'Teks masukan diperlakukan sebagai isi dokumen. QuoteKilat tidak memvalidasi identitas pelanggan, kewenangan bisnis, atau kesepakatan di luar aplikasi.',
    ],
  },
  {
    id: 'ketersediaan',
    heading: '7. Ketersediaan dan perubahan versi',
    paragraphs: [
      'Fase 1 belum menawarkan komitmen tingkat layanan, pemulihan data server, atau dukungan berbayar. Fitur dapat disempurnakan; keterangan kemampuan dan batasannya harus mengikuti versi yang benar-benar tersedia.',
      'Penambahan akun, cloud, AI, atau layanan berbayar memerlukan pembaruan dokumen dan kontrol pengguna yang sesuai. Tidak ada fitur mendatang yang otomatis membolehkan pengunggahan draf lokal Anda.',
    ],
  },
  {
    id: 'kontak',
    heading: '8. Informasi pengelola yang perlu dilengkapi',
    paragraphs: [
      'Identitas pengelola, alamat, kontak resmi, mekanisme pengaduan, serta ketentuan hukum komersial belum ditetapkan dalam draf ini. Pemilik produk perlu melengkapinya sebelum syarat difinalkan dan layanan komersial diperluas. Halaman ini tidak mencantumkan kontak atau pendaftaran perusahaan yang belum terverifikasi.',
    ],
  },
]

export function LegalPage({ kind }: LegalPageProps) {
  const isPrivacy = kind === 'privacy'
  const title = isPrivacy ? 'Kebijakan Privasi' : 'Syarat Penggunaan'
  const sections = isPrivacy ? privacySections : termsSections
  const otherTitle = isPrivacy ? 'Syarat Penggunaan' : 'Kebijakan Privasi'
  const otherPath = isPrivacy ? '/terms' : '/privacy'

  return (
    <article className="container qk-legal-page" aria-labelledby="qk-legal-title">
      <Link className="qk-legal-back" to="/">
        <ArrowLeft size={17} aria-hidden="true" /> Kembali ke kalkulator
      </Link>

      <header className="qk-legal-header">
        <p className="qk-eyebrow">Dokumen draf · Fase 1</p>
        <h1 id="qk-legal-title">{title}</h1>
        <p className="qk-legal-lead">
          {isPrivacy
            ? 'Data Anda, tetap di perangkat Anda. Berikut cara draf dan penawaran ditangani pada versi saat ini.'
            : 'Batas dan cara menggunakan alat hitung serta pembuat penawaran QuoteKilat pada versi saat ini.'}
        </p>
      </header>

      <aside className="qk-legal-draft" aria-label="Status dokumen">
        <strong>Draf untuk ditinjau pemilik produk.</strong>
        <p>
          Dokumen ini menjelaskan implementasi Fase 1, bukan ketentuan layanan cloud atau
          paket berbayar yang aktif. Identitas dan kontak pengelola belum final.
        </p>
      </aside>

      <nav className="qk-legal-contents" aria-label="Isi dokumen">
        <p>Di halaman ini</p>
        <ol>
          {sections.map(({ id, heading }) => (
            <li key={id}><a href={`#${id}`}>{heading.replace(/^\d+\. /, '')}</a></li>
          ))}
        </ol>
      </nav>

      <div className="qk-legal-body">
        {sections.map(({ id, heading, paragraphs }) => (
          <section id={id} key={id} aria-labelledby={`qk-legal-${id}`}>
            <h2 id={`qk-legal-${id}`}>{heading}</h2>
            {paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
      </div>

      <div className="qk-legal-related">
        <span>Dokumen terkait</span>
        <Link to={otherPath}>{otherTitle} <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
    </article>
  )
}
