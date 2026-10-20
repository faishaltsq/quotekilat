import { expect, test } from '@playwright/test'

test('pricing CTA leads back to the real guest builder', async ({ page }) => {
  await page.goto('/pricing')
  const action = page.getByRole('link', { name: 'Pakai gratis sekarang' })
  await expect(action).toHaveAttribute('href', '/#quote-builder')
  await action.click()
  await expect(page).toHaveURL(/\/#quote-builder$/)
  await expect(page.getByLabel('Nama produk')).toBeVisible()
})

test('privacy and terms are explicit drafts and unknown paths offer a working return', async ({ page }) => {
  for (const route of ['/privacy', '/terms']) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('Draf', { exact: false }).first()).toBeVisible()
  }
  await page.goto('/not-a-page')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Halaman tidak ditemukan.')
  await page.getByRole('link', { name: 'Kembali ke kalkulator' }).click()
  await expect(page.getByRole('button', { name: 'Buat Penawaran' })).toBeEnabled()
})
