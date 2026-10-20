import { describe, expect, it } from 'vitest'
import { readCloudConfig } from '../../src/lib/cloud/client'

const URL_OK = 'https://abcdefghijklmnop.supabase.co'

describe('readCloudConfig', () => {
  it('returns null when the cloud is not configured', () => {
    expect(readCloudConfig({})).toBeNull()
    expect(readCloudConfig({ VITE_SUPABASE_URL: URL_OK })).toBeNull()
    expect(readCloudConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' })).toBeNull()
  })

  it('accepts a supabase.co URL with a publishable key', () => {
    expect(
      readCloudConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }),
    ).toEqual({ url: URL_OK, publishableKey: 'sb_publishable_x' })
  })

  it('rejects a non-supabase host so a typo cannot point auth at an arbitrary origin', () => {
    expect(
      readCloudConfig({
        VITE_SUPABASE_URL: 'https://evil.example.com',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
      }),
    ).toBeNull()
  })

  it('rejects a plaintext http URL', () => {
    expect(
      readCloudConfig({
        VITE_SUPABASE_URL: 'http://abcdefghijklmnop.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
      }),
    ).toBeNull()
  })

  it('refuses a secret key outright instead of shipping it to the browser', () => {
    expect(() =>
      readCloudConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' }),
    ).toThrow(/rahasia/)
  })

  it('trims surrounding whitespace', () => {
    expect(
      readCloudConfig({
        VITE_SUPABASE_URL: `  ${URL_OK}  `,
        VITE_SUPABASE_PUBLISHABLE_KEY: '  sb_publishable_x  ',
      }),
    ).toEqual({ url: URL_OK, publishableKey: 'sb_publishable_x' })
  })
})
