// packages/adapters/kafka/src/index.ts
import { Kafka, type Producer, type Consumer, CompressionTypes } from 'kafkajs'
import type { BrokerAdapter } from '@flowprobe/core'

export type SaslConfig =
  | { mechanism: 'plain'; username: string; password: string }
  | { mechanism: 'scram-sha-256'; username: string; password: string }
  | { mechanism: 'scram-sha-512'; username: string; password: string }

export type KafkaConfig = {
  brokers: string[]
  ssl?: boolean
  sasl?: SaslConfig
  clientId?: string
}

export class KafkaAdapter implements BrokerAdapter {
  private kafka: Kafka
  private producer: Producer | null = null
  private consumer: Consumer | null = null

  constructor(private config: KafkaConfig) {
    this.kafka = new Kafka({
      clientId: config.clientId ?? 'flowprobe',
      brokers: config.brokers,
      ssl: config.ssl,
      sasl: config.sasl,
    })
  }

  async produce(
    topic: string,
    payload: unknown,
    headers?: Record<string, string>
  ): Promise<{ offset: string; partition: number }> {
    if (!this.producer) {
      this.producer = this.kafka.producer()
      await this.producer.connect()
    }
    const value = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const kafkaHeaders = headers ?? undefined
    const results = await this.producer.send({
      topic,
      messages: [{ value, headers: kafkaHeaders }],
      compression: CompressionTypes.GZIP,
    })
    const meta = results[0]
    return { offset: meta.offset ?? '0', partition: meta.partition }
  }

  async consume(topic: string, groupId: string, timeoutMs: number): Promise<unknown> {
    const consumer = this.kafka.consumer({ groupId })
    this.consumer = consumer
    await consumer.connect()
    await consumer.subscribe({ topic, fromBeginning: false })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(async () => {
        await consumer.disconnect()
        reject(new Error(`consume timeout after ${timeoutMs}ms waiting for message on ${topic}`))
      }, timeoutMs)
      consumer.run({
        eachMessage: async ({ message }) => {
          clearTimeout(timer)
          await consumer.disconnect()
          try {
            resolve(JSON.parse(message.value?.toString() ?? 'null'))
          } catch {
            resolve(message.value?.toString())
          }
        },
      })
    })
  }

  async close(): Promise<void> {
    await Promise.allSettled([
      this.producer?.disconnect(),
      this.consumer?.disconnect(),
    ])
    this.producer = null
    this.consumer = null
  }
}
