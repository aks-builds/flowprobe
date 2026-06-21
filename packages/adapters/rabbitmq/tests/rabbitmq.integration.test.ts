// packages/adapters/rabbitmq/tests/rabbitmq.integration.test.ts
//
// Integration tests for RabbitAdapter using a real RabbitMQ broker via @testcontainers/rabbitmq.
// These tests are opt-in and DO NOT run in normal CI.
//
// To run locally (requires Docker):
//   INTEGRATION=1 pnpm test
//
// Note: @testcontainers/rabbitmq and its transitive deps (ssh2, cpu-features, protobufjs)
// require native build scripts. These have been approved in pnpm-workspace.yaml:
//   allowBuilds: { cpu-features: true, protobufjs: true, ssh2: true }
// ssh2's optional crypto binding may fail on Windows if Visual Studio C++ tools are absent
// (it falls back to pure-JS, which is sufficient for Docker socket communication).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RabbitMQContainer } from '@testcontainers/rabbitmq'
import { RabbitAdapter } from '../src/index.js'

describe.skipIf(!process.env.INTEGRATION)('RabbitAdapter integration', () => {
  let container: Awaited<ReturnType<InstanceType<typeof RabbitMQContainer>['start']>>
  let amqpUrl: string

  beforeAll(async () => {
    const r = new RabbitMQContainer('rabbitmq:3.13-management')
    container = await r.start()
    amqpUrl = container.getAmqpUrl()
  }, 120_000)

  afterAll(async () => {
    await container?.stop()
  })

  it('publish and consume a message via fanout exchange', async () => {
    const adapter = new RabbitAdapter({ url: amqpUrl })
    const exchange = 'integ-test-orders'
    const queue = 'integ-test-inventory-queue'
    const payload = { orderId: 'ord_rabbit_001', event: 'order.created' }

    // Must bind the queue to the exchange before publishing so the message is routed
    const amqplib = await import('amqplib')
    const conn = await amqplib.connect(amqpUrl)
    const ch = await conn.createChannel()
    await ch.assertExchange(exchange, 'fanout', { durable: true })
    await ch.assertQueue(queue, { durable: true })
    await ch.bindQueue(queue, exchange, '')
    await ch.close()
    await conn.close()

    // Start consuming, then publish — ordering matters for fanout queues
    const consumePromise = adapter.consume(queue, 'integ-group', 10_000)
    await new Promise(r => setTimeout(r, 200))
    await adapter.produce(exchange, payload)

    const received = await consumePromise
    expect((received as typeof payload).event).toBe('order.created')
    expect((received as typeof payload).orderId).toBe('ord_rabbit_001')

    await adapter.close()
  }, 60_000)
})
