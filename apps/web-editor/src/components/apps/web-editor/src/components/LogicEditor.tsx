import { useCallback, useEffect, useMemo, useRef } from 'react'
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  NodeProps,
  Connection
} from 'reactflow'
import 'reactflow/dist/style.css'
import { LogicData, EVENT_TYPES, ACTION_TYPES } from '../logic'
import { SceneObject } from './Editor'

function LogicNodeCard(props: NodeProps) {
  const { id, data } = props as any
  const isEvent = data.kind === 'event'
  const types = isEvent ? EVENT_TYPES : ACTION_TYPES
  const objects: SceneObject[] = data.objects ?? []
  const update = (patch: any) => data.onChange && data.onChange(id, patch)
  const needsObject = ['touch', 'click', 'delete', 'color'].includes(data.type)

  const sel: any = {
    width: '100%',
    background: '#1e1e1e',
    color: '#e0e0e0',
    border: '1px solid #3e3e42',
    borderRadius: 4,
    fontSize: 11,
    padding: '3px 4px',
    marginBottom: 4
  }

  return (
    <div
      style={{
        background: '#252526',
        border: `2px solid ${isEvent ? '#16825d' : '#0e639c'}`,
        borderRadius: 10,
        padding: 8,
        width: 200,
        fontSize: 11,
        color: '#e0e0e0'
      }}
    >
      {!isEvent && <Handle type="target" position={Position.Left} style={{ background: '#888', width: 10, height: 10 }} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 800, color: isEvent ? '#4ec9a0' : '#6ab0f3' }}>
          {isEvent ? '⚡ EVENT' : '🎬 ACTION'}
        </span>
        <span
          style={{ cursor: 'pointer', color: '#ff6b4a', fontWeight: 800 }}
          onClick={() => data.onDelete && data.onDelete(id)}
        >
          ✕
        </span>
      </div>
      <select style={sel} value={data.type} onChange={(e) => update({ type: e.target.value })}>
        {Object.entries(types).map(([k, label]) => (
          <option key={k} value={k}>{label}</option>
        ))}
      </select>
      {needsObject && (
        <select style={sel} value={data.objectId ?? ''} onChange={(e) => update({ objectId: e.target.value })}>
          <option value="">— object —</option>
          {objects.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      )}
      {data.type === 'score' && (
        <input style={sel} type="number" value={data.value ?? 1}
          onChange={(e) => update({ value: parseFloat(e.target.value) || 0 })} />
      )}
      {data.type === 'timer' && (
        <input style={sel} type="number" step="0.5" value={data.seconds ?? 2}
          onChange={(e) => update({ seconds: parseFloat(e.target.value) || 1 })} />
      )}
      {data.type === 'text' && (
        <input style={sel} value={data.message ?? 'Hello!'} onChange={(e) => update({ message: e.target.value })} />
      )}
      {data.type === 'color' && (
        <input style={{ ...sel, padding: 2, height: 26 }} type="color" value={data.color ?? '#ffcc00'}
          onChange={(e) => update({ color: e.target.value })} />
      )}
      <Handle type="source" position={Position.Right} style={{ background: '#888', width: 10, height: 10 }} />
    </div>
  )
}

const nodeTypes = { logicNode: LogicNodeCard }

interface LogicEditorProps {
  logic: LogicData
  objects: SceneObject[]
  onChange: (l: LogicData) => void
}

export function LogicEditor({ logic, objects, onChange }: LogicEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(logic.nodes as any)
  const [edges, setEdges, onEdgesChange] = useEdgesState(logic.edges as any)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const handleDataChange = useCallback((id: string, patch: any) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)))
  }, [setNodes])

  const handleDelete = useCallback((id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
  }, [setNodes, setEdges])

  useEffect(() => {
    onChangeRef.current({
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: {
          kind: n.data.kind,
          type: n.data.type,
          objectId: n.data.objectId,
          value: n.data.value,
          message: n.data.message,
          color: n.data.color,
          seconds: n.data.seconds
        }
      })) as any,
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })) as any
    })
  }, [nodes, edges])

  const renderedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: { ...n.data, objects, onChange: handleDataChange, onDelete: handleDelete }
      })),
    [nodes, objects, handleDataChange, handleDelete]
  )

  const onConnect = useCallback((conn: Connection) => {
    setEdges((eds) => addEdge({ ...conn, id: `e-${conn.source}-${conn.target}-${Date.now()}` }, eds))
  }, [setEdges])

  const addNode = (kind: 'event' | 'action') => {
    const id = `n-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: 'logicNode',
        position: { x: 60 + (nds.length % 3) * 240, y: 30 + Math.floor(nds.length / 3) * 170 },
        data:
          kind === 'event'
            ? { kind: 'event', type: 'start' }
            : { kind: 'action', type: 'score', value: 1 }
      } as any
    ])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '6px 10px',
          background: '#2d2d30',
          borderBottom: '1px solid #3e3e42',
          alignItems: 'center'
        }}
      >
        <button className="btn" onClick={() => addNode('event')}>+ ⚡ Event</button>
        <button className="btn" onClick={() => addNode('action')}>+ 🎬 Action</button>
        <span style={{ fontSize: 11, color: '#888' }}>
          Тяни провод от точки справа (event) к точке слева (action). Логика срабатывает в Play mode!
        </span>
      </div>
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={renderedNodes as any}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={['Delete', 'Backspace']}
          style={{ background: '#1e1e1e' }}
        >
          <Background gap={16} color="#333333" />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}
