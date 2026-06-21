import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { runStore, brokerStatusStore, validateFlow } from './collection.js'
import type { Flow } from '@flowprobe/core'

const validFlow: Flow = {
  id: 'f1', name: 'Test Flow',
  steps: [{
    id: 's1', type: 'producer',
    broker: 'kafka-local', topic: 'orders',
    payload: { id: '1' }
  }]
}

describe('runStore', () => {
  beforeEach(() => runStore.reset())

  it('starts idle', () => {
    expect(get(runStore).state).toBe('idle')
    expect(get(runStore).results).toEqual([])
    expect(get(runStore).errors).toEqual([])
  })

  it('transitions to running', () => {
    runStore.startRun()
    expect(get(runStore).state).toBe('running')
  })

  it('transitions to done', () => {
    runStore.startRun()
    runStore.finishRun()
    expect(get(runStore).state).toBe('done')
  })

  it('transitions to aborted', () => {
    runStore.startRun()
    runStore.abortRun()
    expect(get(runStore).state).toBe('aborted')
  })

  it('resets to idle', () => {
    runStore.startRun()
    runStore.reset()
    expect(get(runStore).state).toBe('idle')
  })
})

describe('validateFlow', () => {
  it('returns empty array for valid flow', () => {
    expect(validateFlow(validFlow)).toEqual([])
  })

  it('errors on empty topic', () => {
    const flow = { ...validFlow, steps: [{ ...validFlow.steps[0], topic: '' }] }
    const errors = validateFlow(flow as Flow)
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('topic')
    expect(errors[0].message).toContain('Required')
  })

  it('errors on empty broker', () => {
    const flow = { ...validFlow, steps: [{ ...validFlow.steps[0], broker: '' }] }
    const errors = validateFlow(flow as Flow)
    expect(errors.some(e => e.field === 'broker')).toBe(true)
  })

  it('errors on invalid http-assert URL', () => {
    const flow: Flow = {
      id: 'f1', name: 'f',
      steps: [{ id: 's1', type: 'http-assert', method: 'GET', url: 'not-a-url', assertions: [] }]
    }
    const errors = validateFlow(flow)
    expect(errors.some(e => e.field === 'url')).toBe(true)
  })

  it('errors on wait timeoutMs = 0', () => {
    const flow: Flow = {
      id: 'f1', name: 'f',
      steps: [{ id: 's1', type: 'wait', timeoutMs: 0, consumer: { broker: 'b', topic: 't', groupId: 'g' } }]
    }
    const errors = validateFlow(flow)
    expect(errors.some(e => e.field === 'timeoutMs')).toBe(true)
  })
})

describe('brokerStatusStore', () => {
  it('sets and reads broker status', () => {
    brokerStatusStore.set('kafka-local', { connected: true, connecting: false, latencyMs: 12, error: null })
    expect(get(brokerStatusStore).get('kafka-local')?.latencyMs).toBe(12)
  })
})
