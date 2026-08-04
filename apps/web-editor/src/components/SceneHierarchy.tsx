import { SceneObject } from './Editor'

interface SceneHierarchyProps {
  objects: SceneObject[]
  selectedObject: SceneObject | null
  onSelect: (obj: SceneObject) => void
}

export function SceneHierarchy({ objects, selectedObject, onSelect }: SceneHierarchyProps) {
  return (
    <div>
      {objects.length === 0 ? (
        <p style={{ fontSize: '12px', color: '#888' }}>
          No objects yet. Add objects from toolbar.
        </p>
      ) : (
        objects.map(obj => (
          <div
            key={obj.id}
            className={`object-item ${selectedObject?.id === obj.id ? 'selected' : ''}`}
            onClick={() => onSelect(obj)}
          >
            {obj.name}
          </div>
        ))
      )}
    </div>
  )
}
