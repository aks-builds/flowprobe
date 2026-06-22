import { writable } from 'svelte/store'
import type { Flow, Step } from '@flowprobe/core'
import { runStore } from './collection.js'

export type NodeType = 'runner' | 'kafka-topic' | 'rabbitmq' | 'sns-sqs' | 'consumer' | 'database' | 'http' | 'webhook'

export type TopologyNode = {
  id: string
  type: NodeType
  label: string
  sublabel: string
  x: number
  y: number
  status: 'idle' | 'running' | 'pass' | 'fail' | 'pending'
  durationMs?: number
  stepId?: string  // which flow step this node represents
}

export type TopologyEdge = {
  id: string
  fromId: string
  toId: string
  label: string
  status: 'idle' | 'pass' | 'fail'
}

export type TopologyGraph = { nodes: TopologyNode[]; edges: TopologyEdge[] }

/** Layout positions for up to 8 nodes in a horizontal cascade with vertical offshoots */
const POSITIONS = [
  { x: 60, y: 140 },   // runner
  { x: 200, y: 140 },  // node 2
  { x: 360, y: 140 },  // node 3
  { x: 520, y: 140 },  // node 4
  { x: 520, y: 280 },  // node 5 (vertical offshoot from node 4)
  { x: 660, y: 200 },  // node 6
  { x: 660, y: 320 },  // node 7
  { x: 660, y: 140 },  // node 8
]

function stepToNodeType(step: Step): NodeType {
  if (step.type === 'producer') {
    const b = step.broker?.toLowerCase() ?? ''
    if (b.includes('rabbit')) return 'rabbitmq'
    if (b.includes('sns') || b.includes('sqs')) return 'sns-sqs'
    return 'kafka-topic'
  }
  if (step.type === 'wait') return 'consumer'
  if (step.type === 'http-assert') return 'http'
  if (step.type === 'db-assert') return 'database'
  if (step.type === 'message-assert') return 'consumer'
  return 'consumer'
}

function stepLabel(step: Step): string {
  if (step.type === 'producer') return step.topic ?? step.broker
  if (step.type === 'wait') return step.consumer?.topic ?? 'consumer'
  if (step.type === 'http-assert') {
    try { return new URL(step.url).hostname } catch { return step.url }
  }
  if (step.type === 'db-assert') return 'database'
  return step.id
}

function stepSublabel(step: Step): string {
  if (step.type === 'producer') return `Kafka · topic`
  if (step.type === 'wait') return `consumer · ${step.consumer?.groupId ?? ''}`
  if (step.type === 'http-assert') return `${step.method} endpoint`
  if (step.type === 'db-assert') return `SQL assertion`
  return step.type
}

export function buildTopologyFromFlow(flow: Flow): TopologyGraph {
  const nodes: TopologyNode[] = []
  const edges: TopologyEdge[] = []

  // Always start with runner node
  nodes.push({
    id: 'runner',
    type: 'runner',
    label: 'FlowProbe',
    sublabel: 'test runner',
    ...POSITIONS[0],
    status: 'idle',
  })

  flow.steps.forEach((step, i) => {
    const pos = POSITIONS[i + 1] ?? { x: 60 + (i + 1) * 150, y: 140 }
    nodes.push({
      id: `node-${step.id}`,
      type: stepToNodeType(step),
      label: stepLabel(step),
      sublabel: stepSublabel(step),
      ...pos,
      status: 'idle',
      stepId: step.id,
    })

    const fromId = i === 0 ? 'runner' : `node-${flow.steps[i - 1].id}`
    edges.push({
      id: `edge-${fromId}-node-${step.id}`,
      fromId,
      toId: `node-${step.id}`,
      label: step.type === 'producer' ? 'PUBLISH' : step.type === 'wait' ? 'consume' : '',
      status: 'idle',
    })
  })

  return { nodes, edges }
}

// ── Shared selected node ──
export const selectedNodeId = writable<string | null>(null)

// ── Active topology store (set by +page.svelte when flow changes) ──
export const topologyStore = writable<TopologyGraph>({ nodes: [], edges: [] })

/** Apply runStore results to topology nodes/edges */
export function applyRunResults(
  graph: TopologyGraph,
  results: Array<{ id: string; passed: boolean; durationMs: number }>,
  runState: string
): TopologyGraph {
  const resultMap = new Map(results.map(r => [r.id, r]))
  const nodes = graph.nodes.map(n => {
    if (!n.stepId) return { ...n, status: runState === 'running' ? 'running' as const : n.status }
    const r = resultMap.get(n.stepId)
    if (!r) return { ...n, status: runState === 'running' ? 'running' as const : 'pending' as const }
    return { ...n, status: r.passed ? 'pass' as const : 'fail' as const, durationMs: r.durationMs }
  })
  const edges = graph.edges.map(e => {
    const toNode = nodes.find(n => n.id === e.toId)
    if (!toNode) return e
    return { ...e, status: toNode.status === 'pass' ? 'pass' as const : toNode.status === 'fail' ? 'fail' as const : 'idle' as const }
  })
  return { nodes, edges }
}
