import { describe, expect, it } from 'vitest'
import { calculatePricing } from '../../src/lib/pricing/pricingEngine'
import type { PricingInput } from '../../src/lib/pricing/types'

function pricingInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    mode: 'goods',
    quantity: 1,
    unitCost: 175_000,
    additionalUnitCost: 0,
    fixedCosts: 0,
    fixedFee: 0,
    feeBps: 0,
    marginBps: 3_000,
    rounding: 1_000,
    discount: { type: 'percent', value: 0 },
    serviceHours: 1,
    hourlyCost: 0,
    subcontractorCost: 0,
    materialCost: 0,
    laborCost: 0,
    finishingCost: 0,
    wasteBps: 0,
    ...overrides,
  }
}

describe('validasi input umum', () => {
  const invalidCases: { label: string; overrides: Partial<PricingInput>; message: RegExp }[] = [
    { label: 'mode tidak dikenal', overrides: { mode: 'other' as PricingInput['mode'] }, message: /mode/i },
    ...[0, -1, 1.5, 1_000_001, NaN, Infinity].map(quantity => ({ label: `jumlah ${quantity}`, overrides: { quantity }, message: /jumlah/i })),
    ...[-1, 0.5, 1_000_000_000_001, NaN, Infinity].map(fixedCosts => ({ label: `biaya tetap ${fixedCosts}`, overrides: { fixedCosts }, message: /biaya tetap/i })),
    ...[-1, 0.5, 1_000_000_000_001, NaN, Infinity].map(fixedFee => ({ label: `fee tetap ${fixedFee}`, overrides: { fixedFee }, message: /fee tetap/i })),
    ...[-1, 0.5, 9_901, NaN, Infinity].map(feeBps => ({ label: `fee ${feeBps}`, overrides: { feeBps }, message: /fee penjualan/i })),
    ...[-1, 0.5, 8_001, NaN, Infinity].map(marginBps => ({ label: `margin ${marginBps}`, overrides: { marginBps }, message: /margin/i })),
    { label: 'rounding tidak didukung', overrides: { rounding: 200 as PricingInput['rounding'] }, message: /pembulatan/i },
    { label: 'rounding nol', overrides: { rounding: 0 as PricingInput['rounding'] }, message: /pembulatan/i },
    { label: 'rounding NaN', overrides: { rounding: NaN as PricingInput['rounding'] }, message: /pembulatan/i },
    ...[-1, 100.01, 1.001, NaN, Infinity].map(value => ({ label: `diskon persen ${value}`, overrides: { discount: { type: 'percent' as const, value } }, message: /diskon/i })),
    ...[-1, 0.5, 1_000_000_000_001, NaN, Infinity].map(value => ({ label: `diskon nominal ${value}`, overrides: { discount: { type: 'fixed' as const, value } }, message: /diskon/i })),
    { label: 'jenis diskon tidak dikenal', overrides: { discount: { type: 'other', value: 0 } as unknown as PricingInput['discount'] }, message: /diskon/i },
    { label: 'diskon tidak ada', overrides: { discount: null as unknown as PricingInput['discount'] }, message: /diskon/i },
  ]

  it.each(invalidCases)('menolak $label dengan RangeError berbahasa Indonesia', ({ overrides, message }) => {
    const calculate = () => calculatePricing(pricingInput(overrides))
    expect(calculate).toThrow(RangeError)
    expect(calculate).toThrow(message)
    expect(calculate).toThrow(/harus|tidak valid|pilih/i)
  })

  it.each([null, undefined, 'biaya', 100, []])('menolak bentuk input tidak valid: %s', input => {
    expect(() => calculatePricing(input as unknown as PricingInput)).toThrow(/input.*tidak valid/i)
  })

  it.each([[8_000, 2_000], [5_000, 5_000], [9_900, 8_000]])('menolak fee %i bps + margin %i bps yang mustahil', (feeBps, marginBps) => {
    expect(() => calculatePricing(pricingInput({ feeBps, marginBps }))).toThrow(/margin.*fee.*kurang dari 100%/i)
  })

  it('menolak diskon nominal yang melebihi harga setelah pembulatan', () => {
    expect(() => calculatePricing(pricingInput({ discount: { type: 'fixed', value: 250_001 } }))).toThrow(/diskon.*melebihi/i)
  })
})

