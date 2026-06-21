// packages/adapters/rabbitmq/tests/rabbitmq.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockChannel = vi.hoisted(() => ({
  assertExchange: vi.fn().mockResolvedValue({}),
  assertQueue: vi.fn().mockResolvedValue({ queue: 'test-queue' }),
  bindQueue: vi.fn().mockResolvedValue({}),
  publish: vi.fn().mockReturnValue(true),
  consume: vi.fn().mockImplementation((_queue: string, cb: (msg: unknown) => void) => {
    cb({ content: Buffer.from('{"event":"inventory.reserved"}'), properties: {}, fields: {} })
    return Promise.resolve({ consumerTag: 'fp-consumer' })
  }),
  cancel: vi.fn(),
  close: vi.fn(),
}))

const mockConn = vi.hoisted(() => ({
  createChannel: vi.fn().mockResolvedValue(mockChannel),
  close: vi.fn(),
}))

vi.mock('amqplib', () => ({
  default: { connect: vi.fn().mockResolvedValue(mockConn) },
  connect: vi.fn().mockResolvedValue(mockConn),
}))

import { RabbitAdapter } from '../src/index.js'

describe('RabbitAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConn.createChannel.mockResolvedValue(mockChannel)
    mockChannel.assertExchange.mockResolvedValue({})
    mockChannel.assertQueue.mockResolvedValue({ queue: 'test-queue' })
    mockChannel.publish.mockReturnValue(true)
    mockChannel.consume.mockImplementation((_queue: string, cb: (msg: unknown) => void) => {
      cb({ content: Buffer.from('{"event":"inventory.reserved"}'), properties: {}, fields: {} })
      return Promise.resolve({ consumerTag: 'fp-consumer' })
    })
  })

  it('produce publishes message to exchange', async () => {
    const adapter = new RabbitAdapter({ url: 'amqp://localhost' })
    await adapter.produce('inventory-exchange', { event: 'order.created' })
    expect(mockChannel.publish).toHaveBeenCalledWith(
      'inventory-exchange',
      '',
      expect.any(Buffer),
      expect.any(Object)
    )
  })

  it('produce asserts fanout exchange as durable', async () => {
    const adapter = new RabbitAdapter({ url: 'amqp://localhost' })
    await adapter.produce('inventory-exchange', { event: 'order.created' })
    expect(mockChannel.assertExchange).toHaveBeenCalledWith(
      'inventory-exchange',
      'fanout',
      { durable: true }
    )
  })

  it('produce serialises payload as JSON Buffer', async () => {
    const adapter = new RabbitAdapter({ url: 'amqp://localhost' })
    await adapter.produce('test-exchange', { foo: 'bar' })
    const [, , contentArg] = mockChannel.publish.mock.calls[0]
    expect(contentArg).toBeInstanceOf(Buffer)
    expect(JSON.parse((contentArg as Buffer).toString())).toEqual({ foo: 'bar' })
  })

  it('produce sets contentType and persistent options', async () => {
    const adapter = new RabbitAdapter({ url: 'amqp://localhost' })
    await adapter.produce('test-exchange', { foo: 'bar' })
    const [, , , optionsArg] = mockChannel.publish.mock.calls[0]
    expect(optionsArg).toMatchObject({ contentType: 'application/json', persistent: true })
  })

  it('consume receives message from queue', async () => {
    const adapter = new RabbitAdapter({ url: 'amqp://localhost' })
    const msg = await adapter.consume('inventory-queue', 'fp-group', 3000)
    expect(msg).toEqual({ event: 'inventory.reserved' })
  })

  it('consume asserts queue as durable', async () => {
    const adapter = new RabbitAdapter({ url: 'amqp://localhost' })
    await adapter.consume('inventory-queue', 'fp-group', 3000)
    expect(mockChannel.assertQueue).toHaveBeenCalledWith('inventory-queue', { durable: true })
  })

  it('close shuts channel and connection', async () => {
    mockChannel.close.mockResolvedValue(undefined)
    mockConn.close.mockResolvedValue(undefined)
    const adapter = new RabbitAdapter({ url: 'amqp://localhost' })
    await adapter.produce('ex', {})
    await adapter.close()
    expect(mockChannel.close).toHaveBeenCalled()
    expect(mockConn.close).toHaveBeenCalled()
  })

  it('getChannel reuses existing connection and channel', async () => {
    const adapter = new RabbitAdapter({ url: 'amqp://localhost' })
    await adapter.produce('ex1', {})
    await adapter.produce('ex2', {})
    const amqplib = await import('amqplib')
    // @ts-expect-error default is the mock object
    expect(amqplib.default.connect).toHaveBeenCalledTimes(1)
    expect(mockConn.createChannel).toHaveBeenCalledTimes(1)
  })
})
