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
  onCreate: (w: number) => void
  onHills: () => void
  onBiomes: () => void
  onScatter: (kind: 'trees' | 'rocks') => void
  onDelete: () => void
}

const paintNames = ['🌿 Трава', '🪨 Камень', '🏖 Песок', '❄ Снег', '🟤 Земля']

export function TerrainPanel(props: TerrainPanelProps) {
  const [w, setW] = useState(128)

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
        <span style={{ fontSize: 13, fontWeight: 700 }}>⛏ Воксельный мир:</span>
        <select className="property-input" style={{ width: 210 }} value={w} onChange={(e) => setW(parseInt(e.target.value))}>
          <option value={128}>128×128 — быстрый</option>
          <option value={256}>256×256 — большой</option>
          <option value={512}>512×512 — ГИГАНТ (×100)</option>
        </select>
        <button className="btn" style={{ background: '#16825d' }} onClick={() => props.onCreate(w)}>
          ⛰ Создать мир
        </button>
        <span style={{ color: '#888', fontSize: 12 }}>
          Чанковая система: огромные миры не тормозят! Для 512 используй 💾 Save в файл.
        </span>
      </div>
    )
  }

  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {toolBtn('raise', '⬆ Насыпать')}
        {toolBtn('lower', '⛏ Копать')}
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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {paintNames.map((p, i) => (
            <button
              key={i}
              className="btn"
              style={{ background: props.paintId === i ? '#0e639c' : '#3e3e42' }}
              onClick={() => props.onPaintId(i)}
            >
              {p}
            </button>
          ))}
          <span
            style={{
              width: 22, height: 22, borderRadius: 4,
              background: `rgb(${VOX_PALETTE[props.paintId].map((v) => Math.round(v * 255)).join(',')})`
            }}
          />
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
        <span style={{ color: '#888' }}>ЛКМ — инструмент · колесо — зум · панель закрыта — камера вращается</span>
      </div>
    </div>
  )
}
