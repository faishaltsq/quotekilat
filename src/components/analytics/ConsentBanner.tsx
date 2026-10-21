import { useState } from 'react'
import { readConsent, writeConsent } from '../../lib/analytics/consent'
import './consent.css'

/**
 * No event is sent before an explicit choice. Denying is as easy as granting,
 * and the banner never reappears once a choice exists.
 */
export function ConsentBanner() {
  const [choice, setChoice] = useState(readConsent)

  if (choice !== 'unset') return null

  const decide = (value: 'granted' | 'denied') => {
    writeConsent(value)
    setChoice(value)
  }

  return (
    <div className="consent-banner" role="region" aria-label="Pilihan analitik">
      <p>
        Boleh QuoteKilat mencatat statistik pemakaian tanpa data pribadi? Isi penawaran, biaya,
        dan nama pelanggan tidak pernah dikirim.
      </p>
      <div className="consent-actions">
        <button type="button" className="button button-secondary" onClick={() => decide('denied')}>Tidak</button>
        <button type="button" className="button button-primary" onClick={() => decide('granted')}>Boleh</button>
      </div>
    </div>
  )
}
