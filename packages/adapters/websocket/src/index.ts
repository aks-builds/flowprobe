// packages/adapters/websocket/src/index.ts
import { WebSocket } from 'ws'
import type { BrokerAdapter } from '@flowprobe/core'

export type WsConfig = { headers?: Record<string, string> }

export class WsAdapter implements BrokerAdapter {
  private ws: WebSocket | null = null

  constructor(private config: WsConfig = {}) {}

  async produce(wsUrl: string, payload: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, { headers: this.config.headers })
      ws.on('open', () => {
        ws.send(JSON.stringify(payload), (err) => {
          ws.close()
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
      ws.on('error', reject)
    })
  }

  async consume(wsUrl: string, _groupId: string, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, { headers: this.config.headers })
      this.ws = ws

      let settled = false
      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        fn()
      }

      const timer = setTimeout(() => {
        settle(() => {
          ws.close()
          reject(new Error(`ws timeout after ${timeoutMs}ms`))
        })
      }, timeoutMs)

      ws.on('message', (data) => {
        clearTimeout(timer)
        ws.close()
        settle(() => {
          try {
            resolve(JSON.parse(data.toString()))
          } catch {
            resolve(data.toString())
          }
        })
      })

      ws.on('error', (err) => {
        clearTimeout(timer)
        settle(() => reject(err))
      })
    })
  }

  async close(): Promise<void> {
    this.ws?.close()
    this.ws = null
  }
}
