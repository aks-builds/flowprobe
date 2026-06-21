// packages/core/src/schema.ts
import { z } from 'zod'

const AssertionSchema = z.object({
  type: z.enum(['status', 'jsonpath', 'jmespath', 'rowCount', 'cell', 'regex', 'exists', 'timing']),
  path: z.string().optional(),
  expected: z.unknown().optional(),
  row: z.number().optional(),
  col: z.string().optional(),
  pattern: z.string().optional(),
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'contains', 'matches', 'exists', 'type']).default('eq'),
})

const ProducerStepSchema = z.object({
  id: z.string(),
  type: z.literal('producer'),
  broker: z.string(),
  topic: z.string(),
  payload: z.record(z.unknown()),
  headers: z.record(z.string()).optional(),
  partition: z.number().optional(),
})

const WaitStepSchema = z.object({
  id: z.string(),
  type: z.literal('wait'),
  description: z.string().optional(),
  timeoutMs: z.number().default(5000),
  consumer: z.object({
    broker: z.string(),
    topic: z.string(),
    groupId: z.string(),
  }),
})

const HttpAssertStepSchema = z.object({
  id: z.string(),
  type: z.literal('http-assert'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  url: z.string(),
  body: z.record(z.unknown()).optional(),
  headers: z.record(z.string()).optional(),
  assertions: z.array(AssertionSchema),
})

const DbAssertStepSchema = z.object({
  id: z.string(),
  type: z.literal('db-assert'),
  connection: z.string(),
  query: z.string(),
  params: z.array(z.string()).default([]),
  assertions: z.array(AssertionSchema),
})

const MessageAssertStepSchema = z.object({
  id: z.string(),
  type: z.literal('message-assert'),
  broker: z.string(),
  topic: z.string(),
  timeoutMs: z.number().default(3000),
  assertions: z.array(AssertionSchema),
})

const StepSchema = z.discriminatedUnion('type', [
  ProducerStepSchema,
  WaitStepSchema,
  HttpAssertStepSchema,
  DbAssertStepSchema,
  MessageAssertStepSchema,
])

const FlowSchema = z.object({
  id: z.string(),
  name: z.string(),
  steps: z.array(StepSchema).min(1),
})

const CollectionSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal('1'),
  name: z.string(),
  flows: z.array(FlowSchema).min(1),
})

export type Collection = z.infer<typeof CollectionSchema>
export type Flow = z.infer<typeof FlowSchema>
export type Step = z.infer<typeof StepSchema>
export type ProducerStep = z.infer<typeof ProducerStepSchema>
export type WaitStep = z.infer<typeof WaitStepSchema>
export type HttpAssertStep = z.infer<typeof HttpAssertStepSchema>
export type DbAssertStep = z.infer<typeof DbAssertStepSchema>
export type MessageAssertStep = z.infer<typeof MessageAssertStepSchema>
export type Assertion = z.infer<typeof AssertionSchema>

export function parseCollection(raw: unknown): Collection {
  return CollectionSchema.parse(raw)
}

export { CollectionSchema }
