import { randomUUID } from 'node:crypto'

export type StepResult = { payload: unknown; response?: unknown }
export type InterpolationContext = {
  vars: Record<string, string>
  steps: Record<string, StepResult>
  runId: string
}

function getNestedValue(obj: unknown, path: string): string {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return ''
    current = (current as Record<string, unknown>)[part]
  }
  return current !== undefined && current !== null ? String(current) : ''
}

function resolveToken(token: string, ctx: InterpolationContext): string {
  // Builtins
  if (token === '$uuid') return randomUUID()
  if (token === '$runId') return ctx.runId
  if (token === '$timestamp') return String(Date.now())
  if (token === '$isoDate') return new Date().toISOString()

  // Step references: steps.<stepId>.<path>
  if (token.startsWith('steps.')) {
    const rest = token.slice('steps.'.length)
    const dotIdx = rest.indexOf('.')
    if (dotIdx === -1) return ''
    const stepId = rest.slice(0, dotIdx)
    const path = rest.slice(dotIdx + 1)
    const stepResult = ctx.steps[stepId]
    if (!stepResult) return ''
    return getNestedValue(stepResult, path)
  }

  // Env vars
  return ctx.vars[token] ?? ''
}

export function interpolate(template: unknown, ctx: InterpolationContext): unknown {
  if (typeof template === 'string') {
    // Replace all {{...}} tokens
    return template.replace(/\{\{([^}]+)\}\}/g, (_, token: string) =>
      resolveToken(token.trim(), ctx)
    )
  }
  if (Array.isArray(template)) {
    return template.map(item => interpolate(item, ctx))
  }
  if (template !== null && typeof template === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(template)) {
      result[key] = interpolate(value, ctx)
    }
    return result
  }
  return template
}
