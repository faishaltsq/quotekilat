import { describe, expect, it, vi } from 'vitest'
import {
  CloudError,
  deleteCloudQuote,
  fetchRemainingQuota,
  listCloudQuotes,
  saveQuoteToCloud,
  updateCloudQuoteStatus,
} from '../../src/lib/cloud/quotesApi'
import type { SaveQuotePayload } from '../../src/lib/cloud/quoteMapping'
import type { SupabaseClient } from '@supabase/supabase-js'

const KEY = 'aaaaaaaa-0000-4000-8000-000000000001'

const payload: SaveQuotePayload = {
  kind: 'goods',
  title: 'Hampers custom',
  items: [{ title: 'Hampers custom', quantity: 1 }],
  costBreakdown: { baseCost: 175000, roundedPrice: 250000, sellingFees: 0, belowTarget: false },
  targetMarginBps: 3000,
  computedPriceIdr: 250000,
  actualMarginBps: 3000,
  discountAmountIdr: 0,
  customerName: 'Budi',
  businessProfileId: null,
  idempotencyKey: KEY,
}

/** Minimal stub: only the surface quotesApi actually touches. */
function rpcStub(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null })
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

describe('saveQuoteToCloud', () => {
  it('passes the exact RPC argument names the migration declares', async () => {
    const { client, rpc } = rpcStub({ data: { id: 'q1' } })
    await saveQuoteToCloud(client, payload)
    expect(rpc).toHaveBeenCalledWith('save_quote', {
      p_kind: 'goods',
      p_title: 'Hampers custom',
      p_items: payload.items,
      p_cost_breakdown: payload.costBreakdown,
      p_target_margin_bps: 3000,
      p_computed_price_idr: 250000,
      p_actual_margin_bps: 3000,
      p_discount_amount_idr: 0,
      p_customer_name: 'Budi',
      p_business_profile_id: null,
      p_idempotency_key: KEY,
    })
  })

  it('surfaces QUOTA_EXCEEDED as a typed error', async () => {
    const { client } = rpcStub({ error: { message: 'QUOTA_EXCEEDED', code: 'P0001' } })
    await expect(saveQuoteToCloud(client, payload)).rejects.toMatchObject({
      name: 'CloudError',
      code: 'QUOTA_EXCEEDED',
    })
  })

  it('surfaces AUTH_REQUIRED as a typed error', async () => {
    const { client } = rpcStub({ error: { message: 'AUTH_REQUIRED', code: '28000' } })
    await expect(saveQuoteToCloud(client, payload)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  it('maps a constraint violation to INVALID_INPUT', async () => {
    const { client } = rpcStub({ error: { message: 'check constraint violated', code: '23514' } })
    await expect(saveQuoteToCloud(client, payload)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('maps an expired session to AUTH_REQUIRED', async () => {
    const { client } = rpcStub({ error: { message: 'JWT expired', code: 'PGRST301' } })
    await expect(saveQuoteToCloud(client, payload)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  it('falls back to INTERNAL_ERROR for an unknown failure', async () => {
    const { client } = rpcStub({ error: { message: 'boom', code: 'XX000' } })
    await expect(saveQuoteToCloud(client, payload)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
  })

  it('refuses to report success when the RPC returns no row', async () => {
    const { client } = rpcStub({ data: null })
    await expect(saveQuoteToCloud(client, payload)).rejects.toBeInstanceOf(CloudError)
  })
})

describe('listCloudQuotes', () => {
  function listStub(result: { data?: unknown; error?: unknown }) {
    const limit = vi.fn().mockReturnThis()
    const order = vi.fn().mockReturnThis()
    const lt = vi.fn().mockReturnThis()
    const select = vi.fn().mockReturnThis()
    const from = vi.fn().mockReturnValue({ select, order, limit, lt, then: undefined })
    // The builder is awaited, so it must be thenable.
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: (n: number) => {
        limit(n)
        return builder
      },
      lt: (column: string, value: string) => {
        lt(column, value)
        return builder
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: result.data ?? [], error: result.error ?? null }).then(resolve),
    }
    void from
    return { client: { from: () => builder } as unknown as SupabaseClient, limit, lt }
  }

  it('clamps the requested page size', async () => {
    const { client, limit } = listStub({ data: [] })
    await listCloudQuotes(client, { limit: 5000 })
    expect(limit).toHaveBeenCalledWith(100)
  })

  it('passes the cursor through to created_at', async () => {
    const { client, lt } = listStub({ data: [] })
    await listCloudQuotes(client, { before: '2026-10-01T00:00:00.000Z' })
    expect(lt).toHaveBeenCalledWith('created_at', '2026-10-01T00:00:00.000Z')
  })

  it('throws a typed error when the query fails', async () => {
    const { client } = listStub({ error: { message: 'nope', code: 'XX000' } })
    await expect(listCloudQuotes(client)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
  })
})

describe('updateCloudQuoteStatus', () => {
  it('updates only the given id', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq })
    const client = { from: () => ({ update }) } as unknown as SupabaseClient
    await updateCloudQuoteStatus(client, 'q1', 'sent')
    expect(update).toHaveBeenCalledWith({ status: 'sent' })
    expect(eq).toHaveBeenCalledWith('id', 'q1')
  })
})

describe('deleteCloudQuote', () => {
  it('reports that hard delete is unavailable instead of pretending it worked', async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: 'permission denied for table quotes', code: '42501' } })
    const del = vi.fn().mockReturnValue({ eq })
    const client = { from: () => ({ delete: del }) } as unknown as SupabaseClient
    await expect(deleteCloudQuote(client, 'q1')).rejects.toThrow(/belum tersedia/)
  })
})

describe('fetchRemainingQuota', () => {
  it('returns the number reported by the server', async () => {
    const { client } = rpcStub({ data: 4 })
    await expect(fetchRemainingQuota(client)).resolves.toBe(4)
  })

  it('returns null rather than guessing when the RPC fails', async () => {
    const { client } = rpcStub({ error: { message: 'boom' } })
    await expect(fetchRemainingQuota(client)).resolves.toBeNull()
  })
})
