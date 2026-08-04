import { useState } from 'react'
import { Viewport } from './Viewport'
import { SceneHierarchy } from './SceneHierarchy'
import { Inspector } from './Inspector'
import { Toolbar } from './Toolbar'

export interface SceneObject {
  id: string
  name: string
  type: 'cube' | 'sphere' | 'cylinder' | 'plane'
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
}

export function Editor() {
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false)
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)
  const [objects, setObjects] = useState<SceneObject[]>([])
  const [selectedObject, setSelectedObject] = useState<SceneObject | null>(null)

  const addObject = (type: SceneObject['type']) => {
    const newObject: SceneObject = {
      id: Date.now().toString(),
      name: `${type}_${objects.length + 1}`,
      type,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    }
    setObjects([...objects, newObject])
    setSelectedObject(newObject)
  }

  const updateObject = (updated: SceneObject) => {
    setObjects(objects.map(obj => obj.id === updated.id ? updated : obj))
    setSelectedObject(updated)
  }

  const deleteObject = (id: string) => {
    setObjects(objects.filter(obj => obj.id !== id))
    if (selectedObject?.id === id) {
      setSelectedObject(null)
    }
  }

  return (
    <div className="editor-container">
      <Toolbar 
        onAddObject={addObject}
        leftCollapsed={leftPanelCollapsed}
        rightCollapsed={rightPanelCollapsed}
        onToggleLeft={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
        onToggleRight={() => setRightPanelCollapsed(!rightPanelCollapsed)}
      />
      
      <div className="editor-main">
        <div 
          className="panel left-panel" 
          style={{ width: leftPanelCollapsed ? '40px' : '250px' }}
        >
          <div 
            className="panel-header"
            onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
          >
            <span style={{ display: leftPanelCollapsed ? 'none' : 'inline' }}>Scene</span>
            <span className={`collapse-icon ${leftPanelCollapsed ? 'collapsed' : ''}`}>▼</span>
          </div>
          {!leftPanelCollapsed && (
            <div className="panel-content">
              <SceneHierarchy 
                objects={objects}
                selectedObject={selectedObject}
                onSelect={setSelectedObject}
              />
            </div>
          )}
        </div>

        <div className="viewport">
          <Viewport 
            objects={objects}
            selectedObject={selectedObject}
            onSelect={setSelectedObject}
          />
        </div>

        <div 
          className="panel right-panel" 
          style={{ width: rightPanelCollapsed ? '40px' : '300px' }}
        >
          <div 
            className="panel-header"
            onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
          >
            <span style={{ display: rightPanelCollapsed ? 'none' : 'inline' }}>Inspector</span>
            <span className={`collapse-icon ${rightPanelCollapsed ? 'collapsed' : ''}`}>▼</span>
          </div>
          {!rightPanelCollapsed && (
            <div className="panel-content">
              <Inspector 
                object={selectedObject}
                onUpdate={updateObject}
                onDelete={deleteObject}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
