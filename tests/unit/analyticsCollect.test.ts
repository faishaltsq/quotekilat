import { describe, expect, it, vi } from 'vitest'
import { handleCollect, type CollectDeps } from '../../server/analytics/collect'

const makeDeps = (rpc?: () => { ok: boolean; status: number; body: unknown }): CollectDeps => {
  const fetchImpl = vi.fn(async () =>
    ({ ok: true, status: 200, json: async () => rpc?.() ?? { ok: true, status: 200, body: null } }) as Response,
  ) as unknown as typeof fetch
  return { fetch: fetchImpl, env: {} as NodeJS.ProcessEnv, config: null }
}

describe('handleCollect', () => {
  it('accepts an allowed event and answers 204 without a database', async () => {
    const outcome = await handleCollect(
      { body: { name: 'quote_completed', props: { mode: 'goods' }, ts: new Date().toISOString() }, bytes: 80 },
      makeDeps(),
    )
    expect(outcome.status).toBe(204)
  })

  it('rejects an unknown event name', async () => {
    const outcome = await handleCollect({ body: { name: 'customer_email', props: {} }, bytes: 40 }, makeDeps())
    expect(outcome.status).toBe(422)
  })

  it('rejects a property key outside the allow list', async () => {
    const outcome = await handleCollect(
      { body: { name: 'quote_completed', props: { customerName: 'Budi' } }, bytes: 60 },
      makeDeps(),
    )
    expect(outcome.status).toBe(422)
  })

  it('rejects an oversized body', async () => {
    const outcome = await handleCollect({ body: { name: 'quote_completed', props: {} }, bytes: 5000 }, makeDeps())
    expect(outcome.status).toBe(413)
  })
})
