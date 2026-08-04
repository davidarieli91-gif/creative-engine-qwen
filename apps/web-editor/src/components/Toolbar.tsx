import { SceneObject } from './Editor'

interface ToolbarProps {
  onAddObject: (type: SceneObject['type']) => void
  leftCollapsed: boolean
  rightCollapsed: boolean
  onToggleLeft: () => void
  onToggleRight: () => void
}

export function Toolbar({ onAddObject, leftCollapsed, rightCollapsed, onToggleLeft, onToggleRight }: ToolbarProps) {
  return (
    <div className="toolbar">
      <button className="btn" onClick={onToggleLeft}>
        {leftCollapsed ? '→' : '←'} Scene
      </button>
      <button className="btn" onClick={() => onAddObject('cube')}>+ Cube</button>
      <button className="btn" onClick={() => onAddObject('sphere')}>+ Sphere</button>
      <button className="btn" onClick={() => onAddObject('cylinder')}>+ Cylinder</button>
      <button className="btn" onClick={() => onAddObject('plane')}>+ Plane</button>
      <button className="btn" style={{ marginLeft: 'auto' }} onClick={onToggleRight}>
        Inspector {rightCollapsed ? '←' : '→'}
      </button>
    </div>
  )
}
