// packages/assertions/tests/http.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluateHttp } from '../src/http.js'
import type { HttpAssertStep, InterpolationContext } from '@flowprobe/core'

const ctx: InterpolationContext = {
  vars: {},
  steps: {},
  runId: 'test-run-1',
}

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }))
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('evaluateHttp', () => {
  it('passes status assertion on matching status code', async () => {
    mockFetch(200, { ok: true })
    const step: HttpAssertStep = {
      id: 'step-1',
      type: 'http-assert',
      method: 'GET',
      url: 'http://example.com/health',
      assertions: [{ type: 'status', expected: 200 }],
    }
    const results = await evaluateHttp(step, ctx)
    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(true)
    expect(results[0].actual).toBe(200)
  })

  it('fails status assertion on wrong status code', async () => {
    mockFetch(404, { error: 'not found' })
    const step: HttpAssertStep = {
      id: 'step-2',
      type: 'http-assert',
      method: 'GET',
      url: 'http://example.com/missing',
      assertions: [{ type: 'status', expected: 200 }],
    }
    const results = await evaluateHttp(step, ctx)
    expect(results[0].passed).toBe(false)
    expect(results[0].actual).toBe(404)
  })

  it('evaluates jsonpath assertion on response body', async () => {
    mockFetch(200, { reserved: true, item: { sku: 'SKU-001' } })
    const step: HttpAssertStep = {
      id: 'step-3',
      type: 'http-assert',
      method: 'GET',
      url: 'http://example.com/order',
      assertions: [
        { type: 'status', expected: 200 },
        { type: 'jsonpath', path: '$.item.sku', expected: 'SKU-001' },
      ],
    }
    const results = await evaluateHttp(step, ctx)
    expect(results).toHaveLength(2)
    expect(results[1].passed).toBe(true)
    expect(results[1].actual).toBe('SKU-001')
  })

  it('returns error result when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const step: HttpAssertStep = {
      id: 'step-4',
      type: 'http-assert',
      method: 'GET',
      url: 'http://localhost:9999/unreachable',
      assertions: [{ type: 'status', expected: 200 }],
    }
    const results = await evaluateHttp(step, ctx)
    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(false)
    expect(results[0].error).toContain('ECONNREFUSED')
  })

  it('evaluates POST with body and status assertion', async () => {
    mockFetch(201, { id: 'order-123' })
    const step: HttpAssertStep = {
      id: 'step-5',
      type: 'http-assert',
      method: 'POST',
      url: 'http://example.com/orders',
      body: { item: 'SKU-001', qty: 1 },
      assertions: [
        { type: 'status', expected: 201 },
        { type: 'jsonpath', path: '$.id', expected: 'order-123' },
      ],
    }
    const results = await evaluateHttp(step, ctx)
    expect(results).toHaveLength(2)
    expect(results[0].passed).toBe(true)
    expect(results[1].passed).toBe(true)
  })
})
