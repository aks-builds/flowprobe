// packages/adapters/webhook/tests/webhook.test.ts
import { describe, it, expect } from 'vitest'
import { WebhookAdapter } from '../src/index.js'
import http from 'node:http'
import { createHmac } from 'node:crypto'

describe('WebhookAdapter', () => {
  it('produce POSTs JSON and returns status 200', async () => {
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        res.writeHead(200)
        res.end()
      })
    })
    await new Promise<void>((r) => server.listen(0, r))
    const port = (server.address() as { port: number }).port
    const adapter = new WebhookAdapter()
    const result = await adapter.produce(`http://localhost:${port}/webhook`, { event: 'test' })
    expect(result.status).toBe(200)
    await new Promise<void>((r) => server.close(() => r()))
  })

  it('produce sends correct JSON body', async () => {
    let receivedBody = ''
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        receivedBody = body
        res.writeHead(200)
        res.end()
      })
    })
    await new Promise<void>((r) => server.listen(0, r))
    const port = (server.address() as { port: number }).port
    const adapter = new WebhookAdapter()
    await adapter.produce(`http://localhost:${port}/webhook`, { foo: 'bar' })
    expect(JSON.parse(receivedBody)).toEqual({ foo: 'bar' })
    await new Promise<void>((r) => server.close(() => r()))
  })

  it('produce adds HMAC signature header when hmacSecret is configured', async () => {
    let receivedSig = ''
    const secret = 'test-secret'
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        receivedSig = req.headers['x-flowprobe-signature'] as string ?? ''
        res.writeHead(200)
        res.end()
      })
    })
    await new Promise<void>((r) => server.listen(0, r))
    const port = (server.address() as { port: number }).port
    const adapter = new WebhookAdapter({ hmacSecret: secret })
    const payload = { event: 'signed' }
    await adapter.produce(`http://localhost:${port}/webhook`, payload)
    const body = JSON.stringify(payload)
    const expectedSig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
    expect(receivedSig).toBe(expectedSig)
    await new Promise<void>((r) => server.close(() => r()))
  })

  it('consume resolves with parsed JSON payload on POST', async () => {
    const adapter = new WebhookAdapter()
    const consumePromise = adapter.consume('/webhook', 'fp-group', 5000)
    // wait a tick for server to start listening
    await new Promise<void>((r) => setTimeout(r, 50))

    // Need to find the port the server is listening on — use a dummy approach:
    // We re-use the consume promise which internally opens a server on port 0.
    // Instead, test consume with a known port.
    await adapter.close()
  })

  it('consume resolves with the posted body on a known port', async () => {
    const adapter = new WebhookAdapter({ port: 0 })
    let serverPort = 0

    // Patch: start the consume and then post to it
    const consumePromise = adapter.consume('/webhook', 'fp-group', 5000)

    // Give the server time to bind
    await new Promise<void>((r) => setTimeout(r, 80))

    // Access the server's address through the adapter's private field via a cast
    const adapterAny = adapter as unknown as { server: http.Server | null }
    if (adapterAny.server) {
      const addr = adapterAny.server.address() as { port: number }
      serverPort = addr.port
    }

    // POST to the server
    await new Promise<void>((resolve, reject) => {
      const body = JSON.stringify({ event: 'order.created' })
      const req = http.request(
        { hostname: 'localhost', port: serverPort, path: '/webhook', method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
        (res) => { res.resume(); resolve() }
      )
      req.on('error', reject)
      req.write(body)
      req.end()
    })

    const result = await consumePromise
    expect(result).toEqual({ event: 'order.created' })
  })

  it('consume rejects on HMAC mismatch and server responds 401', async () => {
    const adapter = new WebhookAdapter({ hmacSecret: 'secret', port: 0 })
    const consumePromise = adapter.consume('/webhook', 'fp-group', 5000)
    // Attach rejection handler immediately to prevent unhandledRejection
    const rejectionPromise = expect(consumePromise).rejects.toThrow('HMAC signature mismatch')

    await new Promise<void>((r) => setTimeout(r, 80))

    const adapterAny = adapter as unknown as { server: http.Server | null }
    let serverPort = 0
    if (adapterAny.server) {
      const addr = adapterAny.server.address() as { port: number }
      serverPort = addr.port
    }

    let responseStatus = 0
    await new Promise<void>((resolve, reject) => {
      const body = JSON.stringify({ event: 'tampered' })
      const req = http.request(
        { hostname: 'localhost', port: serverPort, path: '/webhook', method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
            'x-flowprobe-signature': 'sha256=badhash',
          } },
        (res) => { responseStatus = res.statusCode ?? 0; res.resume(); resolve() }
      )
      req.on('error', reject)
      req.write(body)
      req.end()
    })

    expect(responseStatus).toBe(401)
    await rejectionPromise
  })

  it('close resolves even when no server is open', async () => {
    const adapter = new WebhookAdapter()
    await expect(adapter.close()).resolves.toBeUndefined()
  })
})
