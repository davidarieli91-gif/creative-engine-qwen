export interface LogicNodeData {
  kind: 'event' | 'action'
  type: string
  objectId?: string
  value?: number
  message?: string
  color?: string
  seconds?: number
}

export interface LogicNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: LogicNodeData
}

export interface LogicEdge {
  id: string
  source: string
  target: string
}

export interface LogicData {
  nodes: LogicNode[]
  edges: LogicEdge[]
}

export const EVENT_TYPES: Record<string, string> = {
  start: '▶ When game starts',
  touch: '🤝 When object is touched',
  click: '🖱 When object is clicked',
  timer: '⏱ Every N seconds'
}

export const ACTION_TYPES: Record<string, string> = {
  score: '🏆 Add to score',
  text: '💬 Show text',
  delete: '🗑 Delete object',
  color: '🎨 Recolor object',
  sink: '🕳 Sink object',
  float: '🌊 Float object',
  sound: '🔊 Play sound'
}

export function buildChains(logic: LogicData) {
  const nodeById = new Map(logic.nodes.map((n) => [n.id, n]))
  const outEdges = new Map<string, LogicEdge[]>()
  logic.edges.forEach((e) => {
    const arr = outEdges.get(e.source) ?? []
    arr.push(e)
    outEdges.set(e.source, arr)
  })

  const chains: { event: LogicNode; actions: LogicNode[] }[] = []
  logic.nodes
    .filter((n) => n.data.kind === 'event')
    .forEach((event) => {
      const actions: LogicNode[] = []
      const visited = new Set<string>()
      let current: LogicNode = event
      for (;;) {
        const next = (outEdges.get(current.id) ?? [])[0]
        if (!next) break
        const target = nodeById.get(next.target)
        if (!target || target.data.kind !== 'action' || visited.has(target.id)) break
        visited.add(target.id)
        actions.push(target)
        current = target
      }
      chains.push({ event, actions })
    })
  return chains
}
