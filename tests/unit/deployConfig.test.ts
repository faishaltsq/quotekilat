import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
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

  it('leaves /api/* to the functions instead of the SPA fallback', () => {
    // A POST to a rewritten path answers 405, so a rewrite covering /api would
    // swallow the Smart Input endpoint and look like a provider outage.
    const source = String((vercel.rewrites as { source: string }[])[0].source)
    expect(source).toContain('(?!api/)')
    const pattern = new RegExp(`^${source}$`)
    expect(pattern.test('/api/ai/parse')).toBe(false)
    expect(pattern.test('/pricing')).toBe(true)
  })

  it('gives the AI route room to fail and refund before the platform kills it', () => {
    expect(JSON.stringify(vercel.functions)).toContain('maxDuration')
  })

  it('caches hashed assets immutably', () => {
    expect(JSON.stringify(vercel.headers)).toContain('immutable')
  })
})

/**
 * The Smart Input route needs secrets the browser must never hold. These
 * assertions encode that split: server code reads process.env only, the client
 * env template carries no AI credentials, and the server template documents them.
 */
describe('phase 3 secret boundary', () => {
  const serverFiles = ['server/ai/parse.ts', 'server/_lib/provider.ts', 'server/_lib/supabase.ts']

  it('server code never reads a VITE_ variable', () => {
    for (const file of serverFiles) {
      expect(read(file)).not.toMatch(/process\.env\.VITE_|import\.meta\.env/)
    }
  })

  it('client env template carries no AI credentials', () => {
    const example = read('.env.example')
    expect(example).not.toContain('AI_API_KEY')
    expect(example).not.toMatch(/AI_BASE_URL\s*=\s*\S/)
    expect(example).toMatch(/VITE_FEATURE_AI_PARSE=false/)
  })

  it('documents the server-only variables separately and keeps them out of git ignore', () => {
    const server = read('.env.server.example')
    expect(server).toContain('AI_API_KEY')
    expect(server).toContain('SUPABASE_PUBLISHABLE_KEY')
    expect(server).not.toMatch(/^VITE_/m)
    expect(read('.gitignore')).toContain('!.env.server.example')
  })

  it('client code never names the server model key', () => {
    const client = read('src/lib/ai/client.ts')
    expect(client).not.toContain('AI_API_KEY')
    expect(client).not.toContain('AI_BASE_URL')
  })

  it('the API route rejects the service-role secret key', () => {
    expect(read('server/_lib/supabase.ts')).toContain("startsWith('sb_secret_')")
  })

  it('the payment gateway keys are documented server-side only', () => {
    const server = read('.env.server.example')
    expect(server).toContain('KLIKQRIS_API_KEY')
    expect(server).toContain('KLIKQRIS_MERCHANT_ID')
    expect(server).not.toContain('MIDTRANS_SERVER_KEY')
  })

  it('the service-role key is documented server-side only', () => {
    expect(read('.env.server.example')).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(read('.env.example')).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(read('.env.example')).not.toContain('KLIKQRIS_API_KEY')
  })

  it('server code never inlines a VITE_ payment key', () => {
    for (const file of ['server/_lib/qris.ts', 'server/billing/checkout.ts', 'server/billing/qrisWebhook.ts']) {
      expect(read(file)).not.toMatch(/process\.env\.VITE_|import\.meta\.env/)
    }
  })
})

/**
 * The platform generates /var/task/package.json from the app root, which
 * declares "type": "module". A .js entry under api/ is therefore loaded as an
 * ES module and dies with "require is not defined in ES module scope" — a 500
 * that is invisible locally. A .cjs entry is CommonJS regardless of
 * package.json, so every route is committed with that extension. These
 * assertions enumerate api/ rather than naming one file, because the earlier
 * single-file guard stayed green while five later routes shipped broken.
 */
describe('api function module format', () => {
  const vercel = JSON.parse(read('vercel.json')) as { functions: Record<string, unknown> }
  const entries = readdirSync(resolve(root, 'api'), { recursive: true })
    .map((file) => `api/${String(file)}`.split(String.fromCharCode(92)).join('/'))
    .filter((file) => /\.(js|cjs|mjs)$/.test(file))
    .sort()

  it('routes the function glob at the .js entry, not the TypeScript source', () => {
    const patterns = Object.keys(vercel.functions)
    expect(patterns).toContain('api/**/*.js')
    expect(patterns.some((pattern) => pattern.endsWith('.ts'))).toBe(false)
  })

  it('covers every route actually deployed', () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  it.each(entries)('%s is an ES module re-exporting the compiled build', (entry) => {
    const source = read(entry)
    expect(entry.endsWith('.js')).toBe(true)
    expect(source).toContain("from '../../vercel-api/server/")
    expect(source).toMatch(/^export default /m)
    expect(source).not.toContain('module.exports')
    expect(source).not.toMatch(/^\s*require\(/m)
  })

  it('the api tsconfig emits CommonJS outside the app build', () => {
    const apiTs = read('tsconfig.api.json')
    expect(apiTs).toContain('"module": "commonjs"')
    expect(apiTs).toContain('"outDir": "vercel-api"')
    expect(apiTs).not.toContain('"noEmit": true')
  })

  it('the build marks the emitted tree as CommonJS and runs before deploy', () => {
    const script = read('scripts/build-api.mjs')
    expect(script).toContain("type: 'commonjs'")
    expect(JSON.parse(read('package.json')).scripts.build).toContain('scripts/build-api.mjs')
  })
})
