export const CONSENT_KEY = 'quotekilat:analytics-consent:v1'
export type Consent = 'granted' | 'denied' | 'unset'

export function readConsent(): Consent {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    return raw === 'granted' || raw === 'denied' ? raw : 'unset'
  } catch {
    return 'unset'
  }
}

export function writeConsent(value: Exclude<Consent, 'unset'>): boolean {
  try {
    localStorage.setItem(CONSENT_KEY, value)
    return true
  } catch {
    return false
  }
}
