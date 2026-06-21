// packages/cli/tests/run.test.ts
import { describe, it, expect } from 'vitest'
import { validate } from '../src/commands/validate.js'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = tmpdir()

describe('validate command', () => {
  it('returns 0 for valid collection', async () => {
    const path = join(tmp, 'test-collection.flowprobe.json')
    writeFileSync(
      path,
      JSON.stringify({
        version: '1',
        name: 'Test',
        flows: [
          {
            id: 'f1',
            name: 'Flow',
            steps: [
              { id: 's1', type: 'producer', broker: 'B', topic: 'T', payload: {} },
            ],
          },
        ],
      })
    )
    const code = await validate(path)
    expect(code).toBe(0)
    unlinkSync(path)
  })

  it('returns 1 for invalid collection', async () => {
    const path = join(tmp, 'invalid.flowprobe.json')
    writeFileSync(path, JSON.stringify({ bad: 'data' }))
    const code = await validate(path)
    expect(code).toBe(1)
    unlinkSync(path)
  })

  it('returns 2 when no path provided', async () => {
    const code = await validate(undefined)
    expect(code).toBe(2)
  })
})
