
import { chromium } from '@playwright/test'

const BASE = 'https://quotekilat.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const consoleErrors = []
const failedRequests = []
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('requestfailed', r => failedRequests.push(r.url() + ' :: ' + r.failure()?.errorText))
const external = []
page.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:')) external.push(u) })

await page.goto(BASE + '/', { waitUntil: 'networkidle' })

// Parallax present
const sheets = await page.$$eval('.qk-invoice-sheet', els => els.map(e => ({
  cls: e.className.baseVal, opacity: getComputedStyle(e).opacity,
})))
await page.evaluate(() => window.scrollTo(0, 400))
await page.waitForTimeout(400)
const parallaxVar = await page.$eval('.qk-hero-layers', e => getComputedStyle(e).getPropertyValue('--qk-parallax').trim())

// Core calculator flow: read the computed price
const priceText = await page.locator('text=Harga jual penawaran').first().isVisible().catch(() => false)

// Deep-link reload on a client route must not 404
const privacy = await browser.newPage()
const privacyResp = await privacy.goto(BASE + '/privacy', { waitUntil: 'networkidle' })
const privacyH1 = await privacy.locator('h1').first().textContent()

// 404 page inside SPA
const notFound = await browser.newPage()
await notFound.goto(BASE + '/definitely-not-a-route', { waitUntil: 'networkidle' })
const nfH1 = await notFound.locator('h1').first().textContent()

await page.screenshot({ path: 'test-results/production-desktop.png' })

console.log(JSON.stringify({
  sheets, parallaxVar, builderVisible: priceText,
  privacyStatus: privacyResp.status(), privacyH1: privacyH1?.trim(),
  notFoundH1: nfH1?.trim(),
  consoleErrors, failedRequests, externalRequests: external,
}, null, 2))

await browser.close()
