import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

/**
 * Hosting headers are not applied by the Vite preview server, so a CSP mistake
 * only shows up in production — exactly how the inlined-font block reached the
 * live site. These assertions catch that class of regression before deploy.
 */
describe('production CSP', () => {
  const vercel = JSON.parse(read('vercel.json')) as {
    headers: { source: string; headers: { key: string; value: string }[] }[]
  }
  const csp = vercel.headers
    .flatMap((entry) => entry.headers)
    .find((header) => header.key === 'Content-Security-Policy')?.value

  it('is present in vercel.json', () => {
    expect(csp).toBeTruthy()
  })

  it('allows the Supabase REST and realtime origins the client needs', () => {
    expect(csp).toContain('https://*.supabase.co')
    expect(csp).toContain('wss://*.supabase.co')
  })

  it('allows data: fonts because Vite inlines small woff2 subsets', () => {
    expect(csp).toMatch(/font-src[^;]*data:/)
  })

  it('keeps script-src locked to self with no unsafe-inline or unsafe-eval', () => {
    const scriptSrc = csp?.split(';').map((part) => part.trim()).find((part) => part.startsWith('script-src'))
    expect(scriptSrc).toBe("script-src 'self'")
  })

  it('keeps object-src and frame-ancestors locked down', () => {
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it('does not allow arbitrary https origins for connections', () => {
    expect(csp).not.toMatch(/connect-src[^;]*\shttps:\s*;/)
    expect(csp).not.toContain('connect-src *')
  })

  it('keeps the Cloudflare _headers copy in step with vercel.json', () => {
    const headers = read('public/_headers')
    expect(headers).toContain('https://*.supabase.co')
    expect(headers).toMatch(/font-src[^;]*data:/)
    expect(headers).toContain("object-src 'none'")
  })
})

describe('deployment config', () => {
  const vercel = JSON.parse(read('vercel.json')) as Record<string, unknown>

  it('builds with devDependencies available so TypeScript exists at build time', () => {
    expect(String(vercel.installCommand)).toContain('NODE_ENV=development')
  })

  it('serves the SPA fallback for client routes', () => {
    expect(JSON.stringify(vercel.rewrites)).toContain('/index.html')
  })

  it('caches hashed assets immutably', () => {
    expect(JSON.stringify(vercel.headers)).toContain('immutable')
  })
})
