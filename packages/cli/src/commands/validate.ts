// packages/cli/src/commands/validate.ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseCollection } from '@flowprobe/core'

export async function validate(collectionPath: string | undefined): Promise<number> {
  if (!collectionPath) {
    console.error('Usage: flowprobe validate <path.flowprobe.json>')
    return 2
  }
  try {
    const raw = JSON.parse(readFileSync(resolve(collectionPath), 'utf-8'))
    const collection = parseCollection(raw)
    const totalSteps = collection.flows.reduce((n, f) => n + f.steps.length, 0)
    console.log(`✓ Valid collection: ${collection.name} — ${collection.flows.length} flows, ${totalSteps} steps`)
    return 0
  } catch (err) {
    console.error(`✕ Invalid: ${err instanceof Error ? err.message : err}`)
    return 1
  }
}
