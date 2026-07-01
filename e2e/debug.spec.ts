import { test } from '@playwright/test'

async function sample(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-slot="content"]')
    if (!el) return { present: false }
    return {
      present: true,
      dataState: el.getAttribute('data-state'),
      role: el.getAttribute('role'),
      offsetParentNull: (el as HTMLElement).offsetParent === null
    }
  })
}

test('v4 no networkidle', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 })
  await page.goto('/')
  const filterBtn = page.locator('.explore__mobile-filters')
  await filterBtn.click()
  console.log('immediately after click:', JSON.stringify(await sample(page)))
  await page.waitForTimeout(200)
  console.log('after 200ms:', JSON.stringify(await sample(page)))
  await page.waitForTimeout(800)
  console.log('after 1000ms:', JSON.stringify(await sample(page)))
  await page.waitForTimeout(1000)
  console.log('after 2000ms:', JSON.stringify(await sample(page)))
})

test('v5 with networkidle', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const filterBtn = page.locator('.explore__mobile-filters')
  await filterBtn.click()
  console.log('immediately after click:', JSON.stringify(await sample(page)))
  await page.waitForTimeout(200)
  console.log('after 200ms:', JSON.stringify(await sample(page)))
  await page.waitForTimeout(800)
  console.log('after 1000ms:', JSON.stringify(await sample(page)))
  await page.waitForTimeout(1000)
  console.log('after 2000ms:', JSON.stringify(await sample(page)))
})
