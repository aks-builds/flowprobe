import { describe, it, expect, vi } from 'vitest'
import { evaluateDbAssertions } from './index.js'

describe('evaluateDbAssertions', () => {
  const rows = [{ id: 1, status: 'created', amount: 99.99 }]

  it('rowCount: passes when count matches', () => {
    const result = evaluateDbAssertions(rows, [{ type: 'rowCount', expected: 1 }])
    expect(result.passed).toBe(true)
  })

  it('rowCount: fails when count mismatches', () => {
    const result = evaluateDbAssertions(rows, [{ type: 'rowCount', expected: 2 }])
    expect(result.passed).toBe(false)
    expect(result.error).toContain('rowCount')
  })

  it('cellValue: passes when cell matches', () => {
    const result = evaluateDbAssertions(rows, [{ type: 'cellValue', row: 0, column: 'status', expected: 'created' }])
    expect(result.passed).toBe(true)
  })

  it('cellValue: fails when cell mismatches', () => {
    const result = evaluateDbAssertions(rows, [{ type: 'cellValue', row: 0, column: 'status', expected: 'pending' }])
    expect(result.passed).toBe(false)
  })
})
