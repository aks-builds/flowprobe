// packages/adapters/webhook/src/index.ts
import http from 'node:http'
import { createHmac } from 'node:crypto'
import type { BrokerAdapter } from '@flowprobe/core'

export type WebhookConfig = { hmacSecret?: string; port?: number }

export class WebhookAdapter implements BrokerAdapter {
  private server: http.Server | null = null

  constructor(private config: WebhookConfig = {}) {}

  async produce(url: string, payload: unknown, headers?: Record<string, string>): Promise<{ status: number }> {
    const body = JSON.stringify(payload)
    const extraHeaders: Record<string, string | number> = {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
      ...headers,
    }
    if (this.config.hmacSecret) {
      const sig = createHmac('sha256', this.config.hmacSecret).update(body).digest('hex')
      extraHeaders['x-flowprobe-signature'] = `sha256=${sig}`
    }
    return new Promise((resolve, reject) => {
      const u = new URL(url)
      const options: http.RequestOptions = {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + u.search,
        method: 'POST',
        headers: extraHeaders,
      }
      const req = http.request(options, (res) => {
        // Drain the response so the socket is freed
        res.resume()
        resolve({ status: res.statusCode ?? 0 })
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }

  async consume(_listenPath: string, _groupId: string, timeoutMs: number): Promise<unknown> {
    const port = this.config.port ?? 0
    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        fn()
      }

      const timer = setTimeout(() => {
        settle(() => {
          this.server?.close()
          reject(new Error(`webhook timeout after ${timeoutMs}ms`))
        })
      }, timeoutMs)

      this.server = http.createServer((req, res) => {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          if (this.config.hmacSecret) {
            const sig = req.headers['x-flowprobe-signature'] ?? ''
            const expected = 'sha256=' + createHmac('sha256', this.config.hmacSecret!).update(body).digest('hex')
            if (sig !== expected) {
              res.writeHead(401)
              res.end()
              settle(() => {
                clearTimeout(timer)
                this.server?.close()
                reject(new Error('HMAC signature mismatch'))
              })
              return
            }
          }
          res.writeHead(200)
          res.end()
          settle(() => {
            clearTimeout(timer)
            this.server?.close()
            try {
              resolve(JSON.parse(body))
            } catch {
              resolve(body)
            }
          })
        })
      })

      this.server.listen(port)
    })
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => resolve())
      } else {
        resolve()
      }
    })
    this.server = null
  }
}
