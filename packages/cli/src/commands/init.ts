// packages/cli/src/commands/init.ts
import { writeFileSync, existsSync } from 'node:fs'

export async function init(opts: Record<string, unknown>): Promise<void> {
  const name = 'my-flow'
  const outPath = `${name}.flowprobe.json`
  if (existsSync(outPath)) {
    console.error(`${outPath} already exists`)
    return
  }
  const broker = (opts.broker as string) ?? 'kafka'
  const template = {
    $schema: 'https://flowprobe.dev/schema/v1.json',
    version: '1',
    name: 'My Flow Collection',
    flows: [
      {
        id: 'flow-1',
        name: 'My First Flow',
        steps:
          broker === 'kafka'
            ? [
                {
                  id: 'step-1',
                  type: 'producer',
                  broker: '{{KAFKA_BROKER_ID}}',
                  topic: 'my-topic',
                  payload: { id: '{{$uuid}}', timestamp: '{{$isoDate}}' },
                },
                {
                  id: 'step-2',
                  type: 'wait',
                  timeoutMs: 5000,
                  consumer: {
                    broker: '{{KAFKA_BROKER_ID}}',
                    topic: 'my-topic',
                    groupId: 'fp-test-{{$runId}}',
                  },
                },
                {
                  id: 'step-3',
                  type: 'http-assert',
                  method: 'GET',
                  url: '{{API_BASE_URL}}/status/{{steps.step-1.payload.id}}',
                  assertions: [{ type: 'status', expected: 200 }],
                },
              ]
            : [
                {
                  id: 'step-1',
                  type: 'producer',
                  broker: '{{BROKER_ID}}',
                  topic: '{{TOPIC}}',
                  payload: { id: '{{$uuid}}' },
                },
              ],
      },
    ],
  }
  writeFileSync(outPath, JSON.stringify(template, null, 2))
  console.log(`✓ Created ${outPath}`)
  console.log(`Edit the collection, then run: flowprobe run ${outPath}`)
}
