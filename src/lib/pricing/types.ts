export type QuoteMode = 'goods' | 'service' | 'custom'

/** Monetary inputs are whole IDR. Rates are integer basis points (100 = 1%). */
export type PricingInput = {
  mode: QuoteMode
  quantity: number
  unitCost: number
  additionalUnitCost: number
  fixedCosts: number
  fixedFee: number
  feeBps: number
  marginBps: number
  rounding: 100 | 500 | 1000
  /** A percent value is a percentage, e.g. 10 means 10%, with at most 2 decimals. */
  discount: { type: 'percent' | 'fixed'; value: number }
  serviceHours: number
  hourlyCost: number
  subcontractorCost: number
  materialCost: number
  laborCost: number
  finishingCost: number
  wasteBps: number
}

export type PricingResult = {
  baseCost: number
  /** The exact formula rounded up to the next whole rupiah, before increment rounding. */
  minimumPrice: number
  roundedPrice: number
  discountAmount: number
  finalPrice: number
  sellingFees: number
  profit: number
  /** May be fractional; null when finalPrice is zero. */
  actualMarginBps: number | null
  belowTarget: boolean
  /** An average per unit; may be fractional. A service order always has one unit. */
  unitPrice: number
  costLines: { label: string; amount: number }[]
}
