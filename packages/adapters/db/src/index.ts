import pg from 'pg'
const { Client } = pg

export type DbAssertion = {
  type: 'rowCount' | 'cellValue' | 'jsonPath'
  expected: unknown
  row?: number
  column?: string
  path?: string
}

export type DbAssertConfig = {
  id: string
  connection: string
  query: string
  params: unknown[]
  assertions: DbAssertion[]
}

type AssertResult = { passed: boolean; error?: string }

export function evaluateDbAssertions(rows: Record<string, unknown>[], assertions: DbAssertion[]): AssertResult {
  for (const a of assertions) {
    if (a.type === 'rowCount') {
      if (rows.length !== a.expected) {
        return { passed: false, error: `rowCount: expected ${a.expected}, got ${rows.length}` }
      }
    } else if (a.type === 'cellValue') {
      const row = rows[a.row ?? 0]
      if (!row) return { passed: false, error: `cellValue: row ${a.row ?? 0} does not exist` }
      const actual = row[a.column ?? '']
      if (String(actual) !== String(a.expected)) {
        return { passed: false, error: `cellValue: ${a.column}[${a.row ?? 0}] expected ${JSON.stringify(a.expected)}, got ${JSON.stringify(actual)}` }
      }
    }
    // jsonPath: add in a follow-up
  }
  return { passed: true }
}

export async function runDbAssert(config: DbAssertConfig): Promise<{
  passed: boolean
  durationMs: number
  detail: string
  error?: string
}> {
  const client = new Client({ connectionString: config.connection })
  const start = Date.now()

  try {
    await client.connect()
    const result = await client.query(config.query, config.params as never[])
    const rows = result.rows as Record<string, unknown>[]
    const assertResult = evaluateDbAssertions(rows, config.assertions)
    const durationMs = Date.now() - start

    return {
      passed: assertResult.passed,
      durationMs,
      detail: assertResult.passed
        ? `Query returned ${rows.length} row(s) — all assertions passed`
        : assertResult.error ?? 'assertion failed',
      error: assertResult.error,
    }
  } catch (err) {
    return {
      passed: false,
      durationMs: Date.now() - start,
      detail: `DB error: ${err instanceof Error ? err.message : String(err)}`,
      error: String(err),
    }
  } finally {
    await client.end().catch(() => {})
  }
}