describe('validasi biaya sesuai mode', () => {
  const fields: { mode: PricingInput['mode']; key: keyof PricingInput; message: RegExp }[] = [
    { mode: 'goods', key: 'unitCost', message: /biaya barang/i },
    { mode: 'goods', key: 'additionalUnitCost', message: /biaya tambahan/i },
    { mode: 'service', key: 'hourlyCost', message: /biaya per jam/i },
    { mode: 'service', key: 'subcontractorCost', message: /subkontraktor/i },
    { mode: 'custom', key: 'materialCost', message: /material/i },
    { mode: 'custom', key: 'laborCost', message: /tenaga kerja/i },
    { mode: 'custom', key: 'finishingCost', message: /finishing/i },
  ]
  const cases = fields.flatMap(field => [-1, 0.5, 1_000_000_000_001, NaN, Infinity, undefined, '100'].map(value => ({ ...field, value })))

  it.each(cases)('menolak $mode / $key = $value', ({ mode, key, value, message }) => {
    const calculate = () => calculatePricing(pricingInput({ mode, [key]: value } as Partial<PricingInput>))
    expect(calculate).toThrow(RangeError)
    expect(calculate).toThrow(message)
    expect(calculate).toThrow(/harus/i)
  })

  it.each([0, -1, 0.001, 1.001, 1_000_000.01, NaN, Infinity, undefined, '1'])('menolak jam jasa tidak valid: %s', serviceHours => {
    expect(() => calculatePricing(pricingInput({ mode: 'service', serviceHours: serviceHours as number }))).toThrow(/jam.*harus/i)
  })

  it.each([-1, 0.1, 10_001, NaN, Infinity, undefined])('menolak waste tidak valid: %s', wasteBps => {
    expect(() => calculatePricing(pricingInput({ mode: 'custom', wasteBps: wasteBps as number }))).toThrow(/waste.*harus/i)
  })

  it.each([
    pricingInput({ serviceHours: NaN, hourlyCost: NaN, subcontractorCost: NaN, materialCost: NaN, laborCost: NaN, finishingCost: NaN, wasteBps: NaN }),
    pricingInput({ mode: 'service', unitCost: NaN, additionalUnitCost: NaN, materialCost: NaN, laborCost: NaN, finishingCost: NaN, wasteBps: NaN }),
    pricingInput({ mode: 'custom', unitCost: NaN, additionalUnitCost: NaN, serviceHours: NaN, hourlyCost: NaN, subcontractorCost: NaN }),
  ])('mengabaikan biaya mode lain tanpa mencampurnya: $mode', input => {
    const result = calculatePricing(input)
    expect(Number.isFinite(result.baseCost)).toBe(true)
    expect(result.costLines.reduce((sum, line) => sum + line.amount, 0)).toBe(result.baseCost)
  })
})

describe('batas total dan presisi', () => {
  it.each([
    { label: 'barang', input: pricingInput({ quantity: 1_000_000, unitCost: 1_000_000_000_000 }) },
    { label: 'jasa', input: pricingInput({ mode: 'service', serviceHours: 1_000_000, hourlyCost: 1_000_000_000_000 }) },
    { label: 'custom', input: pricingInput({ mode: 'custom', quantity: 1_000_000, materialCost: 1_000_000_000_000, wasteBps: 10_000 }) },
    { label: 'biaya ditambah fee tetap', input: pricingInput({ quantity: 100, unitCost: 1_000_000_000_000, marginBps: 0, fixedFee: 1 }) },
    { label: 'harga minimum', input: pricingInput({ unitCost: 1_000_000_000_000, feeBps: 9_900, marginBps: 99 }) },
  ])('menolak total lebih dari Rp100 triliun: $label', ({ input }) => {
    expect(() => calculatePricing(input)).toThrow(RangeError)
    expect(() => calculatePricing(input)).toThrow(/total.*batas.*100\.000\.000\.000\.000/i)
  })

  it('menerima tepat batas total meskipun hasil kali antara melampaui safe integer Number', () => {
    const result = calculatePricing(pricingInput({ quantity: 100, unitCost: 1_000_000_000_000, marginBps: 0 }))
    expect(result.baseCost).toBe(100_000_000_000_000)
    expect(result.minimumPrice).toBe(100_000_000_000_000)
    expect(result.finalPrice).toBe(100_000_000_000_000)
    expect(result.profit).toBe(0)
    expect(result.actualMarginBps).toBe(0)
    expect(result.belowTarget).toBe(false)
  })

  it('mempertahankan pecahan harga minimum yang akan hilang pada aritmetika float', () => {
    const result = calculatePricing(pricingInput({ quantity: 17, unitCost: 995_082_517_380, marginBps: 932, feeBps: 1_582, rounding: 100 }))
    expect(result.baseCost).toBe(16_916_402_795_460)
    expect(result.minimumPrice).toBe(22_597_385_513_573)
    expect(result.roundedPrice).toBe(22_597_385_513_600)
    expect(result.sellingFees).toBe(3_574_906_388_252)
    expect(result.profit).toBe(2_106_076_329_888)
  })
})

