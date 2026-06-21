// packages/cli/src/commands/run.ts
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
  parseCollection,
  FlowRunner,
  generateJUnit,
  generateJson,
  generateHtml,
} from '@flowprobe/core'
import type { RunResult, BrokerAdapter, AssertionHandler } from '@flowprobe/core'
import { evaluateHttp } from '@flowprobe/assertions'

/**
 * Build an adapter registry from environment variables.
 * Only registers adapters for brokers that have required env vars set.
 * All adapter imports are lazy to keep CLI startup fast.
 */
async function buildAdapterRegistry(): Promise<Map<string, BrokerAdapter>> {
  const registry = new Map<string, BrokerAdapter>()

  // Kafka — KAFKA_BROKERS=broker1:9092,broker2:9092
  if (process.env['KAFKA_BROKERS']) {
    const { KafkaAdapter } = await import('@flowprobe/adapter-kafka')
    const adapter = new KafkaAdapter({
      brokers: process.env['KAFKA_BROKERS'].split(',').map((b) => b.trim()),
      ssl: process.env['KAFKA_SSL'] === 'true',
    })
    registry.set('kafka', adapter)
  }

  // RabbitMQ — RABBITMQ_URL=amqp://user:pass@host:5672
  if (process.env['RABBITMQ_URL']) {
    const { RabbitAdapter } = await import('@flowprobe/adapter-rabbitmq')
    const adapter = new RabbitAdapter({ url: process.env['RABBITMQ_URL'] })
    registry.set('rabbitmq', adapter)
  }

  // AWS SNS/SQS — AWS_REGION=us-east-1
  if (process.env['AWS_REGION']) {
    const { AwsAdapter } = await import('@flowprobe/adapter-sns-sqs')
    const adapter = new AwsAdapter({ region: process.env['AWS_REGION'] })
    registry.set('sns-sqs', adapter)
    registry.set('sqs', adapter)
  }

  // Webhook — always available, no credentials required
  {
    const { WebhookAdapter } = await import('@flowprobe/adapter-webhook')
    const adapter = new WebhookAdapter({
      hmacSecret: process.env['WEBHOOK_HMAC_SECRET'],
    })
    registry.set('webhook', adapter)
  }

  // WebSocket — always available, no credentials required
  {
    const { WsAdapter } = await import('@flowprobe/adapter-websocket')
    const adapter = new WsAdapter()
    registry.set('websocket', adapter)
    registry.set('ws', adapter)
  }

  return registry
}

const assertionHandler: AssertionHandler = async (step, ctx) => {
  if (step.type === 'http-assert') {
    const results = await evaluateHttp(step, ctx)
    const failed = results.find(r => !r.passed)
    return {
      passed: results.every(r => r.passed),
      error: failed
        ? `${failed.path ?? ''}: expected ${JSON.stringify(failed.expected)}, got ${JSON.stringify(failed.actual)}`
        : undefined,
      payload: results,
    }
  }
  return {
    passed: false,
    error: `${step.type} step requires runtime context (db connection, etc.) not available in CLI`,
  }
}

export async function run(
  collectionPath: string | undefined,
  opts: Record<string, string | boolean | string[] | undefined>
): Promise<number> {
  if (!collectionPath) {
    console.error('Error: collection path required. Usage: flowprobe run <path.flowprobe.json>')
    return 2
  }

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(resolve(collectionPath), 'utf-8'))
  } catch {
    console.error(`Error: cannot read collection file: ${collectionPath}`)
    return 2
  }

  let collection
  try {
    collection = parseCollection(raw)
  } catch (err) {
    console.error(`Error: invalid collection — ${err instanceof Error ? err.message : err}`)
    return 2
  }

  const vars = { ...process.env } as Record<string, string>
  const runner = new FlowRunner()

  // Register adapters from environment
  let registry: Map<string, BrokerAdapter>
  try {
    registry = await buildAdapterRegistry()
  } catch (err) {
    console.error(`Error: failed to initialise adapters — ${err instanceof Error ? err.message : err}`)
    return 2
  }
  runner.setAdapterRegistry(registry)

  // Human-readable console output
  runner.on('flow:start', (ev: { name: string }) => console.log(`\n▶ ${ev.name}`))
  runner.on('step:pass', (ev: { id: string; durationMs: number }) =>
    console.log(`  ✓ ${ev.id} (${ev.durationMs}ms)`)
  )
  runner.on('step:fail', (ev: { id: string; error?: string }) =>
    console.log(`  ✕ ${ev.id}: ${ev.error ?? 'failed'}`)
  )

  let result: RunResult
  try {
    result = await runner.run(collection, { vars, flowId: opts['flow'] as string | undefined, assertionHandler })
  } catch (err) {
    console.error(`Run error: ${err instanceof Error ? err.message : err}`)
    return 2
  } finally {
    // Close all adapters gracefully
    for (const adapter of registry.values()) {
      await adapter.close().catch(() => {})
    }
  }

  console.log(`\n${'─'.repeat(40)}`)
  console.log(`${result.passed} passed · ${result.failed} failed · ${result.durationMs}ms`)

  if (opts['output']) {
    const outDir = resolve(opts['output'] as string)
    mkdirSync(outDir, { recursive: true })
    const reporter = (opts['reporter'] as string) ?? 'json'
    if (reporter === 'junit') {
      writeFileSync(join(outDir, 'results.xml'), generateJUnit(result))
    } else if (reporter === 'html') {
      writeFileSync(join(outDir, 'results.html'), generateHtml(result))
    } else {
      writeFileSync(join(outDir, 'results.json'), generateJson(result))
    }
    console.log(`Report written to ${outDir}`)
  }

  return result.failed > 0 ? 1 : 0
}
