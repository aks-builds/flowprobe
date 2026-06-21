// packages/adapters/kafka/tests/kafka.integration.test.ts
//
// Integration tests for KafkaAdapter using a real Kafka broker via @testcontainers/kafka.
// These tests are opt-in and DO NOT run in normal CI.
//
// To run locally (requires Docker):
//   INTEGRATION=1 pnpm test
//
// Note: @testcontainers/kafka and its transitive deps (ssh2, cpu-features, protobufjs)
// require native build scripts. These have been approved in pnpm-workspace.yaml:
//   allowBuilds: { cpu-features: true, protobufjs: true, ssh2: true }
// ssh2's optional crypto binding may fail on Windows if Visual Studio C++ tools are absent
// (it falls back to pure-JS, which is sufficient for Docker socket communication).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { KafkaContainer } from '@testcontainers/kafka'
import { KafkaAdapter } from '../src/index.js'

describe.skipIf(!process.env.INTEGRATION)('KafkaAdapter integration', () => {
  let container: Awaited<ReturnType<KafkaContainer['start']>>
  let broker: string

  beforeAll(async () => {
    const k = new KafkaContainer('confluentinc/cp-kafka:7.6.0').withKraft()
    container = await k.start()
    broker = `${container.getHost()}:${container.getMappedPort(9093)}`
  }, 120_000)

  afterAll(async () => {
    await container?.stop()
  })

  it('produce then consume a message end-to-end', async () => {
    const adapter = new KafkaAdapter({ brokers: [broker], clientId: 'fp-integ-test' })
    const payload = { orderId: 'ord_integ_001', amount: 149.99, event: 'order.created' }
    const topic = 'integration-test-orders'

    // Produce
    const { offset } = await adapter.produce(topic, payload)
    expect(parseInt(offset)).toBeGreaterThanOrEqual(0)

    // Consume — use a fresh consumer group so it reads from the beginning
    // Subscribe fromBeginning is set to false in the adapter, so we rely on the message
    // being produced immediately before consuming in this same group
    const received = await adapter.consume(topic, `fp-integ-group-${Date.now()}`, 15_000)
    expect((received as typeof payload).event).toBe('order.created')
    expect((received as typeof payload).orderId).toBe('ord_integ_001')

    await adapter.close()
  }, 60_000)
})
