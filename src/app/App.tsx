import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { ArrowLeft, ArrowUpRight, Zap } from 'lucide-react'
import { QuoteBuilder } from '../components/quote-builder/QuoteBuilder'
import { HeroCopy } from '../components/landing/HeroCopy'
import { HeroParallaxLayers } from '../components/landing/HeroParallaxLayers'
import { MarketingSections, PricingPlans } from '../components/landing/MarketingSections'
import { LegalPage } from './LegalPage'
import { ResetPasswordPage } from './ResetPasswordPage'
import '../components/landing/landing.css'
function Navigation() {
  const location = useLocation()
  return <header className="site-header"><nav className="container navbar" aria-label="Navigasi utama"><Link className="brand" to="/" aria-label="QuoteKilat beranda"><span className="brand-mark"><Zap size={20} fill="currentColor" /></span>QuoteKilat<span className="brand-beta">BETA</span></Link><div className="nav-links"><a href="/#cara-kerja">Cara kerja</a><a href="/#harga">Harga</a><a href="/#faq">FAQ</a></div>{location.pathname === '/' ? <a href="#quote-builder" className="nav-action">Coba gratis <ArrowUpRight size={15} /></a> : <Link to="/" className="nav-action"><ArrowLeft size={15} /> Kembali</Link>}</nav></header>
}
function Footer() { return <footer className="site-footer"><div className="container footer-content"><div><Link to="/" className="brand"><Zap size={19} fill="currentColor" />QuoteKilat</Link><p>Hitung tepat. Tawarkan cepat.</p></div><div className="footer-links"><Link to="/privacy">Privasi</Link><Link to="/terms">Ketentuan</Link><a href="/#quote-builder">Mulai menghitung <ArrowUpRight size={14} /></a></div><p className="footer-note">Dibuat untuk langkah kecil usaha Anda.<br />Guest beta · data tetap di perangkat.</p></div></footer> }
function Home() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <HeroParallaxLayers />
        <div className="hero-shell">
          <HeroCopy />
          <QuoteBuilder />
        </div>
      </section>
      <MarketingSections />
    </>
  )
}
function NotFound() { return <div className="container legal-page"><span className="eyebrow">404</span><h1>Halaman tidak ditemukan.</h1><p>Alat hitung Anda tetap tersedia tanpa akun.</p><Link to="/" className="button button-primary">Kembali ke kalkulator</Link></div> }
function RouteEffects() {
  const { pathname } = useLocation()
  useEffect(() => { document.title = pathname === '/privacy' ? 'Privasi (draf) — QuoteKilat' : pathname === '/terms' ? 'Ketentuan (draf) — QuoteKilat' : 'QuoteKilat — Hitung tepat. Tawarkan cepat.'; window.scrollTo({ top: 0, behavior: 'instant' }) }, [pathname])
  return null
}
export function App() { return <><a className="skip-link" href="#main-content">Lewati ke konten</a><RouteEffects /><Navigation /><main id="main-content"><Routes><Route path="/" element={<Home />} /><Route path="/pricing" element={<><div className="container pricing-page-heading"><h1>Pilihan sederhana, tanpa hambatan.</h1><p>Guest aktif. Akun, Pro dan pembayaran belum tersedia.</p></div><PricingPlans /></>} /><Route path="/privacy" element={<LegalPage kind="privacy" />} /><Route path="/terms" element={<LegalPage kind="terms" />} /><Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="*" element={<NotFound />} /></Routes></main><Footer /></> }
