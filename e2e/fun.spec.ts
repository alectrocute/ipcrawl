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

  test('legacy /c/:id redirects to fun channel', async ({ page, request }) => {
    // Use a real cam id: the fun channel page 302s unknown ids to a random
    // channel, so an arbitrary id like "test123" never stays in the URL.
    const res = await request.get('/api/cam')
    expect(res.ok()).toBe(true)
    const { id } = await res.json()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)

    await page.goto(`/c/${id}`)

    // Should 301-redirect to /fun/c/<id>, preserving the id.
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await expect(page).toHaveURL(new RegExp(`/fun/c/${escapedId}$`))
  })
})
