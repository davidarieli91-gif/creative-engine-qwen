import { SceneObject } from './Editor'

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
  onLoadClick
}: ToolbarProps) {
  const dimmed = { opacity: isPlaying ? 0.4 : 1 }

  return (
    <div className="toolbar">
      <button className="btn" onClick={onToggleLeft}>
        {leftCollapsed ? '→' : '←'} Scene
      </button>
      <button className="btn" style={dimmed} onClick={() => onAddObject('cube')}>+ Cube</button>
      <button className="btn" style={dimmed} onClick={() => onAddObject('sphere')}>+ Sphere</button>
      <button className="btn" style={dimmed} onClick={() => onAddObject('cylinder')}>+ Cylinder</button>
      <button className="btn" style={dimmed} onClick={() => onAddObject('plane')}>+ Plane</button>
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
