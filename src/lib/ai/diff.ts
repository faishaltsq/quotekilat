import type { QuoteFormValues } from '../../features/quotation/defaults'
import type { AiFieldKey, AiFields, AiMode } from './schema'

export type Proposal = {
  field: keyof QuoteFormValues
  aiKey: AiFieldKey
  label: string
  current: string
  proposed: string
  /** Pre-checked only when the form field is still empty. */
  selected: boolean
}

export type ProposalSet = {
  proposals: Proposal[]
  /** Values the model returned that the current mode does not use. */
  ignored: AiFieldKey[]
  unchanged: AiFieldKey[]
}

const LABELS: Record<AiFieldKey, string> = {
  title: 'Nama item',
  quantity: 'Jumlah',
  unitCost: 'Biaya utama / unit',
  additionalUnitCost: 'Biaya tambahan / unit',
  serviceHours: 'Estimasi jam kerja',
  hourlyCost: 'Biaya internal / jam',
  subcontractorCost: 'Subkontraktor total',
  materialCost: 'Material / unit',
  laborCost: 'Tenaga kerja / unit',
  finishingCost: 'Finishing / unit',
  wastePercent: 'Waste material (%)',
  marginPercent: 'Target gross margin (%)',
  notes: 'Catatan',
}

const MODE_TARGETS: Record<AiMode, Partial<Record<AiFieldKey, keyof QuoteFormValues>>> = {
  goods: { title: 'goodsTitle', quantity: 'quantity', unitCost: 'unitCost', additionalUnitCost: 'additionalUnitCost' },
  service: { title: 'serviceTitle', serviceHours: 'serviceHours', hourlyCost: 'hourlyCost', subcontractorCost: 'subcontractorCost' },
  custom: {
    title: 'customTitle',
    quantity: 'customQuantity',
    materialCost: 'materialCost',
    laborCost: 'laborCost',
    finishingCost: 'finishingCost',
    wastePercent: 'wastePercent',
  },
}

const SHARED_TARGETS: Partial<Record<AiFieldKey, keyof QuoteFormValues>> = {
  marginPercent: 'marginPercent',
  notes: 'notes',
}

const keysOf = (fields: AiFields) =>
  (Object.keys(fields) as AiFieldKey[]).filter((key) => fields[key] !== undefined && fields[key] !== null)

export function buildProposals(values: QuoteFormValues, fields: AiFields, mode: AiMode): ProposalSet {
  const targets = { ...MODE_TARGETS[mode], ...SHARED_TARGETS }
  const proposals: Proposal[] = []
  const ignored: AiFieldKey[] = []
  const unchanged: AiFieldKey[] = []
  for (const aiKey of keysOf(fields)) {
    const target = targets[aiKey]
    if (!target) {
      ignored.push(aiKey)
      continue
    }
    const proposed = String(fields[aiKey])
    const current = String(values[target] ?? '')
    if (proposed === current.trim()) {
      unchanged.push(aiKey)
      continue
    }
    proposals.push({ field: target, aiKey, label: LABELS[aiKey], current, proposed, selected: current.trim() === '' })
  }
  return { proposals, ignored, unchanged }
}

/** Applies only the rows the user left ticked. Untouched fields keep their value. */
export function applyProposals(values: QuoteFormValues, proposals: Proposal[]): QuoteFormValues {
  // Written through a plain record: QuoteFormValues narrows mode and discountType
  // to literal unions, so a direct index assignment collapses to never.
  const next: Record<string, unknown> = { ...values }
  for (const proposal of proposals) {
    if (proposal.selected) next[proposal.field] = proposal.proposed
  }
  return next as unknown as QuoteFormValues
}

export function toggleProposal(proposal: Proposal): Proposal {
  return { ...proposal, selected: !proposal.selected }
}
