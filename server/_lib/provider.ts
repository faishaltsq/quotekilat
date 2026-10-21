import { z } from 'zod'
import { timeoutSignal } from './net'
import { pickFields, type AiMode } from '../../src/lib/ai/schema'

export type ProviderEnv = { baseUrl?: string; apiKey?: string; model?: string; reasoningEffort?: string }

export type ModelPayload = {
  mode: AiMode | null
  fields: Record<string, string | number>
  assumptions: string[]
  missing: string[]
  deadline: string | null
}

export type ProviderResult = { mock: boolean; payload: ModelPayload }

export class ProviderError extends Error {
  constructor(readonly kind: 'timeout' | 'network' | 'status' | 'shape', message: string) {
    super(message)
    this.name = 'ProviderError'
  }
}

const MOCK_PAYLOAD: ModelPayload = {
  mode: null,
  fields: {},
  assumptions: ['Smart Input belum aktif: kunci model belum dipasang di server. Tidak ada angka yang ditebak.'],
  missing: ['Semua biaya dan jumlah'],
  deadline: null,
}

export function readProviderEnv(env: NodeJS.ProcessEnv = process.env): ProviderEnv {
  return {
    baseUrl: env.AI_BASE_URL?.trim() || undefined,
    apiKey: env.AI_API_KEY?.trim() || undefined,
    model: env.AI_MODEL?.trim() || undefined,
    reasoningEffort: env.AI_REASONING_EFFORT?.trim() || undefined,
  }
}

export const isConfigured = (env: ProviderEnv): boolean =>
  Boolean(env.baseUrl && env.apiKey && env.model)

const SYSTEM_PROMPT = `Kamu mengubah catatan singkat penjual Indonesia menjadi data penawaran terstruktur.

Balas HANYA satu objek JSON, tanpa penjelasan, dengan bentuk:
{"mode":"goods"|"service"|"custom"|null,"fields":{},"assumptions":[],"missing":[],"deadline":null}

Aturan fields (semua opsional, hilangkan kunci yang tidak diisi):
- title: nama produk/layanan/pesanan, singkat.
- quantity: jumlah unit (bilangan bulat >= 1).
- unitCost: biaya ANDA per unit, bukan harga jual.
- additionalUnitCost: biaya tambahan per unit (kemasan, ongkir per unit).
- serviceHours: estimasi jam kerja.
- hourlyCost: biaya internal per jam.
- subcontractorCost: total biaya subkontraktor.
- materialCost, laborCost, finishingCost: biaya per unit untuk pesanan custom.
- wastePercent: persen waste material.
- marginPercent: target gross margin dalam persen, HANYA jika disebut.
- notes: syarat atau catatan tambahan yang disebut.

Aturan keras:
- Isi field HANYA jika angkanya disebut eksplisit. JANGAN menebak, JANGAN mengarang, JANGAN memakai angka contoh.
- Harga jual ke pelanggan BUKAN unitCost. Jika hanya harga jual yang disebut, kosongkan biaya dan masukkan ke "missing".
- "250rb", "250 ribu", "250k" berarti 250000. Tulis rupiah bulat tanpa titik atau koma.
- Jangan pernah memasukkan nama orang, email, atau nomor telepon ke fields.
- "assumptions": maksimal 6 poin singkat tentang hal yang kamu asumsikan.
- "missing": maksimal 8 poin data biaya penting yang tidak disebut.
- "deadline": tenggat yang disebut, apa adanya, atau null.
- Jika teks tidak memuat angka biaya sama sekali, biarkan fields kosong dan isi missing.`

const modelJsonSchema = z
  .object({
    mode: z.enum(['goods', 'service', 'custom']).nullish(),
    fields: z.record(z.string(), z.unknown()).optional(),
    assumptions: z.array(z.string()).optional(),
    missing: z.array(z.string()).optional(),
    deadline: z.string().nullish(),
  })
  .passthrough()

const cleanList = (items: string[] | undefined, max: number, maxLength: number): string[] =>
  (items ?? [])
    .map((item) => item.trim().slice(0, maxLength))
    .filter((item) => item.length > 0)
    .slice(0, max)

function jsonFromContent(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced ? fenced[1] : content).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) throw new ProviderError('shape', 'Model tidak mengembalikan JSON.')
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    throw new ProviderError('shape', 'JSON dari model tidak bisa dibaca.')
  }
}

export async function callProvider(
  text: string,
  env: ProviderEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderResult> {
  if (!isConfigured(env)) return { mock: true, payload: MOCK_PAYLOAD }

  let response: Response
  try {
    response = await fetchImpl(`${env.baseUrl!.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.apiKey}` },
      body: JSON.stringify({
        model: env.model,
        temperature: 0,
        // Reasoning models spend this budget on hidden reasoning tokens before
        // emitting the JSON answer. A tight cap (700) exhausts the budget during
        // reasoning and returns empty content with finish_reason "length".
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        // DeepSeek-style effort knob: lower effort means far fewer reasoning
        // tokens, which is what keeps a 1200-char parse inside the function budget.
        ...(env.reasoningEffort ? { reasoning_effort: env.reasoningEffort } : {}),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
      // Must stay well under the function's maxDuration (30s in vercel.json): a
      // platform kill would return before the handler can refund the spent parse.
      signal: timeoutSignal(22_000),
    })
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    throw new ProviderError(timeout ? 'timeout' : 'network', timeout ? 'Model timeout.' : 'Tidak bisa menghubungi model.')
  }

  if (!response.ok) throw new ProviderError('status', `Model membalas ${response.status}.`)

  const body = (await response.json().catch(() => null)) as
    | { choices?: { message?: { content?: string } }[] }
    | null
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new ProviderError('shape', 'Model membalas kosong.')

  const parsed = modelJsonSchema.safeParse(jsonFromContent(content))
  if (!parsed.success) throw new ProviderError('shape', 'Bentuk JSON dari model tidak sesuai.')

  const { fields } = pickFields(parsed.data.fields)
  return {
    mock: false,
    payload: {
      mode: parsed.data.mode ?? null,
      fields: fields as Record<string, string | number>,
      assumptions: cleanList(parsed.data.assumptions, 6, 180),
      missing: cleanList(parsed.data.missing, 8, 80),
      deadline: parsed.data.deadline?.trim().slice(0, 80) || null,
    },
  }
}
