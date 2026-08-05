import { ColorRGB, ObjectBehaviors, SceneObject } from './Editor'

interface InspectorProps {
  object: SceneObject | null
  onUpdate: (obj: SceneObject) => void
  onDelete: (id: string) => void
}

const DEFAULT_COLOR: ColorRGB = { r: 0.2, g: 0.5, b: 0.8 }

function rgbToHex(c: ColorRGB): string {
  const to = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(c.r)}${to(c.g)}${to(c.b)}`
}

function hexToRgb(hex: string): ColorRGB {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255
  }
}

export function Inspector({ object, onUpdate, onDelete }: InspectorProps) {
  if (!object) {
    return (
      <p style={{ fontSize: '12px', color: '#888' }}>
        Select an object to see its properties
      </p>
    )
  }

  const behaviors: ObjectBehaviors = object.behaviors ?? {
    spin: false,
    bounce: false,
    patrol: false,
    player: false,
    float: false
  }
  const color = object.color ?? DEFAULT_COLOR

  const updateProperty = (property: keyof SceneObject, value: any) => {
    onUpdate({ ...object, [property]: value })
  }

  const updateVector = (
    property: 'position' | 'rotation' | 'scale',
    axis: 'x' | 'y' | 'z',
    value: number
  ) => {
    onUpdate({
      ...object,
      [property]: {
        ...object[property],
        [axis]: value
      }
    })
  }

  const updateBehavior = (key: keyof ObjectBehaviors, value: boolean) => {
    onUpdate({ ...object, behaviors: { ...behaviors, [key]: value } })
  }

  const labelStyle = {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    fontSize: '12px',
    marginBottom: '4px',
    cursor: 'pointer'
  } as const

  return (
    <div>
      <div className="property-group">
        <div className="property-label">Name</div>
        <input
          className="property-input"
          value={object.name}
          onChange={(e) => updateProperty('name', e.target.value)}
        />
      </div>

      <div className="property-group">
        <div className="property-label">Type</div>
        <div style={{ fontSize: '12px' }}>{object.type}</div>
      </div>

      <div className="property-group">
        <div className="property-label">Color</div>
        <input
          type="color"
          value={rgbToHex(color)}
          onChange={(e) => updateProperty('color', hexToRgb(e.target.value))}
          style={{
            width: '100%',
            height: '32px',
            background: '#1e1e1e',
            border: '1px solid #3e3e42',
            borderRadius: '4px',
            padding: '2px',
            cursor: 'pointer'
          }}
        />
      </div>

      <div className="property-group">
        <div className="property-label">Position</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input className="property-input" type="number" step="0.1" value={object.position.x}
            onChange={(e) => updateVector('position', 'x', parseFloat(e.target.value) || 0)} placeholder="X" />
          <input className="property-input" type="number" step="0.1" value={object.position.y}
            onChange={(e) => updateVector('position', 'y', parseFloat(e.target.value) || 0)} placeholder="Y" />
          <input className="property-input" type="number" step="0.1" value={object.position.z}
            onChange={(e) => updateVector('position', 'z', parseFloat(e.target.value) || 0)} placeholder="Z" />
        </div>
      </div>

      <div className="property-group">
        <div className="property-label">Rotation</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input className="property-input" type="number" step="1" value={object.rotation.x}
            onChange={(e) => updateVector('rotation', 'x', parseFloat(e.target.value) || 0)} placeholder="X" />
          <input className="property-input" type="number" step="1" value={object.rotation.y}
            onChange={(e) => updateVector('rotation', 'y', parseFloat(e.target.value) || 0)} placeholder="Y" />
          <input className="property-input" type="number" step="1" value={object.rotation.z}
            onChange={(e) => updateVector('rotation', 'z', parseFloat(e.target.value) || 0)} placeholder="Z" />
        </div>
      </div>

      <div className="property-group">
        <div className="property-label">Scale</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input className="property-input" type="number" step="0.1" value={object.scale.x}
            onChange={(e) => updateVector('scale', 'x', parseFloat(e.target.value) || 0)} placeholder="X" />
          <input className="property-input" type="number" step="0.1" value={object.scale.y}
            onChange={(e) => updateVector('scale', 'y', parseFloat(e.target.value) || 0)} placeholder="Y" />
          <input className="property-input" type="number" step="0.1" value={object.scale.z}
            onChange={(e) => updateVector('scale', 'z', parseFloat(e.target.value) || 0)} placeholder="Z" />
        </div>
      </div>

      <div className="property-group">
        <div className="property-label">Behavior (работает в Play mode)</div>
        <label style={labelStyle}>
          <input type="checkbox" checked={!!behaviors.player}
            onChange={(e) => updateBehavior('player', e.target.checked)} />
          🏃 Player — управление WASD / стрелки
        </label>
        <label style={labelStyle}>
          <input type="checkbox" checked={!!behaviors.float}
            onChange={(e) => updateBehavior('float', e.target.checked)} />
          🌊 Float — держаться на воде
        </label>
        <label style={labelStyle}>
          <input type="checkbox" checked={!!behaviors.spin}
            onChange={(e) => updateBehavior('spin', e.target.checked)} />
          Spin — вращаться
        </label>
        <label style={labelStyle}>
          <input type="checkbox" checked={!!behaviors.bounce}
            onChange={(e) => updateBehavior('bounce', e.target.checked)} />
          Bounce — прыгать
        </label>
        <label style={labelStyle}>
          <input type="checkbox" checked={!!behaviors.patrol}
            onChange={(e) => updateBehavior('patrol', e.target.checked)} />
          Patrol — ходить туда-сюда
        </label>
      </div>

      <button
        className="btn btn-danger"
        style={{ width: '100%', marginTop: '12px' }}
        onClick={() => onDelete(object.id)}
      >
        Delete Object
      </button>
    </div>
  )
}