describe('pembulatan dan margin guard', () => {
  it.each([
    { rounding: 100 as const, expected: 100_100 },
    { rounding: 500 as const, expected: 100_500 },
    { rounding: 1000 as const, expected: 101_000 },
  ])('membulatkan ke atas pada kelipatan $rounding tanpa markup saat margin nol', ({ rounding, expected }) => {
    const result = calculatePricing(pricingInput({ unitCost: 100_001, marginBps: 0, rounding }))
    expect(result.minimumPrice).toBe(100_001)
    expect(result.roundedPrice).toBe(expected)
    expect(result.belowTarget).toBe(false)
  })

  it.each([100, 500, 1000] as const)('tidak menambah satu langkah jika sudah tepat kelipatan %i', rounding => {
    const result = calculatePricing(pricingInput({ unitCost: 100_000, marginBps: 0, rounding }))
    expect(result.roundedPrice).toBe(100_000)
    expect(result.profit).toBe(0)
    expect(result.actualMarginBps).toBe(0)
    expect(result.belowTarget).toBe(false)
  })

  it('menandai selisih satu rupiah di bawah target tanpa toleransi float', () => {
    const result = calculatePricing(pricingInput({ quantity: 50, unitCost: 1_000_000_000_000, marginBps: 5_000, discount: { type: 'fixed', value: 1 } }))
    expect(result.finalPrice).toBe(99_999_999_999_999)
    expect(result.actualMarginBps).toBeCloseTo(5_000, 8)
    expect(result.belowTarget).toBe(true)
  })

  it('memakai fee ceil satu rupiah dalam guard meskipun tidak ada diskon', () => {
    const result = calculatePricing(pricingInput({ unitCost: 1, feeBps: 7_901, marginBps: 1_999, rounding: 100 }))
    expect(result.minimumPrice).toBe(100)
    expect(result.sellingFees).toBe(80)
    expect(result.profit).toBe(19)
    expect(result.actualMarginBps).toBe(1_900)
    expect(result.belowTarget).toBe(true)
  })

  it('tidak mengubah diskon lebih kecil dari satu rupiah menjadi satu rupiah', () => {
    const result = calculatePricing(pricingInput({ unitCost: 101, marginBps: 0, rounding: 100, discount: { type: 'percent', value: 0.01 } }))
    expect(result.roundedPrice).toBe(200)
    expect(result.discountAmount).toBe(0)
    expect(result.finalPrice).toBe(200)
  })

  it.each([0.01, 0.29, 1.15, 1_000_000])('mengonversi jam %s tanpa drift perkalian float', serviceHours => {
    const result = calculatePricing(pricingInput({ mode: 'service', serviceHours, hourlyCost: 100, marginBps: 0 }))
    expect(result.baseCost).toBe(Number(serviceHours.toFixed(2).replace('.', '')))
  })

  it('menerima batas maksimum jumlah, margin, dan waste yang masih valid', () => {
    expect(calculatePricing(pricingInput({ quantity: 1_000_000, unitCost: 1, marginBps: 8_000 })).baseCost).toBe(1_000_000)
    expect(calculatePricing(pricingInput({ unitCost: 1, marginBps: 0, feeBps: 9_900 })).sellingFees).toBe(990)
    expect(calculatePricing(pricingInput({ mode: 'custom', materialCost: 1, laborCost: 2, finishingCost: 3, wasteBps: 10_000 })).baseCost).toBe(7)
  })
})

