// packages/assertions/src/jsonpath.ts
import type { Assertion } from '@flowprobe/core'

export type AssertionResult = {
  passed: boolean
  expected: unknown
  actual: unknown
  path?: string
  error?: string
}

function getValueByPath(obj: unknown, path: string): unknown {
  if (path === '$') return obj
  // Simple dot-notation: $.field.nested or $.arr[0]
  const cleaned = path.replace(/^\$\.?/, '')
  const parts = cleaned.split('.').flatMap(p => {
    const m = p.match(/^(\w+)\[(\d+)\]$/)
    return m ? [m[1], Number(m[2])] : [p]
  })
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof part === 'number') current = (current as unknown[])[part]
    else current = (current as Record<string, unknown>)[part]
  }
  return current
}

function compare(actual: unknown, operator: Assertion['operator'], expected: unknown): boolean {
  switch (operator) {
    case 'eq': return actual === expected || JSON.stringify(actual) === JSON.stringify(expected)
    case 'neq': return actual !== expected
    case 'gt': return Number(actual) > Number(expected)
    case 'lt': return Number(actual) < Number(expected)
    case 'contains': return String(actual).includes(String(expected))
    case 'matches': return new RegExp(String(expected)).test(String(actual))
    case 'exists': return actual !== undefined && actual !== null
    case 'type': return typeof actual === expected
    default: return false
  }
}

export function evaluateJsonPath(payload: unknown, assertion: Assertion): AssertionResult {
  if (!assertion.path) {
    return { passed: false, expected: assertion.expected, actual: null, error: 'assertion.path is required for jsonpath' }
  }
  const actual = getValueByPath(payload, assertion.path)
  const passed = compare(actual, assertion.operator ?? 'eq', assertion.expected)
  return { passed, expected: assertion.expected, actual, path: assertion.path }
}
