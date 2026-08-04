import { useEffect, useRef, useState } from 'react'
import { Viewport } from './Viewport'
import { SceneHierarchy } from './SceneHierarchy'
import { Inspector } from './Inspector'
import { Toolbar } from './Toolbar'

export interface Vector3D {
  x: number
  y: number
  z: number
}

export interface ObjectBehaviors {
  spin: boolean
  bounce: boolean
  patrol: boolean
}

export interface SceneObject {
  id: string
  name: string
  type: 'cube' | 'sphere' | 'cylinder' | 'plane'
  position: Vector3D
  rotation: Vector3D
  scale: Vector3D
  behaviors: ObjectBehaviors
}

const STORAGE_KEY = 'creative-engine-qwen-scene'

function loadSavedScene(): SceneObject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as SceneObject[]
  } catch {
    // игнорируем повреждённые данные
  }
  return []
}

export function Editor() {
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false)
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)
  const [objects, setObjects] = useState<SceneObject[]>(loadSavedScene)
  const [selectedObject, setSelectedObject] = useState<SceneObject | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(objects))
  }, [objects])

  const addObject = (type: SceneObject['type']) => {
    if (isPlaying) return
    const index = objects.length
    const yOffset = type === 'plane' ? 0 : 0.5
    const newObject: SceneObject = {
      id: Date.now().toString(),
      name: `${type}_${index + 1}`,
      type,
      position: { x: (index % 5) * 2 - 4, y: yOffset, z: Math.floor(index / 5) * 2 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      behaviors: { spin: false, bounce: false, patrol: false }
    }
    setObjects([...objects, newObject])
    setSelectedObject(newObject)
  }

  const updateObject = (updated: SceneObject) => {
    setObjects(objects.map((obj) => (obj.id === updated.id ? updated : obj)))
    setSelectedObject(updated)
  }

  const deleteObject = (id: string) => {
    setObjects(objects.filter((obj) => obj.id !== id))
    if (selectedObject?.id === id) setSelectedObject(null)
  }

  const saveToFile = () => {
    const data = JSON.stringify({ version: 1, objects }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'my-scene.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const loadFromFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const list = Array.isArray(parsed) ? parsed : parsed.objects
        if (Array.isArray(list)) {
          setObjects(list)
          setSelectedObject(null)
        } else {
          alert('Не удалось прочитать файл сцены')
        }
      } catch {
        alert('Не удалось прочитать файл сцены')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="editor-container">
      <Toolbar
        onAddObject={addObject}
        leftCollapsed={leftPanelCollapsed}
        rightCollapsed={rightPanelCollapsed}
        onToggleLeft={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
        onToggleRight={() => setRightPanelCollapsed(!rightPanelCollapsed)}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        onSave={saveToFile}
        onLoadClick={() => fileInputRef.current?.click()}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) loadFromFile(file)
          e.target.value = ''
        }}
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
            isPlaying={isPlaying}
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
