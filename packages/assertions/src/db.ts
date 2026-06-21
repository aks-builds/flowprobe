// packages/assertions/src/db.ts
import type { DbAssertStep } from '@flowprobe/core'
import type { AssertionResult } from './jsonpath.js'

export type DbConnection = {
  query(sql: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  close(): Promise<void>
}

export async function evaluateDb(
  step: DbAssertStep,
  connRegistry: Map<string, DbConnection>
): Promise<AssertionResult[]> {
  const conn = connRegistry.get(step.connection)
  if (!conn) return [{ passed: false, expected: 'db connection', actual: null, error: `No connection for: ${step.connection}` }]

  let rows: Record<string, unknown>[] = []
  try {
    const result = await conn.query(step.query, step.params)
    rows = result.rows
  } catch (err) {
    return [{ passed: false, expected: 'query success', actual: null, error: String(err) }]
  }

  return step.assertions.map(assertion => {
    if (assertion.type === 'rowCount') {
      return { passed: rows.length === assertion.expected, expected: assertion.expected, actual: rows.length }
    }
    if (assertion.type === 'cell' && assertion.row !== undefined && assertion.col) {
      const row = rows[assertion.row]
      const actual = row?.[assertion.col]
      return { passed: actual === assertion.expected, expected: assertion.expected, actual }
    }
    return { passed: false, expected: assertion.expected, actual: null, error: `Unknown db assertion type: ${assertion.type}` }
  })
}
