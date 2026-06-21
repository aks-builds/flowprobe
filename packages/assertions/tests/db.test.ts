// packages/assertions/tests/db.test.ts
import { describe, it, expect, vi } from 'vitest'
import { evaluateDb, type DbConnection } from '../src/db.js'
import type { DbAssertStep } from '@flowprobe/core'

function makeConn(rows: Record<string, unknown>[]): DbConnection {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

describe('evaluateDb', () => {
  it('passes rowCount assertion when row count matches', async () => {
    const conn = makeConn([{ id: 1, sku: 'SKU-001' }, { id: 2, sku: 'SKU-002' }])
    const registry = new Map<string, DbConnection>([['main', conn]])
    const step: DbAssertStep = {
      id: 'step-1',
      type: 'db-assert',
      connection: 'main',
      query: 'SELECT * FROM orders',
      params: [],
      assertions: [{ type: 'rowCount', expected: 2 }],
    }
    const results = await evaluateDb(step, registry)
    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(true)
    expect(results[0].actual).toBe(2)
  })

  it('fails rowCount assertion when count mismatches', async () => {
    const conn = makeConn([])
    const registry = new Map<string, DbConnection>([['main', conn]])
    const step: DbAssertStep = {
      id: 'step-2',
      type: 'db-assert',
      connection: 'main',
      query: 'SELECT * FROM orders WHERE status = $1',
      params: ['pending'],
      assertions: [{ type: 'rowCount', expected: 5 }],
    }
    const results = await evaluateDb(step, registry)
    expect(results[0].passed).toBe(false)
    expect(results[0].actual).toBe(0)
    expect(results[0].expected).toBe(5)
  })

  it('passes cell assertion on matching value', async () => {
    const conn = makeConn([{ sku: 'SKU-001', reserved: true }])
    const registry = new Map<string, DbConnection>([['main', conn]])
    const step: DbAssertStep = {
      id: 'step-3',
      type: 'db-assert',
      connection: 'main',
      query: 'SELECT sku, reserved FROM inventory WHERE id = $1',
      params: ['1'],
      assertions: [{ type: 'cell', row: 0, col: 'sku', expected: 'SKU-001' }],
    }
    const results = await evaluateDb(step, registry)
    expect(results[0].passed).toBe(true)
    expect(results[0].actual).toBe('SKU-001')
  })

  it('returns error result when connection is missing', async () => {
    const registry = new Map<string, DbConnection>()
    const step: DbAssertStep = {
      id: 'step-4',
      type: 'db-assert',
      connection: 'missing-db',
      query: 'SELECT 1',
      params: [],
      assertions: [{ type: 'rowCount', expected: 1 }],
    }
    const results = await evaluateDb(step, registry)
    expect(results[0].passed).toBe(false)
    expect(results[0].error).toContain('missing-db')
  })

  it('returns error result when query throws', async () => {
    const conn: DbConnection = {
      query: vi.fn().mockRejectedValue(new Error('syntax error')),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const registry = new Map<string, DbConnection>([['main', conn]])
    const step: DbAssertStep = {
      id: 'step-5',
      type: 'db-assert',
      connection: 'main',
      query: 'INVALID SQL',
      params: [],
      assertions: [{ type: 'rowCount', expected: 1 }],
    }
    const results = await evaluateDb(step, registry)
    expect(results[0].passed).toBe(false)
    expect(results[0].error).toContain('syntax error')
  })
})
