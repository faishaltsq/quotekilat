import { beforeEach, expect, it } from 'vitest'
import { DEFAULT_VALUES } from '../../src/features/quotation/defaults'
import { clearTabDraft, loadTabDraft, saveTabDraft } from '../../src/lib/storage/tabDraft'
beforeEach(() => clearTabDraft())
it('preserves personal details in tab memory without writing browser storage', () => {
  localStorage.clear()
  saveTabDraft({ ...DEFAULT_VALUES, customerName: 'Nama privat', notes: 'Syarat privat' })
  expect(loadTabDraft()?.values.customerName).toBe('Nama privat')
  expect(localStorage.length).toBe(0)
  clearTabDraft()
  expect(loadTabDraft()).toBeNull()
})
it('copies values so caller mutation cannot corrupt the in-memory draft', () => {
  const values = { ...DEFAULT_VALUES }
  saveTabDraft(values)
  values.goodsTitle = 'Changed externally'
  expect(loadTabDraft()?.values.goodsTitle).toBe('Hampers custom')
})
