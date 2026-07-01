import { test, expect } from '@playwright/test'

test.describe('Fun mode', () => {
  test('GET /fun redirects to a channel page', async ({ page }) => {
    await page.goto('/fun')

    // Should redirect to /fun/c/[id]
    await expect(page).toHaveURL(/\/fun\/c\/.+/)
  })

  test('channel page renders CRT monitor and controls', async ({ page }) => {
    await page.goto('/fun')

    // Wait for the channel page to settle (redirect happens server-side)
    await page.waitForURL(/\/fun\/c\/.+/)

    // The CRT monitor should render with a cam frame visible
    await expect(page.locator('.crt-monitor, [class*="crt"]').first()).toBeVisible({ timeout: 10_000 })

    // Stumble/next controls should be present
    const nextBtn = page.getByRole('button', { name: /next|stumble|skip/i })
    await expect(nextBtn.first()).toBeVisible({ timeout: 5_000 })
  })

  test('legacy /c/:id redirects to fun channel', async ({ page }) => {
    // We don't know a valid ID, but we can test the redirect behavior
    await page.goto('/c/test123')

    // Should redirect to /fun/c/test123
    await expect(page).toHaveURL(/\/fun\/c\/test123/)
  })
})
