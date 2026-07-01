import { test, expect } from '@playwright/test'

test.describe('Explore catalog page', () => {
  test('renders the catalog header with logo and camera count', async ({ page }) => {
    await page.goto('/')

    // The IP Crawl logo should be visible
    await expect(page.locator('.explore__header')).toBeVisible()

    // Camera count is displayed
    await expect(page.locator('.explore__count')).toBeVisible()
  })

  test('renders the filter sidebar with facets', async ({ page }) => {
    await page.goto('/')

    // The sidebar should be present (desktop)
    await expect(page.locator('.explore__sidebar')).toBeVisible()
  })

  test('renders the camera grid or skeleton/empty state', async ({ page }) => {
    await page.goto('/')

    // Either the cam grid, skeleton loader, or empty state should be present
    const grid = page.locator('.cam-grid')
    const empty = page.locator('.cam-grid__empty')
    await expect(grid.or(empty).first()).toBeVisible({ timeout: 10_000 })
  })

  test('navigates to About page', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'About' }).first().click()
    await expect(page).toHaveURL(/\/about/)
  })

  test('navigates to Stats page', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'Stats' }).first().click()
    await expect(page).toHaveURL(/\/stats/)
  })

  test('navigates to Map page', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'Map' }).first().click()
    await expect(page).toHaveURL(/\/map/)
  })

  test('mobile filter slideover opens', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 })
    await page.goto('/')

    // On mobile, the filter button should be visible
    const filterBtn = page.locator('.explore__mobile-filters')
    await expect(filterBtn).toBeVisible()
    await filterBtn.click()

    // Slideover should appear
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})
