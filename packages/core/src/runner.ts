// packages/core/src/runner.ts
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { interpolate } from './interpolator.js'
import type { Collection, Flow, Step } from './schema.js'
import type { InterpolationContext } from './interpolator.js'

export type AssertionHandler = (
  step: Step,
  ctx: InterpolationContext
) => Promise<{ passed: boolean; error?: string; payload?: unknown }>

export type RunOptions = {
  vars: Record<string, string>
  flowId?: string
  assertionHandler?: AssertionHandler
}

export type StepRunResult = {
  id: string
  type: string
  passed: boolean
  durationMs: number
  error?: string
  payload?: unknown
}

export type FlowRunResult = {
  id: string
  name: string
  passed: boolean
  durationMs: number
  steps: StepRunResult[]
}

export type RunResult = {
  runId: string
  passed: number
  failed: number
  durationMs: number
  flows: FlowRunResult[]
}

export interface BrokerAdapter {
  produce(topic: string, payload: unknown, headers?: Record<string, string>): Promise<unknown>
  consume?(topic: string, groupId: string, timeoutMs: number): Promise<unknown>
  close(): Promise<void>
}

export class FlowRunner extends EventEmitter {
  private adapterRegistry = new Map<string, BrokerAdapter>()
  private assertionHandler: AssertionHandler | undefined

  setAdapterRegistry(registry: Map<string, BrokerAdapter>): void {
    this.adapterRegistry = registry
  }

  async run(collection: Collection, opts: RunOptions): Promise<RunResult> {
    this.assertionHandler = opts.assertionHandler
    const runId = randomUUID()
    const startTime = Date.now()
    const flows = opts.flowId
      ? collection.flows.filter(f => f.id === opts.flowId)
      : collection.flows

    let passed = 0
    let failed = 0
    const flowResults: FlowRunResult[] = []

    for (const flow of flows) {
      const flowResult = await this.runFlow(flow, opts.vars, runId)
      flowResults.push(flowResult)
      for (const step of flowResult.steps) {
        if (step.passed) passed++
        else failed++
      }
    }

    const result: RunResult = {
      runId,
      passed,
      failed,
      durationMs: Date.now() - startTime,
      flows: flowResults,
    }
    this.emit('run:done', result)
    return result
  }

  private async runFlow(
    flow: Flow,
    vars: Record<string, string>,
    runId: string
  ): Promise<FlowRunResult> {
    const start = Date.now()
    this.emit('flow:start', { id: flow.id, name: flow.name })

    const stepResults: StepRunResult[] = []
    const completedSteps: Record<string, { payload: unknown; response?: unknown }> = {}

    for (const step of flow.steps) {
      const ctx: InterpolationContext = { vars, steps: completedSteps, runId }
      const result = await this.runStep(step, ctx)
      stepResults.push(result)
      if (result.passed) {
        completedSteps[step.id] = { payload: result.payload }
        this.emit('step:pass', result)
      } else {
        this.emit('step:fail', result)
        break // stop flow on first failure
      }
    }

    const flowResult: FlowRunResult = {
      id: flow.id,
      name: flow.name,
      passed: stepResults.length > 0 && stepResults.every(s => s.passed),
      durationMs: Date.now() - start,
      steps: stepResults,
    }
    this.emit('flow:done', flowResult)
    return flowResult
  }

  private async runStep(step: Step, ctx: InterpolationContext): Promise<StepRunResult> {
    const start = Date.now()
    this.emit('step:start', { id: step.id, type: step.type })
    try {
      const interpolatedStep = interpolate(step, ctx) as Step

      if (interpolatedStep.type === 'producer') {
        const adapter = this.adapterRegistry.get(interpolatedStep.broker)
        if (!adapter) {
          throw new Error(`No adapter registered for broker: ${interpolatedStep.broker}`)
        }
        const payload = await adapter.produce(
          interpolatedStep.topic,
          interpolatedStep.payload,
          interpolatedStep.headers
        )
        return {
          id: step.id,
          type: step.type,
          passed: true,
          durationMs: Date.now() - start,
          payload,
        }
      }

      if (interpolatedStep.type === 'wait') {
        const adapter = this.adapterRegistry.get(interpolatedStep.consumer.broker)
        if (!adapter) {
          throw new Error(`No adapter registered for broker: ${interpolatedStep.consumer.broker}`)
        }
        if (!adapter.consume) {
          throw new Error(
            `Adapter for broker '${interpolatedStep.consumer.broker}' does not support consume()`
          )
        }
        const message = await adapter.consume(
          interpolatedStep.consumer.topic,
          interpolatedStep.consumer.groupId,
          interpolatedStep.timeoutMs
        )
        return {
          id: step.id,
          type: step.type,
          passed: true,
          durationMs: Date.now() - start,
          payload: message,
        }
      }

      // http-assert, db-assert, message-assert are delegated to the assertionHandler
      if (
        interpolatedStep.type === 'http-assert' ||
        interpolatedStep.type === 'db-assert' ||
        interpolatedStep.type === 'message-assert'
      ) {
        if (!this.assertionHandler) {
          throw new Error(
            `Step type '${interpolatedStep.type}' requires an assertionHandler in RunOptions`
          )
        }
        const result = await this.assertionHandler(interpolatedStep, ctx)
        return {
          id: step.id,
          type: step.type,
          passed: result.passed,
          durationMs: Date.now() - start,
          error: result.error,
          payload: result.payload,
        }
      }

      throw new Error(
        `Step type '${(interpolatedStep as Step).type}' is not handled by the runner — ` +
          `register an assertion adapter or handle this step type externally`
      )
    } catch (err) {
      return {
        id: step.id,
        type: step.type,
        passed: false,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}
