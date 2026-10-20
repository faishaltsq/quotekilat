import { z } from 'zod'

export const MAX_INPUT_CHARS = 1200
export const RATE_LIMIT_PER_HOUR = 10
const MAX_IDR = 1_000_000_000_000

const MAX_LABEL = 120
const MAX_NOTES = 400

const numberish = (max: number, min = 0) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value
    const cleaned = value.trim().replace(/^rp\.?\s*/i, '').replace(/[\s._]/g, '')
    if (!/^\d{1,15}$/.test(cleaned)) return value
    return Number(cleaned)
  }, z.number().int().min(min).max(max).nullish())

const decimalish = (max: number, min = 0) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value
    const cleaned = value.trim().replace(',', '.')
    if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(cleaned)) return value
    return Number(cleaned)
  }, z.number().min(min).max(max).nullish())

const textish = (max: number) => z.string().trim().min(1).max(max).nullish()

/** Every field the model is allowed to return. Anything else is dropped, not trusted. */
export const AI_FIELD_SCHEMAS = {
  title: textish(MAX_LABEL),
  quantity: numberish(1_000_000, 1),
  unitCost: numberish(MAX_IDR),
  additionalUnitCost: numberish(MAX_IDR),
  serviceHours: decimalish(10_000, 0.01),
  hourlyCost: numberish(MAX_IDR),
  subcontractorCost: numberish(MAX_IDR),
  materialCost: numberish(MAX_IDR),
  laborCost: numberish(MAX_IDR),
  finishingCost: numberish(MAX_IDR),
  wastePercent: decimalish(100),
  marginPercent: decimalish(95),
  notes: textish(MAX_NOTES),
} as const

export type AiFieldKey = keyof typeof AI_FIELD_SCHEMAS
export type AiFieldValue = string | number
export type AiFields = Partial<Record<AiFieldKey, AiFieldValue>>
export type AiMode = 'goods' | 'service' | 'custom'

export type ParsedQuote = {
  mode: AiMode | null
  fields: AiFields
  assumptions: string[]
  missing: string[]
  deadline: string | null
}

export type AiParseResult = ParsedQuote & {
  mock: boolean
  redactedCount: number
  remaining: number | null
  ignoredKeys: string[]
}

const fieldKeys = Object.keys(AI_FIELD_SCHEMAS) as AiFieldKey[]

/**
 * Validates each field on its own. One malformed value from the model must not
 * throw away an otherwise usable parse, and an unknown key is reported rather
 * than accepted.
 */
export function pickFields(raw: unknown): { fields: AiFields; ignoredKeys: string[] } {
  const fields: AiFields = {}
  const ignoredKeys: string[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { fields, ignoredKeys }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!fieldKeys.includes(key as AiFieldKey)) {
      ignoredKeys.push(key)
      continue
    }
    const parsed = AI_FIELD_SCHEMAS[key as AiFieldKey].safeParse(value)
    if (parsed.success && parsed.data !== null && parsed.data !== undefined) {
      fields[key as AiFieldKey] = parsed.data as AiFieldValue
    }
  }
  return { fields, ignoredKeys }
}

const modeSchema = z.enum(['goods', 'service', 'custom'])

const stringList = (maxItems: number, maxLength: number) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems).default([])

/** Shape returned by the API route, re-validated in the browser before use. */
export const aiParseResponseSchema = z
  .object({
    mock: z.boolean(),
    mode: modeSchema.nullable(),
    fields: z.record(z.string(), z.union([z.string(), z.number()])),
    assumptions: stringList(6, 180),
    missing: stringList(8, 80),
    deadline: z.string().trim().max(80).nullable(),
    redactedCount: z.number().int().min(0),
    remaining: z.number().int().min(0).nullable(),
  })
  .strict()

export type AiParsePayload = z.infer<typeof aiParseResponseSchema>

export function normalizePayload(payload: AiParsePayload): AiParseResult {
  const { fields, ignoredKeys } = pickFields(payload.fields)
  return {
    mode: payload.mode,
    fields,
    assumptions: payload.assumptions,
    missing: payload.missing,
    deadline: payload.deadline,
    mock: payload.mock,
    redactedCount: payload.redactedCount,
    remaining: payload.remaining,
    ignoredKeys,
  }
}
