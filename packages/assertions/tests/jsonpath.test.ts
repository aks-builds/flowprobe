// packages/assertions/tests/jsonpath.test.ts
import { describe, it, expect } from 'vitest'
import { evaluateJsonPath } from '../src/jsonpath.js'

describe('evaluateJsonPath', () => {
  const payload = { reserved: true, quantity: 5, item: { sku: 'SKU-001' }, tags: ['urgent', 'priority'] }

  it('asserts boolean field eq', () => {
    const r = evaluateJsonPath(payload, { type: 'jsonpath', path: '$.reserved', expected: true })
    expect(r.passed).toBe(true)
  })

  it('asserts nested field eq', () => {
    const r = evaluateJsonPath(payload, { type: 'jsonpath', path: '$.item.sku', expected: 'SKU-001' })
    expect(r.passed).toBe(true)
  })

  it('asserts array element', () => {
    const r = evaluateJsonPath(payload, { type: 'jsonpath', path: '$.tags[0]', expected: 'urgent' })
    expect(r.passed).toBe(true)
  })

  it('fails on wrong value', () => {
    const r = evaluateJsonPath(payload, { type: 'jsonpath', path: '$.quantity', expected: 99 })
    expect(r.passed).toBe(false)
    expect(r.actual).toBe(5)
  })

  it('supports gt operator', () => {
    const r = evaluateJsonPath(payload, { type: 'jsonpath', path: '$.quantity', operator: 'gt', expected: 3 })
    expect(r.passed).toBe(true)
  })

  it('neq fails when objects are deeply equal', () => {
    const payload = { item: { sku: 'SKU-001' } }
    const r = evaluateJsonPath(payload, { type: 'jsonpath', path: '$.item', operator: 'neq', expected: { sku: 'SKU-001' } })
    expect(r.passed).toBe(false)
  })
})
