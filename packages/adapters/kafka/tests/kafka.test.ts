// packages/adapters/kafka/tests/kafka.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('kafkajs', () => {
  const mockProducer = {
    connect: vi.fn(),
    send: vi.fn().mockResolvedValue([{ topicName: 'orders', partition: 0, errorCode: 0, offset: '42' }]),
    disconnect: vi.fn(),
  }
  const mockConsumer = {
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockImplementation(({ eachMessage }) => {
      // Delay eachMessage so the Promise constructor finishes registering first
      Promise.resolve().then(() =>
        eachMessage({ message: { value: Buffer.from('{"event":"order.created"}') } })
      )
      return Promise.resolve()
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
  }
  const Kafka = vi.fn().mockImplementation(() => ({
    producer: () => mockProducer,
    consumer: () => mockConsumer,
  }))
  const CompressionTypes = { GZIP: 1 }
  return { Kafka, CompressionTypes }
})

import { KafkaAdapter } from '../src/index.js'

describe('KafkaAdapter', () => {
  let adapter: KafkaAdapter

  beforeEach(() => {
    adapter = new KafkaAdapter({ brokers: ['localhost:9092'], clientId: 'fp-test' })
  })

  it('produce sends message and returns offset', async () => {
    const result = await adapter.produce('order-events', { orderId: 'ord_001', amount: 99.99 })
    expect((result as { offset: string }).offset).toBe('42')
  })

  it('consume receives message within timeout', async () => {
    const msg = await adapter.consume('order-events', 'fp-test-group', 5000)
    expect(msg).toEqual({ event: 'order.created' })
  })
})
