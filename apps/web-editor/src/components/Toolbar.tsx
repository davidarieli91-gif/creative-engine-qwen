import { SceneObject } from './Editor'

export type GizmoMode = 'position' | 'rotation' | 'scale'

interface ToolbarProps {
  onAddObject: (type: SceneObject['type']) => void
  leftCollapsed: boolean
  rightCollapsed: boolean
  onToggleLeft: () => void
  onToggleRight: () => void
  isPlaying: boolean
  onTogglePlay: () => void
  onSave: () => void
  onLoadClick: () => void
  gizmoMode: GizmoMode
  onGizmoMode: (mode: GizmoMode) => void
}

export function Toolbar({
  onAddObject,
  leftCollapsed,
  rightCollapsed,
  onToggleLeft,
  onToggleRight,
  isPlaying,
  onTogglePlay,
  onSave,
  onLoadClick,
  gizmoMode,
  onGizmoMode
}: ToolbarProps) {
  const dimmed = { opacity: isPlaying ? 0.4 : 1 }

  const gizmoButton = (mode: GizmoMode, label: string, title: string) => (
    <button
      className="btn"
      title={title}
      style={{
        ...dimmed,
        background: gizmoMode === mode ? '#0e639c' : '#3e3e42'
      }}
      onClick={() => onGizmoMode(mode)}
    >
      {label}
    </button>
  )

  return (
    <div className="toolbar">
      <button className="btn" onClick={onToggleLeft}>
        {leftCollapsed ? '→' : '←'} Scene
      </button>
      <button className="btn" style={dimmed} onClick={() => onAddObject('cube')}>+ Cube</button>
      <button className="btn" style={dimmed} onClick={() => onAddObject('sphere')}>+ Sphere</button>
      <button className="btn" style={dimmed} onClick={() => onAddObject('cylinder')}>+ Cylinder</button>
      <button className="btn" style={dimmed} onClick={() => onAddObject('plane')}>+ Plane</button>

      <span style={{ width: 1, background: '#3e3e42', margin: '0 4px' }} />

      {gizmoButton('position', '✥ Move', 'Двигать объект мышкой')}
      {gizmoButton('rotation', '↻ Rotate', 'Вращать объект мышкой')}
      {gizmoButton('scale', '⤢ Scale', 'Масштабировать объект мышкой')}

      <span style={{ width: 1, background: '#3e3e42', margin: '0 4px' }} />

      <button className="btn" style={dimmed} onClick={onSave}>💾 Save</button>
      <button className="btn" style={dimmed} onClick={onLoadClick}>📂 Load</button>

      <button
        className="btn"
        style={{ marginLeft: 'auto', background: isPlaying ? '#a1260d' : '#16825d' }}
        onClick={onTogglePlay}
      >
        {isPlaying ? '■ Stop' : '▶ Play'}
      </button>
      <button className="btn" onClick={onToggleRight}>
        Inspector {rightCollapsed ? '←' : '→'}
      </button>
    </div>
  )
}
