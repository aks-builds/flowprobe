#!/usr/bin/env node
// packages/cli/src/index.ts
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    env: { type: 'string' },
    reporter: { type: 'string', default: 'json' },
    output: { type: 'string' },
    flow: { type: 'string' },
    broker: { type: 'string', default: 'kafka' },
  },
  allowPositionals: true,
  strict: false,
})

const command = positionals[0]

async function main(): Promise<void> {
  if (command === 'run') {
    const { run } = await import('./commands/run.js')
    process.exit(await run(positionals[1], values))
  }
  if (command === 'init') {
    const { init } = await import('./commands/init.js')
    await init(values)
    process.exit(0)
  }
  if (command === 'validate') {
    const { validate } = await import('./commands/validate.js')
    process.exit(await validate(positionals[1]))
  }
  console.error(`Unknown command: ${command ?? '(none)'}`)
  console.error('Usage: flowprobe <run|init|validate> [options]')
  process.exit(2)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
