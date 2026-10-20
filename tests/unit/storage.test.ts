import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_VALUES } from '../../src/features/quotation/defaults'
import { DRAFT_KEY, loadDraft, saveDraft, clearDraft } from '../../src/lib/storage/guestDraft'
beforeEach(() => localStorage.clear())
describe('private bounded local draft', () => {
  it('persists financial state but excludes personal fields by default', () => {
    expect(saveDraft({ ...DEFAULT_VALUES, customerName: 'Rahasia', businessName: 'Usaha', notes: 'Pribadi' })).toBe(true)
    expect(localStorage.getItem(DRAFT_KEY)).not.toContain('Rahasia')
    expect(loadDraft()?.values.customerName).toBe('')
    expect(loadDraft()?.values.unitCost).toBe('150000')
  })
  it('preserves personal fields only after explicit opt-in and clears only app key', () => {
    saveDraft({ ...DEFAULT_VALUES, persistPersonal: true, customerName: 'Dewi' })
    expect(loadDraft()?.values.customerName).toBe('Dewi')
    localStorage.setItem('unrelated', 'kept')
    clearDraft()
    expect(loadDraft()).toBeNull()
    expect(localStorage.getItem('unrelated')).toBe('kept')
  })
  it('rejects corrupted, unknown-version, oversized and malformed storage', () => {
    for (const raw of ['bad json', '{"version":999}', 'x'.repeat(20001), '{"version":1,"values":{"mode":"hacked"}}']) {
      localStorage.setItem(DRAFT_KEY, raw)
      expect(loadDraft()).toBeNull()
    }
  })
  it('does not crash when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(saveDraft(DEFAULT_VALUES)).toBe(false)
  })
})
