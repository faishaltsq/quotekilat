import type { PricingInput, PricingResult } from './types'

const MAX_INPUT_IDR = 1_000_000_000_000
const MAX_TOTAL_IDR = 100_000_000_000_000n

function requireSafeTotal(value: bigint): void {
  if (value > MAX_TOTAL_IDR || value < -MAX_TOTAL_IDR) {
    throw new RangeError('Total penawaran melampaui batas aman Rp100.000.000.000.000; kurangi biaya, jumlah, margin, atau fee.')
  }
}

function requireInteger(value: number, label: string, min = 0, max = MAX_INPUT_IDR): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} harus berupa bilangan bulat antara ${min.toLocaleString('id-ID')} dan ${max.toLocaleString('id-ID')}.`)
  }
}

function requireHundredths(value: number, label: string, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max || !/^\d+(?:\.\d{1,2})?$/.test(value.toString())) {
    throw new RangeError(`${label} harus berupa angka antara ${min.toLocaleString('id-ID')} dan ${max.toLocaleString('id-ID')} dengan maksimal dua desimal.`)
  }
}

function validateInput(input: PricingInput): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RangeError('Input penawaran tidak valid.')
  }
  if (!['goods', 'service', 'custom'].includes(input.mode)) {
    throw new RangeError('Mode penawaran tidak valid; pilih barang, jasa, atau custom.')
  }

  requireInteger(input.quantity, 'Jumlah', 1, 1_000_000)
  requireInteger(input.fixedCosts, 'Biaya tetap pesanan')
  requireInteger(input.fixedFee, 'Fee tetap')
  requireInteger(input.feeBps, 'Fee penjualan', 0, 9_900)
  requireInteger(input.marginBps, 'Margin target', 0, 8_000)
  if (![100, 500, 1000].includes(input.rounding)) {
    throw new RangeError('Pembulatan harus dipilih dari Rp100, Rp500, atau Rp1.000.')
  }
  if (BigInt(input.feeBps) + BigInt(input.marginBps) >= 10_000n) {
    throw new RangeError('Jumlah margin target dan fee penjualan harus kurang dari 100%.')
  }

  if (!input.discount || !['percent', 'fixed'].includes(input.discount.type)) {
    throw new RangeError('Jenis diskon tidak valid; pilih persen atau nominal.')
  }
  if (input.discount.type === 'percent') {
    requireHundredths(input.discount.value, 'Diskon persen', 0, 100)
  } else {
    requireInteger(input.discount.value, 'Diskon nominal')
  }

  switch (input.mode) {
    case 'goods':
      requireInteger(input.unitCost, 'Biaya barang')
      requireInteger(input.additionalUnitCost, 'Biaya tambahan')
      break
    case 'service':
      requireHundredths(input.serviceHours, 'Jam jasa', 0.01, 1_000_000)
      requireInteger(input.hourlyCost, 'Biaya per jam')
      requireInteger(input.subcontractorCost, 'Biaya subkontraktor')
      break
    case 'custom':
      requireInteger(input.materialCost, 'Biaya material')
      requireInteger(input.laborCost, 'Biaya tenaga kerja')
      requireInteger(input.finishingCost, 'Biaya finishing')
      requireInteger(input.wasteBps, 'Waste material', 0, 10_000)
      break
  }
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator
}

function hundredths(value: number): bigint {
  const [whole, fraction = ''] = value.toString().split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export function calculatePricing(input: PricingInput): PricingResult {
  validateInput(input)
  const quantity = input.mode === 'service' ? 1n : BigInt(input.quantity)
  const fixed = BigInt(input.fixedCosts)
  const costLines = input.mode === 'service'
    ? [
      { label: 'Tenaga kerja jasa', amount: ceilDivide(hundredths(input.serviceHours) * BigInt(input.hourlyCost), 100n) },
      { label: 'Subkontraktor', amount: BigInt(input.subcontractorCost) },
      { label: 'Biaya tetap pesanan', amount: fixed },
    ]
    : input.mode === 'custom'
      ? [
        { label: 'Material', amount: BigInt(input.materialCost) * quantity },
        { label: 'Waste material', amount: ceilDivide(BigInt(input.materialCost) * BigInt(input.wasteBps), 10_000n) * quantity },
        { label: 'Tenaga kerja custom', amount: BigInt(input.laborCost) * quantity },
        { label: 'Finishing', amount: BigInt(input.finishingCost) * quantity },
        { label: 'Biaya tetap pesanan', amount: fixed },
      ]
      : [
        { label: 'Biaya barang', amount: BigInt(input.unitCost) * quantity },
        { label: 'Biaya tambahan', amount: BigInt(input.additionalUnitCost) * quantity },
        { label: 'Biaya tetap pesanan', amount: fixed },
      ]
  const baseCost = costLines.reduce((sum, line) => sum + line.amount, 0n)
  const fixedFee = BigInt(input.fixedFee)
  requireSafeTotal(baseCost)
  requireSafeTotal(baseCost + fixedFee)
  const minimumPrice = ceilDivide((baseCost + fixedFee) * 10_000n, 10_000n - BigInt(input.feeBps) - BigInt(input.marginBps))
  requireSafeTotal(minimumPrice)
  const roundedPrice = ceilDivide(minimumPrice, BigInt(input.rounding)) * BigInt(input.rounding)
  requireSafeTotal(roundedPrice)
  const discountAmount = input.discount.type === 'percent'
    ? roundedPrice * hundredths(input.discount.value) / 10_000n
    : BigInt(input.discount.value)
  if (discountAmount > roundedPrice) {
    throw new RangeError('Diskon nominal tidak boleh melebihi harga setelah pembulatan.')
  }
  const finalPrice = roundedPrice - discountAmount
  const sellingFees = ceilDivide(finalPrice * BigInt(input.feeBps), 10_000n) + fixedFee
  const profit = finalPrice - baseCost - sellingFees
  requireSafeTotal(sellingFees)
  requireSafeTotal(profit)

  return {
    baseCost: Number(baseCost),
    minimumPrice: Number(minimumPrice),
    roundedPrice: Number(roundedPrice),
    discountAmount: Number(discountAmount),
    finalPrice: Number(finalPrice),
    sellingFees: Number(sellingFees),
    profit: Number(profit),
    actualMarginBps: finalPrice === 0n ? null : Number(profit * 10_000n) / Number(finalPrice),
    belowTarget: finalPrice === 0n || profit * 10_000n < finalPrice * BigInt(input.marginBps),
    unitPrice: Number(finalPrice) / Number(quantity),
    costLines: costLines.map(({ label, amount }) => ({ label, amount: Number(amount) })),
  }
}
