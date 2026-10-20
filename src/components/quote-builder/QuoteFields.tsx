import { useFormContext } from 'react-hook-form'
import type { QuoteFormValues } from '../../features/quotation/defaults'
type Errors = Partial<Record<keyof QuoteFormValues, string>>
type FieldProps = { name: keyof QuoteFormValues; label: string; hint?: string; prefix?: string; text?: boolean; errors: Errors }
export function FormField({ name, label, hint, prefix, text, errors }: FieldProps) {
  const { register } = useFormContext<QuoteFormValues>()
  const error = errors[name]
  return <div className="form-field"><label htmlFor={name}>{label}</label><div className={`input-wrap ${error ? 'input-error' : ''}`}>
    {prefix && <span className="input-prefix" aria-hidden="true">{prefix}</span>}
    <input id={name} type="text" inputMode={text ? 'text' : 'decimal'} autoComplete="off" {...register(name)} maxLength={text ? 120 : 25} aria-invalid={!!error} aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined} />
  </div>{error ? <span className="field-error" id={`${name}-error`}>{error}</span> : hint ? <span className="field-hint" id={`${name}-hint`}>{hint}</span> : null}</div>
}
export function ModeFields({ values, errors }: { values: QuoteFormValues; errors: Errors }) {
  const titleKey = values.mode === 'goods' ? 'goodsTitle' : values.mode === 'service' ? 'serviceTitle' : 'customTitle'
  return <><FormField name={titleKey} label={values.mode === 'goods' ? 'Nama produk' : values.mode === 'service' ? 'Nama layanan' : 'Nama pesanan'} text errors={errors} />
  {values.mode === 'goods' && <><div className="field-grid"><FormField name="unitCost" label="Biaya utama / unit" prefix="Rp" errors={errors} /><FormField name="additionalUnitCost" label="Biaya tambahan / unit" prefix="Rp" errors={errors} /></div><FormField name="quantity" label="Jumlah barang" hint="Unit / pcs. Biaya per unit dikalikan jumlah ini." errors={errors} /></>}
  {values.mode === 'service' && <><div className="field-grid"><FormField name="serviceHours" label="Estimasi jam kerja" errors={errors} /><FormField name="hourlyCost" label="Biaya internal / jam" prefix="Rp" errors={errors} /></div><FormField name="subcontractorCost" label="Subkontraktor total" prefix="Rp" hint="Biaya Anda, bukan tarif yang dibayar pelanggan." errors={errors} /></>}
  {values.mode === 'custom' && <><div className="field-grid"><FormField name="materialCost" label="Material / unit" prefix="Rp" errors={errors} /><FormField name="laborCost" label="Tenaga kerja / unit" prefix="Rp" errors={errors} /></div><div className="field-grid"><FormField name="finishingCost" label="Finishing / unit" prefix="Rp" errors={errors} /><FormField name="customQuantity" label="Jumlah pesanan" errors={errors} /></div></>}
  </>
}
export function AdvancedFields({ values, errors }: { values: QuoteFormValues; errors: Errors }) {
  const { register } = useFormContext<QuoteFormValues>()
  return <details className="builder-details"><summary>Biaya, fee & diskon <span>Opsional</span></summary><div className="details-body">
    <p className="field-hint">Rupiah bulat tanpa pemisah. Biaya tetap dihitung sekali per pesanan.</p>
    {values.mode === 'custom' && <FormField name="wastePercent" label="Waste material (%)" hint="Hanya diterapkan pada material, bukan tenaga kerja atau finishing." errors={errors} />}
    <div className="field-grid"><FormField name="fixedCosts" label="Overhead pesanan" prefix="Rp" errors={errors} /><FormField name="fixedFee" label="Fee jual tetap" prefix="Rp" errors={errors} /></div>
    <div className="field-grid"><FormField name="feePercent" label="Fee penjualan (%)" hint="Dari harga jual setelah diskon." errors={errors} /><div className="form-field"><label htmlFor="rounding">Pembulatan ke atas</label><select id="rounding" {...register('rounding')}><option value="100">Rp100</option><option value="500">Rp500</option><option value="1000">Rp1.000</option></select></div></div>
    <div className="field-grid"><div className="form-field"><label htmlFor="discountType">Jenis diskon</label><select id="discountType" {...register('discountType')}><option value="percent">Persentase (%)</option><option value="fixed">Nominal (Rp)</option></select></div><FormField name="discountValue" label={values.discountType === 'percent' ? 'Diskon (%)' : 'Diskon (Rp)'} errors={errors} /></div>
  </div></details>
}
export function CustomerFields({ errors }: { errors: Errors }) {
  const { register } = useFormContext<QuoteFormValues>()
  return <details className="builder-details"><summary>Detail penawaran <span>Opsional</span></summary><div className="details-body">
    <div className="field-grid"><FormField name="businessName" label="Nama usaha" text errors={errors} /><FormField name="customerName" label="Nama pelanggan" text errors={errors} /></div>
    <FormField name="validDays" label="Masa berlaku (hari)" hint="Isi 0 untuk tanpa masa berlaku." errors={errors} />
    <div className="form-field"><label htmlFor="notes">Catatan & syarat</label><textarea id="notes" {...register('notes')} maxLength={1500} rows={3} aria-invalid={!!errors.notes} aria-describedby="notes-help" /><span id="notes-help" className={errors.notes ? 'field-error' : 'field-hint'}>{errors.notes || 'Tidak masuk ke draft lokal, kecuali Anda memberi izin di bawah.'}</span></div>
    <label className="checkbox-label"><input type="checkbox" {...register('persistPersonal')} /><span>Simpan juga nama usaha, pelanggan & catatan di perangkat ini. Jangan pilih di perangkat bersama.</span></label>
  </div></details>
}
