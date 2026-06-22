import { describe, it, expect } from 'vitest'
import { buildTopologyFromFlow } from './topology.js'
import type { Flow } from '@flowprobe/core'

const httpFlow: Flow = {
  id: 'f1', name: 'HTTP Echo',
  steps: [{ id: 's1', type: 'http-assert', method: 'GET', url: 'https://api.example.com/status', assertions: [] }]
}

const kafkaFlow: Flow = {
  id: 'f2', name: 'Kafka Order',
  steps: [
    { id: 'p1', type: 'producer', broker: 'kafka-local', topic: 'orders', payload: {} },
    { id: 'w1', type: 'wait', timeoutMs: 5000, consumer: { broker: 'kafka-local', topic: 'orders', groupId: 'fp-test' } },
  ]
}

describe('buildTopologyFromFlow', () => {
  it('http flow: produces runner node + http node + 1 edge', () => {
    const { nodes, edges } = buildTopologyFromFlow(httpFlow)
    expect(nodes.some(n => n.type === 'runner')).toBe(true)
    expect(nodes.some(n => n.type === 'http')).toBe(true)
    expect(edges).toHaveLength(1)
  })

  it('kafka flow: produces runner + kafka-topic + consumer nodes', () => {
    const { nodes, edges } = buildTopologyFromFlow(kafkaFlow)
    expect(nodes.some(n => n.type === 'kafka-topic')).toBe(true)
    expect(nodes.some(n => n.type === 'consumer')).toBe(true)
    expect(edges.length).toBeGreaterThan(0)
  })

  it('nodes get initial idle status', () => {
    const { nodes } = buildTopologyFromFlow(httpFlow)
    expect(nodes.every(n => n.status === 'idle')).toBe(true)
  })
})
