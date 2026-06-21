import { describe, it, expect } from 'vitest'
import { interpolate } from '../src/interpolator.js'

describe('interpolate', () => {
  const ctx = {
    vars: { KAFKA_BROKER_ID: 'broker-1', API_BASE: 'http://localhost:3000' },
    steps: { 'step-1': { payload: { orderId: 'ord_123' } } },
    runId: 'run-abc',
  }

  it('substitutes env vars', () => {
    expect(interpolate('{{KAFKA_BROKER_ID}}', ctx)).toBe('broker-1')
  })

  it('substitutes step references', () => {
    expect(interpolate('{{steps.step-1.payload.orderId}}', ctx)).toBe('ord_123')
  })

  it('substitutes $runId builtin', () => {
    expect(interpolate('run-{{$runId}}', ctx)).toBe('run-run-abc')
  })

  it('substitutes $uuid builtin (UUID format)', () => {
    const result = interpolate('{{$uuid}}', ctx) as string
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('recurses into objects', () => {
    const result = interpolate({ url: '{{API_BASE}}/orders' }, ctx)
    expect((result as { url: string }).url).toBe('http://localhost:3000/orders')
  })

  it('recurses into arrays', () => {
    const result = interpolate(['{{KAFKA_BROKER_ID}}'], ctx)
    expect(result).toEqual(['broker-1'])
  })

  it('returns non-string primitives unchanged', () => {
    expect(interpolate(42, ctx)).toBe(42)
    expect(interpolate(true, ctx)).toBe(true)
  })

  it('returns unknown var reference as empty string', () => {
    expect(interpolate('{{UNKNOWN_VAR}}', ctx)).toBe('')
  })
})
