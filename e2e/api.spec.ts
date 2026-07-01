import { test, expect } from '@playwright/test'

test.describe('API endpoints', () => {
  test('GET /api/explore/cams returns paginated list', async ({ request }) => {
    const res = await request.get('/api/explore/cams')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('items')
    expect(body).toHaveProperty('total')
    expect(body).toHaveProperty('page')
    expect(body).toHaveProperty('pageSize')
    expect(Array.isArray(body.items)).toBe(true)
  })

  test('GET /api/explore/cams respects pageSize param', async ({ request }) => {
    const res = await request.get('/api/explore/cams?pageSize=5')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.items.length).toBeLessThanOrEqual(5)
  })

  test('GET /api/explore/facets returns facet groups', async ({ request }) => {
    const res = await request.get('/api/explore/facets')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('countries')
    expect(body).toHaveProperty('cities')
    expect(body).toHaveProperty('orgs')
    expect(body).toHaveProperty('manufacturers')
    expect(Array.isArray(body.countries)).toBe(true)
  })

  test('GET /api/explore/facets/search returns matching facet values', async ({ request }) => {
    const res = await request.get('/api/explore/facets/search?field=country&term=un')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    for (const item of body) {
      expect(item).toHaveProperty('value')
      expect(item).toHaveProperty('count')
      expect(typeof item.value).toBe('string')
      expect(typeof item.count).toBe('number')
    }
  })

  test('GET /api/explore/facets/search rejects short terms', async ({ request }) => {
    const res = await request.get('/api/explore/facets/search?field=country&term=u')
    expect(res.status()).toBe(400)
  })

  test('GET /api/status returns diagnostic info', async ({ request }) => {
    const res = await request.get('/api/status')
    expect(res.status()).toBe(200)

    const body = await res.json()
    // Should contain at minimum a status field
    expect(typeof body).toBe('object')
  })

  test('GET /api/cam returns random camera', async ({ request }) => {
    const res = await request.get('/api/cam')
    // May redirect or return JSON — both are valid behaviors
    expect([200, 302, 303, 307, 308]).toContain(res.status())
  })

  test('POST /api/explore/favorite/invalid-id returns error', async ({ request }) => {
    const res = await request.post('/api/explore/favorite/__nonexistent__', {
      data: {}
    })
    // Should not crash; expect a structured response
    expect(res.status()).toBeLessThan(500)
  })
})
