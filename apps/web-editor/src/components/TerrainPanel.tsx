import { useState } from 'react'
import { SceneObject } from './Editor'
import { TerrainTool, VOX_PALETTE } from '../terrain'

interface TerrainPanelProps {
  terrain: SceneObject | null
  tool: TerrainTool
  onTool: (t: TerrainTool) => void
  radius: number
  onRadius: (n: number) => void
  strength: number
  onStrength: (n: number) => void
  paintId: number
  onPaintId: (n: number) => void
  onCreate: (w: number, fine: boolean) => void
  onHills: () => void
  onBiomes: () => void
  onScatter: (kind: 'trees' | 'rocks') => void
  onDelete: () => void
}

const paintNames = ['🌿', '', '', '❄', '', '', '🟧', '', '', '', '🟣', '🩷', '', '', '', '']

export function TerrainPanel(props: TerrainPanelProps) {
  const [w, setW] = useState(128)
  const [fine, setFine] = useState(false)

  const toolBtn = (t: TerrainTool, label: string) => (
    <button className="btn" style={{ background: props.tool === t ? '#0e639c' : '#3e3e42' }}
      onClick={() => props.onTool(t)}>
      {label}
    </button>
  )

  if (!props.terrain) {
    return (
      <div style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>⛏ Воксельный мир:</span>
        <select className="property-input" style={{ width: 190 }} value={w} onChange={(e) => setW(parseInt(e.target.value))}>
          <option value={128}>128×128 — быстрый</option>
          <option value={256}>256×256 — большой</option>
          <option value={512}>512×512 — ГИГАНТ</option>
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={fine} onChange={(e) => setFine(e.target.checked)} />
          🔬 Мелкие воксели ×2
        </label>
        <button className="btn" style={{ background: '#16825d' }} onClick={() => props.onCreate(w, fine)}>
          ⛰ Создать мир
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {toolBtn('raise', '⬆ Насыпать')}
        {toolBtn('lower', '⛏ Копать')}
        {toolBtn('explode', '💥 Взрыв')}
        {toolBtn('pour', '💧 Залить')}
        {toolBtn('dry', '☀ Сушить')}
        {toolBtn('smooth', '〰 Сгладить')}
        {toolBtn('flatten', '⏹ Выровнять')}
        {toolBtn('paint', '🎨 Краска')}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={props.onHills}>🎲 Горы</button>
        <button className="btn" style={{ background: '#6a3ea1' }} onClick={props.onBiomes}>🎨 Биомы</button>
        <button className="btn" onClick={() => props.onScatter('trees')}>🌲 Лес</button>
        <button className="btn" onClick={() => props.onScatter('rocks')}>🪨 Камни</button>
        <button className="btn btn-danger" onClick={props.onDelete}>🗑</button>
      </div>

      {props.tool === 'paint' && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {paintNames.map((p, idx) => (
            <button key={idx} className="btn"
              style={{ background: props.paintId === idx ? '#0e639c' : '#3e3e42', padding: '3px 7px' }}
              onClick={() => props.onPaintId(idx)}
              title={`Материал ${idx}`}>
              {p}
            </button>
          ))}
          <span style={{
            width: 22, height: 22, borderRadius: 4,
            background: `rgb(${(VOX_PALETTE[props.paintId] || VOX_PALETTE[0]).map((v) => Math.round(v * 255)).join(',')})`
          }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 12 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Кисть
          <input type="range" min={1} max={props.tool === 'explode' ? 20 : 12} step={0.5} value={props.radius}
            onChange={(e) => props.onRadius(parseFloat(e.target.value))} />
          {props.radius}
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Сила
          <input type="range" min={0.1} max={1} step={0.05} value={props.strength}
            onChange={(e) => props.onStrength(parseFloat(e.target.value))} />
          {props.strength}
        </label>
        <span style={{ color: '#888' }}>💧 Залей воду в яму — она растечётся и заполнит её, как у John Lin!</span>
      </div>
    </div>
  )
}
