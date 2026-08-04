import { SceneObject } from './Editor'

interface InspectorProps {
  object: SceneObject | null
  onUpdate: (obj: SceneObject) => void
  onDelete: (id: string) => void
}

export function Inspector({ object, onUpdate, onDelete }: InspectorProps) {
  if (!object) {
    return (
      <p style={{ fontSize: '12px', color: '#888' }}>
        Select an object to see its properties
      </p>
    )
  }

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
        <div className="property-label">Position</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            className="property-input"
            type="number"
            step="0.1"
            value={object.position.x}
            onChange={(e) => updateVector('position', 'x', parseFloat(e.target.value) || 0)}
            placeholder="X"
          />
          <input
            className="property-input"
            type="number"
            step="0.1"
            value={object.position.y}
            onChange={(e) => updateVector('position', 'y', parseFloat(e.target.value) || 0)}
            placeholder="Y"
          />
          <input
            className="property-input"
            type="number"
            step="0.1"
            value={object.position.z}
            onChange={(e) => updateVector('position', 'z', parseFloat(e.target.value) || 0)}
            placeholder="Z"
          />
        </div>
      </div>

      <div className="property-group">
        <div className="property-label">Rotation</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            className="property-input"
            type="number"
            step="1"
            value={object.rotation.x}
            onChange={(e) => updateVector('rotation', 'x', parseFloat(e.target.value) || 0)}
            placeholder="X"
          />
          <input
            className="property-input"
            type="number"
            step="1"
            value={object.rotation.y}
            onChange={(e) => updateVector('rotation', 'y', parseFloat(e.target.value) || 0)}
            placeholder="Y"
          />
          <input
            className="property-input"
            type="number"
            step="1"
            value={object.rotation.z}
            onChange={(e) => updateVector('rotation', 'z', parseFloat(e.target.value) || 0)}
            placeholder="Z"
          />
        </div>
      </div>

      <div className="property-group">
        <div className="property-label">Scale</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            className="property-input"
            type="number"
            step="0.1"
            value={object.scale.x}
            onChange={(e) => updateVector('scale', 'x', parseFloat(e.target.value) || 0)}
            placeholder="X"
          />
          <input
            className="property-input"
            type="number"
            step="0.1"
            value={object.scale.y}
            onChange={(e) => updateVector('scale', 'y', parseFloat(e.target.value) || 0)}
            placeholder="Y"
          />
          <input
            className="property-input"
            type="number"
            step="0.1"
            value={object.scale.z}
            onChange={(e) => updateVector('scale', 'z', parseFloat(e.target.value) || 0)}
            placeholder="Z"
          />
        </div>
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
