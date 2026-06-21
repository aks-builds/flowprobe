// packages/adapters/websocket/tests/websocket.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

// ---------------------------------------------------------------------------
// Mock the ws module — use vi.hoisted so MockWebSocket is available when
// vi.mock factory runs (vi.mock is hoisted to top of file by vitest)
// ---------------------------------------------------------------------------

const { MockWebSocket, mockWsInstances } = vi.hoisted(() => {
  const mockWsInstances: Array<EventEmitter & {
    send: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }> = []

  const MockWebSocket = vi.fn().mockImplementation(() => {
    const emitter = new EventEmitter() as EventEmitter & {
      send: ReturnType<typeof vi.fn>
      close: ReturnType<typeof vi.fn>
    }
    emitter.send = vi.fn().mockImplementation((_data: string, cb?: (err?: Error) => void) => {
      if (cb) cb()
    })
    emitter.close = vi.fn()
    mockWsInstances.push(emitter)
    return emitter
  })

  return { MockWebSocket, mockWsInstances }
})

vi.mock('ws', () => ({
  WebSocket: MockWebSocket,
}))

import { WsAdapter } from '../src/index.js'

// ---------------------------------------------------------------------------

describe('WsAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWsInstances.length = 0
  })

  describe('produce', () => {
    it('sends JSON payload and resolves', async () => {
      const adapter = new WsAdapter()
      const producePromise = adapter.produce('ws://localhost:9999/events', { event: 'order.created' })

      // Simulate 'open' event
      const wsInst = mockWsInstances[0]
      wsInst.emit('open')

      await producePromise
      expect(wsInst.send).toHaveBeenCalledWith(
        JSON.stringify({ event: 'order.created' }),
        expect.any(Function)
      )
    })

    it('calls close after sending', async () => {
      const adapter = new WsAdapter()
      const producePromise = adapter.produce('ws://localhost:9999/events', { val: 1 })
      const wsInst = mockWsInstances[0]
      wsInst.emit('open')
      await producePromise
      expect(wsInst.close).toHaveBeenCalled()
    })

    it('rejects on WebSocket error', async () => {
      const adapter = new WsAdapter()
      const producePromise = adapter.produce('ws://localhost:9999/events', {})
      // Attach rejection handler before emitting to avoid unhandledRejection
      const rejectionPromise = expect(producePromise).rejects.toThrow('connection refused')
      const wsInst = mockWsInstances[0]
      wsInst.emit('error', new Error('connection refused'))
      await rejectionPromise
    })

    it('passes headers from config to WebSocket constructor', async () => {
      const adapter = new WsAdapter({ headers: { Authorization: 'Bearer token123' } })
      const producePromise = adapter.produce('ws://localhost:9999/events', {})
      const wsInst = mockWsInstances[0]
      wsInst.emit('open')
      await producePromise
      expect(MockWebSocket).toHaveBeenCalledWith(
        'ws://localhost:9999/events',
        expect.objectContaining({ headers: { Authorization: 'Bearer token123' } })
      )
    })
  })

  describe('consume', () => {
    it('resolves with parsed JSON message', async () => {
      const adapter = new WsAdapter()
      const consumePromise = adapter.consume('ws://localhost:9999/events', 'fp-group', 5000)

      const wsInst = mockWsInstances[0]
      wsInst.emit('message', Buffer.from(JSON.stringify({ event: 'inventory.reserved' })))

      const result = await consumePromise
      expect(result).toEqual({ event: 'inventory.reserved' })
    })

    it('resolves with raw string when JSON.parse fails', async () => {
      const adapter = new WsAdapter()
      const consumePromise = adapter.consume('ws://localhost:9999/events', 'fp-group', 5000)

      const wsInst = mockWsInstances[0]
      wsInst.emit('message', Buffer.from('plain-text'))

      const result = await consumePromise
      expect(result).toBe('plain-text')
    })

    it('closes WebSocket after receiving message', async () => {
      const adapter = new WsAdapter()
      const consumePromise = adapter.consume('ws://localhost:9999/events', 'fp-group', 5000)

      const wsInst = mockWsInstances[0]
      wsInst.emit('message', Buffer.from(JSON.stringify({ ok: true })))
      await consumePromise

      expect(wsInst.close).toHaveBeenCalled()
    })

    it('rejects after timeout', async () => {
      const adapter = new WsAdapter()
      const consumePromise = adapter.consume('ws://localhost:9999/events', 'fp-group', 50)
      // Attach rejection handler immediately
      const rejectionPromise = expect(consumePromise).rejects.toThrow('ws timeout after 50ms')
      await rejectionPromise
    })

    it('rejects on WebSocket error', async () => {
      const adapter = new WsAdapter()
      const consumePromise = adapter.consume('ws://localhost:9999/events', 'fp-group', 5000)
      // Attach rejection handler before emitting error
      const rejectionPromise = expect(consumePromise).rejects.toThrow('ws error')

      const wsInst = mockWsInstances[0]
      wsInst.emit('error', new Error('ws error'))

      await rejectionPromise
    })
  })

  describe('close', () => {
    it('closes the stored ws instance', async () => {
      const adapter = new WsAdapter()
      // Start consume to store a ws instance internally
      const consumePromise = adapter.consume('ws://localhost:9999/events', 'fp-group', 5000)
      const wsInst = mockWsInstances[0]

      await adapter.close()
      expect(wsInst.close).toHaveBeenCalled()

      // Resolve the dangling consume to avoid test hanging
      wsInst.emit('message', Buffer.from('{}'))
      await consumePromise.catch(() => {})
    })

    it('resolves when no ws is open', async () => {
      const adapter = new WsAdapter()
      await expect(adapter.close()).resolves.toBeUndefined()
    })
  })
})