describe('invarian harga deterministik', () => {
  it.each(['goods', 'service', 'custom'] as const)('menjaga identitas keuangan dan batas ceil untuk semua kombinasi mode %s', mode => {
    for (const rounding of [100, 500, 1000] as const) {
      for (const marginBps of [0, 3_000, 8_000]) {
        for (const feeBps of [0, 500]) {
          for (const discount of [0, 10, 100]) {
            const input = pricingInput({ mode, quantity: 7, unitCost: 12_345, additionalUnitCost: 789, serviceHours: 2.29, hourlyCost: 9_789, subcontractorCost: 123, materialCost: 1_235, laborCost: 1_111, finishingCost: 99, wasteBps: 715, fixedCosts: 917, fixedFee: 23, rounding, marginBps, feeBps, discount: { type: 'percent', value: discount } })
            const result = calculatePricing(input)
            const denominator = 10_000n - BigInt(feeBps) - BigInt(marginBps)
            const numerator = (BigInt(result.baseCost) + BigInt(input.fixedFee)) * 10_000n
            const minimum = BigInt(result.minimumPrice)
            expect(minimum * denominator >= numerator).toBe(true)
            expect((minimum - 1n) * denominator < numerator).toBe(true)
            expect(result.roundedPrice % rounding).toBe(0)
            expect(result.roundedPrice >= result.minimumPrice).toBe(true)
            expect(result.roundedPrice - result.minimumPrice < rounding).toBe(true)
            expect(result.finalPrice + result.discountAmount).toBe(result.roundedPrice)
            expect(result.profit + result.baseCost + result.sellingFees).toBe(result.finalPrice)
            expect(result.costLines.reduce((sum, line) => sum + line.amount, 0)).toBe(result.baseCost)
            expect(result.unitPrice).toBe(result.finalPrice / (mode === 'service' ? 1 : input.quantity))
            for (const key of ['baseCost', 'minimumPrice', 'roundedPrice', 'discountAmount', 'finalPrice', 'sellingFees', 'profit'] as const) {
              expect(Number.isSafeInteger(result[key])).toBe(true)
            }
          }
        }
      }
    }
  })

  it('tidak memutasi input maupun mengembalikan costLines yang dibagi antarpanggilan', () => {
    const input = pricingInput()
    Object.freeze(input.discount)
    Object.freeze(input)
    const first = calculatePricing(input)
    const original = structuredClone(first)
    first.costLines[0].amount = 0
    expect(calculatePricing(input)).toEqual(original)
    expect(input).toEqual(pricingInput())
  })
})

