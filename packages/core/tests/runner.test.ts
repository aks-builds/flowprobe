// packages/core/tests/runner.test.ts
import { describe, it, expect, vi } from 'vitest'
import { FlowRunner } from '../src/runner.js'
import type { Collection } from '../src/schema.js'

const mockCollection: Collection = {
  version: '1',
  name: 'Test Collection',
  flows: [{
    id: 'flow-1',
    name: 'Test Flow',
    steps: [{
      id: 'step-1',
      type: 'producer',
      broker: 'KAFKA_ID',
      topic: 'test-events',
      payload: { id: 'test-123' }
    }]
  }]
}

describe('FlowRunner', () => {
  it('emits flow:start and flow:done events', async () => {
    const runner = new FlowRunner()
    const adapterRegistry = new Map([
      ['KAFKA_ID', {
        produce: vi.fn().mockResolvedValue({ offset: '0' }),
        close: vi.fn()
      }]
    ])
    runner.setAdapterRegistry(adapterRegistry)

    const events: string[] = []
    runner.on('flow:start', () => events.push('flow:start'))
    runner.on('flow:done', () => events.push('flow:done'))
    runner.on('step:pass', () => events.push('step:pass'))

    const result = await runner.run(mockCollection, { vars: {} })
    expect(events).toContain('flow:start')
    expect(events).toContain('flow:done')
    expect(events).toContain('step:pass')
    expect(result.passed).toBe(1)
    expect(result.failed).toBe(0)
  })

  it('marks step as failed when adapter throws', async () => {
    const runner = new FlowRunner()
    const adapterRegistry = new Map([
      ['KAFKA_ID', {
        produce: vi.fn().mockRejectedValue(new Error('Broker unavailable')),
        close: vi.fn()
      }]
    ])
    runner.setAdapterRegistry(adapterRegistry)

    const result = await runner.run(mockCollection, { vars: {} })
    expect(result.failed).toBe(1)
    expect(result.flows[0].steps[0].error).toContain('Broker unavailable')
  })
})
