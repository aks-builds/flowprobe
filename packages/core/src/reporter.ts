// packages/core/src/reporter.ts
import type { RunResult } from './runner.js'

export function generateJUnit(result: RunResult): string {
  const escXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const suites = result.flows.map(flow => {
    const cases = flow.steps.map(step => {
      const base = `<testcase name="${escXml(step.id)}" classname="${escXml(flow.name)}" time="${(step.durationMs / 1000).toFixed(3)}">`
      const failure = step.passed
        ? ''
        : `<failure message="${escXml(step.error ?? 'Step failed')}">${escXml(step.error ?? '')}</failure>`
      return `${base}${failure}</testcase>`
    }).join('\n    ')
    const failures = flow.steps.filter(s => !s.passed).length
    return `  <testsuite name="${escXml(flow.name)}" tests="${flow.steps.length}" failures="${failures}" time="${(flow.durationMs / 1000).toFixed(3)}">\n    ${cases}\n  </testsuite>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="${result.passed + result.failed}" failures="${result.failed}" time="${(result.durationMs / 1000).toFixed(3)}">\n${suites}\n</testsuites>`
}

export function generateJson(result: RunResult): string {
  return JSON.stringify(result, null, 2)
}

export function generateHtml(result: RunResult): string {
  const flowsHtml = result.flows.map(flow => {
    const stepsHtml = flow.steps.map(step => {
      const icon = step.passed ? '&#10003;' : '&#10007;'
      const color = step.passed ? '#16a34a' : '#dc2626'
      const err = step.error
        ? `<div style="color:#dc2626;font-size:12px;margin-top:4px;">${step.error}</div>`
        : ''
      return `<div style="padding:8px 12px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;"><span style="color:${color};font-weight:700;">${icon}</span><span style="font-size:13px;color:#1e293b;">${step.id}</span><span style="font-size:11px;color:#94a3b8;margin-left:auto;">${step.durationMs}ms</span>${err}</div>`
    }).join('')
    return `<div style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;overflow:hidden;"><div style="padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:14px;">${flow.name}</div>${stepsHtml}</div>`
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>FlowProbe Results</title><style>*{box-sizing:border-box;font-family:system-ui,sans-serif;}body{background:#f8fafc;padding:24px;max-width:800px;margin:0 auto;}</style></head><body><h1 style="font-size:24px;font-weight:700;color:#0f172a;">FlowProbe Run Results</h1><div style="display:flex;gap:12px;margin:16px 0;"><span style="background:#f0fdf4;color:#16a34a;padding:4px 12px;border-radius:10px;font-size:13px;font-weight:600;">${result.passed} passed</span><span style="background:#fef2f2;color:#dc2626;padding:4px 12px;border-radius:10px;font-size:13px;font-weight:600;">${result.failed} failed</span><span style="color:#94a3b8;font-size:13px;margin-left:auto;">${result.durationMs}ms &middot; Run ${result.runId}</span></div>${flowsHtml}</body></html>`
}
