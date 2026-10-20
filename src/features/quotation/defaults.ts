export const DEFAULT_VALUES = {
  mode: 'goods' as 'goods' | 'service' | 'custom',
  goodsTitle: 'Hampers custom', serviceTitle: 'Desain identitas usaha', customTitle: 'Pesanan custom',
  quantity: '1', customQuantity: '1', unitCost: '150000', additionalUnitCost: '25000',
  serviceHours: '10', hourlyCost: '75000', subcontractorCost: '0',
  materialCost: '100000', laborCost: '50000', finishingCost: '25000', wastePercent: '0',
  fixedCosts: '0', fixedFee: '0', feePercent: '0', marginPercent: '30', rounding: '1000',
  discountType: 'percent' as 'percent' | 'fixed', discountValue: '0',
  businessName: '', customerName: '', notes: '', validDays: '7', persistPersonal: false,
}
export type QuoteFormValues = typeof DEFAULT_VALUES
export function blankValues(): QuoteFormValues {
  return { ...DEFAULT_VALUES, goodsTitle: '', serviceTitle: '', customTitle: '', unitCost: '0', additionalUnitCost: '0', serviceHours: '1', hourlyCost: '0', materialCost: '0', laborCost: '0', finishingCost: '0' }
}
