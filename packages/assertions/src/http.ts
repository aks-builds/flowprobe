// packages/assertions/src/http.ts
import type { HttpAssertStep, InterpolationContext } from '@flowprobe/core'
import { evaluateJsonPath, type AssertionResult } from './jsonpath.js'

export async function evaluateHttp(
  step: HttpAssertStep,
  _ctx: InterpolationContext
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = []
  const opts: RequestInit = {
    method: step.method,
    headers: { 'content-type': 'application/json', ...(step.headers ?? {}) },
    body: step.body ? JSON.stringify(step.body) : undefined,
  }

  let res: Response
  try {
    res = await fetch(step.url, opts)
  } catch (err) {
    return [{ passed: false, expected: 'successful HTTP response', actual: null, error: String(err) }]
  }

  let body: unknown = null
  try { body = await res.json() } catch { body = await res.text().catch(() => null) }

  for (const assertion of step.assertions) {
    if (assertion.type === 'status') {
      results.push({
        passed: res.status === assertion.expected,
        expected: assertion.expected,
        actual: res.status,
        path: 'status',
      })
    } else if (assertion.type === 'jsonpath') {
      results.push(evaluateJsonPath(body, assertion))
    }
  }
  return results
}