describe('calculatePricing', () => {
  it.each([
    { label: 'diskon 100%', input: pricingInput({ fixedFee: 200, discount: { type: 'percent', value: 100 } }), fees: 200, profit: -175_200 },
    { label: 'diskon nominal penuh', input: pricingInput({ discount: { type: 'fixed', value: 250_000 } }), fees: 0, profit: -175_000 },
    { label: 'biaya nol', input: pricingInput({ unitCost: 0, marginBps: 0 }), fees: 0, profit: 0 },
  ])('memberi margin null dan guard aktif pada pendapatan nol: $label', ({ input, fees, profit }) => {
    const result = calculatePricing(input)

    expect(result.finalPrice).toBe(0)
    expect(result.sellingFees).toBe(fees)
    expect(result.profit).toBe(profit)
    expect(result.actualMarginBps).toBeNull()
    expect(result.belowTarget).toBe(true)
    expect(result.unitPrice).toBe(0)
  })

  it('menghitung diskon nominal tanpa menghapus fee tetap saat laba menurun', () => {
    const result = calculatePricing(pricingInput({
      unitCost: 100_000,
      feeBps: 500,
      fixedFee: 1_000,
      marginBps: 2_500,
      discount: { type: 'fixed', value: 20_000 },
    }))

    expect(result.minimumPrice).toBe(144_286)
    expect(result.roundedPrice).toBe(145_000)
    expect(result.discountAmount).toBe(20_000)
    expect(result.finalPrice).toBe(125_000)
    expect(result.sellingFees).toBe(7_250)
    expect(result.profit).toBe(17_750)
    expect(result.actualMarginBps).toBe(1_420)
    expect(result.belowTarget).toBe(true)
  })

  it('membulatkan diskon persen ke bawah setelah rounding dan memperbarui margin guard', () => {
    const result = calculatePricing(pricingInput({
      unitCost: 100_000,
      feeBps: 500,
      marginBps: 2_500,
      discount: { type: 'percent', value: 12.34 },
    }))

    expect(result.roundedPrice).toBe(143_000)
    expect(result.discountAmount).toBe(17_646)
    expect(result.finalPrice).toBe(125_354)
    expect(result.sellingFees).toBe(6_268)
    expect(result.profit).toBe(19_086)
    expect(result.actualMarginBps).toBeCloseTo(1_522.5680871771144, 10)
    expect(result.belowTarget).toBe(true)
  })

  it('menerapkan waste hanya pada material per unit sebelum kuantitas pesanan custom', () => {
    const result = calculatePricing(pricingInput({
      mode: 'custom',
      quantity: 3,
      materialCost: 101,
      wasteBps: 333,
      laborCost: 203,
      finishingCost: 7,
      fixedCosts: 17,
      rounding: 100,
    }))

    expect(result.baseCost).toBe(962)
    expect(result.minimumPrice).toBe(1_375)
    expect(result.roundedPrice).toBe(1_400)
    expect(result.profit).toBe(438)
    expect(result.costLines).toEqual([
      { label: 'Material', amount: 303 },
      { label: 'Waste material', amount: 12 },
      { label: 'Tenaga kerja custom', amount: 609 },
      { label: 'Finishing', amount: 21 },
      { label: 'Biaya tetap pesanan', amount: 17 },
    ])
  })

  it('menghitung jasa dari jam dua desimal dengan pembulatan tenaga ke atas', () => {
    const result = calculatePricing(pricingInput({
      mode: 'service',
      quantity: 99,
      serviceHours: 1.15,
      hourlyCost: 101,
      subcontractorCost: 5_000,
      fixedCosts: 700,
      fixedFee: 7,
      feeBps: 333,
      marginBps: 2_500,
      rounding: 100,
    }))

    expect(result.baseCost).toBe(5_817)
    expect(result.minimumPrice).toBe(8_127)
    expect(result.finalPrice).toBe(8_200)
    expect(result.sellingFees).toBe(281)
    expect(result.profit).toBe(2_102)
    expect(result.unitPrice).toBe(8_200)
    expect(result.costLines).toEqual([
      { label: 'Tenaga kerja jasa', amount: 117 },
      { label: 'Subkontraktor', amount: 5_000 },
      { label: 'Biaya tetap pesanan', amount: 700 },
    ])
  })

  it('mengalikan biaya per unit dan mengenakan biaya/fee tetap hanya sekali per pesanan', () => {
    const result = calculatePricing(pricingInput({
      quantity: 3,
      unitCost: 10_000,
      additionalUnitCost: 2_000,
      fixedCosts: 7_000,
      fixedFee: 300,
      feeBps: 250,
      marginBps: 2_000,
      rounding: 500,
    }))

    expect(result.baseCost).toBe(43_000)
    expect(result.minimumPrice).toBe(55_871)
    expect(result.roundedPrice).toBe(56_000)
    expect(result.sellingFees).toBe(1_700)
    expect(result.profit).toBe(11_300)
    expect(result.unitPrice).toBe(56_000 / 3)
    expect(result.costLines).toEqual([
      { label: 'Biaya barang', amount: 30_000 },
      { label: 'Biaya tambahan', amount: 6_000 },
      { label: 'Biaya tetap pesanan', amount: 7_000 },
    ])
  })

  it('memasukkan fee penjualan dalam penyebut harga dan menghitung ulang fee aktual', () => {
    const result = calculatePricing(pricingInput({ unitCost: 100_000, feeBps: 500, marginBps: 2_500 }))

    expect(result.minimumPrice).toBe(142_858)
    expect(result.roundedPrice).toBe(143_000)
    expect(result.sellingFees).toBe(7_150)
    expect(result.profit).toBe(35_850)
    expect(result.actualMarginBps).toBeCloseTo(2_506.993006993007, 10)
    expect(result.belowTarget).toBe(false)
  })

  it('menghitung gross margin 30%, bukan markup 30%, pada contoh blueprint', () => {
    const result = calculatePricing(pricingInput())

    expect(result).toEqual({
      baseCost: 175_000,
      minimumPrice: 250_000,
      roundedPrice: 250_000,
      discountAmount: 0,
      finalPrice: 250_000,
      sellingFees: 0,
      profit: 75_000,
      actualMarginBps: 3_000,
      belowTarget: false,
      unitPrice: 250_000,
      costLines: [
        { label: 'Biaya barang', amount: 175_000 },
        { label: 'Biaya tambahan', amount: 0 },
        { label: 'Biaya tetap pesanan', amount: 0 },
      ],
    })
  })
})
