import type { SupabaseClient } from '@supabase/supabase-js'
import type { CloudQuote, SaveQuotePayload } from './quoteMapping'

/** Errors the UI distinguishes; anything else is surfaced as a generic failure. */
export type CloudErrorCode = 'AUTH_REQUIRED' | 'QUOTA_EXCEEDED' | 'INVALID_INPUT' | 'NETWORK' | 'INTERNAL_ERROR'

export class CloudError extends Error {
  readonly code: CloudErrorCode
  constructor(code: CloudErrorCode, message: string) {
    super(message)
    this.name = 'CloudError'
    this.code = code
  }
}

/**
 * The RPC raises with `raise exception 'QUOTA_EXCEEDED'`, so the message text is
 * the only stable discriminator — Postgres maps it to P0001, shared with every
 * other plpgsql raise in the function.
 */
function toCloudError(error: { message?: string; code?: string } | null): CloudError {
  const message = error?.message ?? ''
  if (message.includes('QUOTA_EXCEEDED')) {
    return new CloudError('QUOTA_EXCEEDED', 'Kuota penyimpanan cloud bulan ini sudah habis.')
  }
  if (message.includes('AUTH_REQUIRED')) {
    return new CloudError('AUTH_REQUIRED', 'Masuk dulu untuk menyimpan ke cloud.')
  }
  if (message.includes('INVALID_INPUT') || error?.code === '23514' || error?.code === '23503') {
    return new CloudError('INVALID_INPUT', 'Data penawaran tidak valid.')
  }
  if (error?.code === 'PGRST301' || error?.code === '401') {
    return new CloudError('AUTH_REQUIRED', 'Sesi sudah berakhir. Masuk ulang.')
  }
  return new CloudError('INTERNAL_ERROR', 'Gagal menyimpan ke cloud. Coba lagi.')
}

const SAVE_QUOTE_RPC = 'save_quote'

export async function saveQuoteToCloud(
  supabase: SupabaseClient,
  payload: SaveQuotePayload,
): Promise<CloudQuote> {
  const { data, error } = await supabase.rpc(SAVE_QUOTE_RPC, {
    p_kind: payload.kind,
    p_title: payload.title,
    p_items: payload.items,
    p_cost_breakdown: payload.costBreakdown,
    p_target_margin_bps: payload.targetMarginBps,
    p_computed_price_idr: payload.computedPriceIdr,
    p_actual_margin_bps: payload.actualMarginBps,
    p_discount_amount_idr: payload.discountAmountIdr,
    p_customer_name: payload.customerName,
    p_business_profile_id: payload.businessProfileId,
    p_idempotency_key: payload.idempotencyKey,
  })
  if (error) throw toCloudError(error)
  if (!data) throw new CloudError('INTERNAL_ERROR', 'Cloud tidak mengembalikan penawaran.')
  return data as CloudQuote
}

export async function listCloudQuotes(
  supabase: SupabaseClient,
  options: { limit?: number; before?: string } = {},
): Promise<CloudQuote[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100)
  let query = supabase
    .from('quotes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (options.before) query = query.lt('created_at', options.before)
  const { data, error } = await query
  if (error) throw toCloudError(error)
  return (data ?? []) as CloudQuote[]
}

export async function updateCloudQuoteStatus(
  supabase: SupabaseClient,
  id: string,
  status: CloudQuote['status'],
): Promise<void> {
  const { error } = await supabase.from('quotes').update({ status }).eq('id', id)
  if (error) throw toCloudError(error)
}

export async function deleteCloudQuote(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('quotes').delete().eq('id', id)
  if (error) {
    // DELETE is not granted to `authenticated`; deletion goes through status.
    if (error.code === '42501' || error.message.includes('permission denied')) {
      throw new CloudError('INTERNAL_ERROR', 'Hapus permanen belum tersedia untuk akun.')
    }
    throw toCloudError(error)
  }
}

export async function fetchRemainingQuota(supabase: SupabaseClient): Promise<number | null> {
  const { data, error } = await supabase.rpc('remaining_quota')
  if (error) return null
  return typeof data === 'number' ? data : null
}
