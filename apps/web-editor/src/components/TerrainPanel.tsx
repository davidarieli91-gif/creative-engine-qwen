import { useState } from 'react'
import { SceneObject } from './Editor'
import { TerrainTool } from '../terrain'

interface TerrainPanelProps {
  terrain: SceneObject | null
  tool: TerrainTool
  onTool: (t: TerrainTool) => void
  radius: number
  onRadius: (n: number) => void
  strength: number
  onStrength: (n: number) => void
  paintColor: string
  onPaintColor: (c: string) => void
  onCreate: (sub: number, size: number) => void
  onHills: () => void
  onScatter: (kind: 'trees' | 'rocks') => void
  onDelete: () => void
}

const presets = [
  { label: '🌿 Трава', color: '#5da345' },
  { label: '🪨 Камень', color: '#8a8f98' },
  { label: '🏖 Песок', color: '#d9c38a' },
  { label: '❄ Снег', color: '#f2f6ff' }
]

export function TerrainPanel(props: TerrainPanelProps) {
  const [sub, setSub] = useState(128)
  const [size, setSize] = useState(60)

  const toolBtn = (t: TerrainTool, label: string) => (
    <button
      className="btn"
      style={{ background: props.tool === t ? '#0e639c' : '#3e3e42' }}
      onClick={() => props.onTool(t)}
    >
      {label}
    </button>
  )

  if (!props.terrain) {
    return (
      <div style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>⛰ Ландшафт:</span>
        <select className="property-input" style={{ width: 150 }} value={sub} onChange={(e) => setSub(parseInt(e.target.value))}>
          <option value={64}>Детализация: быстрая</option>
          <option value={128}>Детализация: высокая</option>
          <option value={256}>Детализация: ультра</option>
        </select>
        <select className="property-input" style={{ width: 130 }} value={size} onChange={(e) => setSize(parseInt(e.target.value))}>
          <option value={40}>Размер: 40</option>
          <option value={60}>Размер: 60</option>
          <option value={80}>Размер: 80</option>
        </select>
        <button className="btn" style={{ background: '#16825d' }} onClick={() => props.onCreate(sub, size)}>
          ⛰ Создать ландшафт
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {toolBtn('raise', '⬆ Поднять')}
        {toolBtn('lower', '⬇ Опустить')}
        {toolBtn('smooth', '〰 Сгладить')}
        {toolBtn('flatten', '⏹ Выровнять')}
        {toolBtn('paint', '🎨 Краска')}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={props.onHills}>🎲 Холмы</button>
        <button className="btn" onClick={() => props.onScatter('trees')}>🌲 Деревья</button>
        <button className="btn" onClick={() => props.onScatter('rocks')}>🪨 Камни</button>
        <button className="btn btn-danger" onClick={props.onDelete}>🗑</button>
      </div>

      {props.tool === 'paint' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {presets.map((p) => (
            <button
              key={p.color}
              className="btn"
              style={{ background: props.paintColor === p.color ? '#0e639c' : '#3e3e42' }}
              onClick={() => props.onPaintColor(p.color)}
            >
              {p.label}
            </button>
          ))}
          <input type="color" value={props.paintColor} onChange={(e) => props.onPaintColor(e.target.value)}
            style={{ width: 40, height: 26, background: '#1e1e1e', border: '1px solid #3e3e42', borderRadius: 4 }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 12 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Кисть
          <input type="range" min={1} max={12} step={0.5} value={props.radius}
            onChange={(e) => props.onRadius(parseFloat(e.target.value))} />
          {props.radius}
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Сила
          <input type="range" min={0.1} max={1} step={0.05} value={props.strength}
            onChange={(e) => props.onStrength(parseFloat(e.target.value))} />
          {props.strength}
        </label>
        <span style={{ color: '#888' }}>ЛКМ — инструмент · ПКМ — камера · колесо — зум</span>
      </div>
    </div>
  )
}
