// packages/adapters/rabbitmq/src/index.ts
import amqplib, { type Connection, type Channel } from 'amqplib'
import type { BrokerAdapter } from '@flowprobe/core'

export type RabbitConfig = { url: string; tls?: boolean }

export class RabbitAdapter implements BrokerAdapter {
  private conn: Connection | null = null
  private channel: Channel | null = null

  constructor(private config: RabbitConfig) {}

  private async getChannel(): Promise<Channel> {
    if (!this.conn) {
      this.conn = await amqplib.connect(this.config.url)
    }
    if (!this.channel) {
      this.channel = await this.conn.createChannel()
    }
    return this.channel
  }

  async produce(exchange: string, payload: unknown, headers?: Record<string, string>): Promise<void> {
    const ch = await this.getChannel()
    await ch.assertExchange(exchange, 'fanout', { durable: true })
    const content = Buffer.from(JSON.stringify(payload))
    ch.publish(exchange, '', content, {
      contentType: 'application/json',
      headers: headers ?? {},
      persistent: true,
    })
  }

  async consume(queue: string, _groupId: string, timeoutMs: number): Promise<unknown> {
    const ch = await this.getChannel()
    await ch.assertQueue(queue, { durable: true })

    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        fn()
      }

      const timer = setTimeout(() => {
        settle(() => reject(new Error(`consume timeout after ${timeoutMs}ms on queue ${queue}`)))
      }, timeoutMs)

      ch.consume(queue, (msg) => {
        if (!msg) return
        clearTimeout(timer)
        settle(() => {
          try {
            resolve(JSON.parse(msg.content.toString()))
          } catch {
            resolve(msg.content.toString())
          }
        })
      }).then(({ consumerTag }) => {
        // cancel consumer after message is received (best-effort)
        if (settled) {
          ch.cancel(consumerTag).catch(() => {})
        }
      }).catch(() => {
        settle(() => reject(new Error(`Failed to start consumer on queue ${queue}`)))
      })
    })
  }

  async close(): Promise<void> {
    await this.channel?.close().catch(() => {})
    await this.conn?.close().catch(() => {})
    this.channel = null
    this.conn = null
  }
}
