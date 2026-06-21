// packages/core/tests/schema.test.ts
import { describe, it, expect } from 'vitest'
import { parseCollection } from '../src/schema.js'

describe('parseCollection', () => {
  it('parses a valid minimal collection', () => {
    const raw = {
      version: '1',
      name: 'Order Flow',
      flows: [{
        id: 'flow-1',
        name: 'Place Order',
        steps: [{
          id: 'step-1',
          type: 'producer',
          broker: '{{KAFKA_BROKER_ID}}',
          topic: 'order-events',
          payload: { orderId: '{{$uuid}}', amount: 99.99 }
        }]
      }]
    }
    const result = parseCollection(raw)
    expect(result.name).toBe('Order Flow')
    expect(result.flows[0].steps[0].type).toBe('producer')
  })

  it('throws on missing required fields', () => {
    expect(() => parseCollection({ name: 'x' })).toThrow()
  })

  it('throws on unknown step type', () => {
    expect(() => parseCollection({
      version: '1', name: 'x',
      flows: [{ id: 'f1', name: 'f', steps: [{ id: 's1', type: 'unknown' }] }]
    })).toThrow()
  })
})
