// packages/core/tests/reporter.test.ts
import { describe, it, expect } from 'vitest'
import { generateJUnit, generateJson, generateHtml } from '../src/reporter.js'
import type { RunResult } from '../src/runner.js'

const sampleResult: RunResult = {
  runId: 'run-abc',
  passed: 2,
  failed: 1,
  durationMs: 1240,
  flows: [{
    id: 'flow-1',
    name: 'Place Order Flow',
    passed: false,
    durationMs: 1240,
    steps: [
      { id: 'step-1', type: 'producer', passed: true, durationMs: 98 },
      { id: 'step-2', type: 'wait', passed: true, durationMs: 882 },
      { id: 'step-3', type: 'http-assert', passed: false, durationMs: 260, error: 'Expected 200, got 503' },
    ]
  }]
}

describe('reporters', () => {
  it('generateJUnit produces valid XML with testsuites root', () => {
    const xml = generateJUnit(sampleResult)
    expect(xml).toContain('<?xml version="1.0"')
    expect(xml).toContain('<testsuites')
    expect(xml).toContain('Place Order Flow')
    expect(xml).toContain('Expected 200, got 503')
    expect(xml).toContain('failures="1"')
  })

  it('generateJson round-trips correctly', () => {
    const json = generateJson(sampleResult)
    const parsed = JSON.parse(json)
    expect(parsed.runId).toBe('run-abc')
    expect(parsed.passed).toBe(2)
    expect(parsed.failed).toBe(1)
  })

  it('generateHtml contains result summary', () => {
    const html = generateHtml(sampleResult)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Place Order Flow')
    expect(html).toContain('2 passed')
    expect(html).toContain('1 failed')
  })
})
