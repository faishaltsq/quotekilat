import { describe, expect, it } from 'vitest'
import { applyProposals, buildProposals, toggleProposal } from '../../src/lib/ai/diff'
import { blankValues, type QuoteFormValues } from '../../src/features/quotation/defaults'

const blank = (): QuoteFormValues => blankValues()

describe('buildProposals', () => {
  it('maps goods fields to the form and pre-ticks empty inputs only', () => {
    const empty = { ...blank(), goodsTitle: '', quantity: '', unitCost: '', additionalUnitCost: '' }
    const { proposals } = buildProposals(empty, { title: 'Hampers', quantity: 25, unitCost: 60000 }, 'goods')
    const byField = Object.fromEntries(proposals.map((proposal) => [proposal.field, proposal]))
    expect(byField.goodsTitle.selected).toBe(true)
    expect(byField.quantity.selected).toBe(true)
    expect(byField.unitCost.selected).toBe(true)
    expect(byField.goodsTitle.proposed).toBe('Hampers')
    expect(byField.quantity.proposed).toBe('25')
    expect(byField.unitCost.proposed).toBe('60000')
  })

  it('prefilled values are proposed but not ticked', () => {
    const values = { ...blank(), unitCost: '0' }
    const { proposals } = buildProposals(values, { unitCost: 60000 }, 'goods')
    expect(proposals[0].selected).toBe(false)
  })

  it('never overwrites a value the user typed differently without a tick', () => {
    const values = { ...blank(), unitCost: '50000' }
    const { proposals } = buildProposals(values, { unitCost: 60000 }, 'goods')
    expect(proposals).toHaveLength(1)
    expect(proposals[0].selected).toBe(false)
    expect(proposals[0].current).toBe('50000')
  })

  it('drops fields whose proposed value is already there', () => {
    const values = { ...blank(), unitCost: '60000' }
    const { proposals, unchanged } = buildProposals(values, { unitCost: 60000 }, 'goods')
    expect(proposals).toHaveLength(0)
    expect(unchanged).toEqual(['unitCost'])
  })

  it('reports costs that belong to a different mode instead of writing them', () => {
    const { proposals, ignored } = buildProposals(blank(), { unitCost: 60000, hourlyCost: 75000, title: 'Cuci AC' }, 'service')
    expect(ignored).toEqual(['unitCost'])
    expect(proposals.map((proposal) => proposal.field).sort()).toEqual(['hourlyCost', 'serviceTitle'])
  })

  it('keeps a goods cost out of a service quote and vice versa', () => {
    expect(buildProposals(blank(), { materialCost: 100000 }, 'goods').ignored).toEqual(['materialCost'])
    expect(buildProposals(blank(), { unitCost: 100000 }, 'custom').ignored).toEqual(['unitCost'])
  })

  it('maps custom mode and its shared fields', () => {
    const { proposals } = buildProposals(
      blank(),
      { title: 'Meja', quantity: 3, materialCost: 100000, laborCost: 50000, finishingCost: 25000, wastePercent: 5, marginPercent: 35 },
      'custom',
    )
    const fields = proposals.map((proposal) => proposal.field).sort()
    expect(fields).toEqual(
      ['customQuantity', 'customTitle', 'finishingCost', 'laborCost', 'marginPercent', 'materialCost', 'wastePercent'].sort(),
    )
  })
})

describe('applyProposals', () => {
  it('writes only the ticked rows', () => {
    const values = blank()
    const { proposals } = buildProposals(values, { title: 'Hampers', unitCost: 60000 }, 'goods')
    // Title is empty so it arrives ticked; unitCost already holds "0" so the user
    // must tick it deliberately.
    const next = applyProposals(values, proposals)
    expect(next.goodsTitle).toBe('Hampers')
    expect(next.unitCost).toBe('0')

    const forced = applyProposals(values, proposals.map((proposal) => (proposal.field === 'unitCost' ? toggleProposal(proposal) : proposal)))
    expect(forced.unitCost).toBe('60000')
  })

  it('leaves the original object untouched', () => {
    const values = blank()
    const { proposals } = buildProposals(values, { unitCost: 60000 }, 'goods')
    applyProposals(values, proposals)
    expect(values.unitCost).toBe('0')
  })

  it('keeps every field the model did not mention', () => {
    const values = { ...blank(), fixedCosts: '5000', customerName: 'Budi' }
    const { proposals } = buildProposals(values, { unitCost: 60000 }, 'goods')
    const next = applyProposals(values, proposals)
    expect(next.fixedCosts).toBe('5000')
    expect(next.customerName).toBe('Budi')
  })
})
