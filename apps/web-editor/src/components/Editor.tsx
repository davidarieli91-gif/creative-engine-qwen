import { useEffect, useRef, useState } from 'react'
import { Viewport } from './Viewport'
import { SceneHierarchy } from './SceneHierarchy'
import { Inspector } from './Inspector'
import { Toolbar, GizmoMode } from './Toolbar'
import { LogicEditor } from './LogicEditor'
import { Wizard } from './Wizard'
import { LogicData } from '../logic'
import { WizardConfig, generateProject } from '../wizard'

export interface Vector3D {
  x: number
  y: number
  z: number
}

export interface ColorRGB {
  r: number
  g: number
  b: number
}

export interface ObjectBehaviors {
  spin: boolean
  bounce: boolean
  patrol: boolean
  player: boolean
}

export interface SceneObject {
  id: string
  name: string
  type: 'cube' | 'sphere' | 'cylinder' | 'plane'
  position: Vector3D
  rotation: Vector3D
  scale: Vector3D
  color: ColorRGB
  behaviors: ObjectBehaviors
}

interface SavedProject {
  objects: SceneObject[]
  logic: LogicData
}

const STORAGE_KEY = 'creative-engine-qwen-scene'

function loadSavedProject(): SavedProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return { objects: parsed, logic: { nodes: [], edges: [] } }
      return {
        objects: parsed.objects ?? [],
        logic: parsed.logic ?? { nodes: [], edges: [] }
      }
    }
  } catch {
    // игнорируем повреждённые данные
  }
  return { objects: [], logic: { nodes: [], edges: [] } }
}

export function Editor() {
  const initialRef = useRef<SavedProject | null>(null)
  if (!initialRef.current) initialRef.current = loadSavedProject()

  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false)
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)
  const [objects, setObjects] = useState<SceneObject[]>(initialRef.current.objects)
  const [logic, setLogic] = useState<LogicData>(initialRef.current.logic)
  const [selectedObject, setSelectedObject] = useState<SceneObject | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('position')
  const [logicOpen, setLogicOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(initialRef.current.objects.length === 0)
  const [hud, setHud] = useState({ score: 0, message: '' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ objects, logic }))
  }, [objects, logic])

  useEffect(() => {
    if (!hud.message) return
    const t = setTimeout(() => setHud((h) => ({ ...h, message: '' })), 2500)
    return () => clearTimeout(t)
  }, [hud.message])

  const handleWizardCreate = (cfg: WizardConfig) => {
    if (objects.length > 0 && !window.confirm('Заменить текущий проект новым?')) return
    const project = generateProject(cfg)
    setObjects(project.objects as SceneObject[])
    setLogic(project.logic)
    setSelectedObject(null)
    setHud({ score: 0, message: '' })
    setWizardOpen(false)
  }

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
      color: { r: 0.2, g: 0.5, b: 0.8 },
      behaviors: { spin: false, bounce: false, patrol: false, player: false }
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

  const togglePlay = () => {
    setIsPlaying((p) => !p)
    setHud({ score: 0, message: '' })
  }

  const saveToFile = () => {
    const data = JSON.stringify({ version: 1, objects, logic }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'my-game.json'
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
          setLogic(parsed.logic ?? { nodes: [], edges: [] })
          setSelectedObject(null)
        } else {
          alert('Не удалось прочитать файл проекта')
        }
      } catch {
        alert('Не удалось прочитать файл проекта')
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
        onTogglePlay={togglePlay}
        onSave={saveToFile}
        onLoadClick={() => fileInputRef.current?.click()}
        onNew={() => setWizardOpen(true)}
        gizmoMode={gizmoMode}
        onGizmoMode={setGizmoMode}
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
            onUpdate={updateObject}
            isPlaying={isPlaying}
            gizmoMode={gizmoMode}
            logic={logic}
            onHud={setHud}
          />

          {isPlaying && (
            <div
              style={{
                position: 'absolute',
                top: 10,
                left: 12,
                fontSize: 20,
                fontWeight: 800,
                color: '#fff',
                textShadow: '0 1px 4px #000',
                pointerEvents: 'none'
              }}
            >
              🏆 {hud.score}
            </div>
          )}

          {isPlaying && hud.message && (
            <div
              style={{
                position: 'absolute',
                top: '38%',
                left: 0,
                right: 0,
                textAlign: 'center',
                fontSize: 30,
                fontWeight: 800,
                color: '#ffe08a',
                textShadow: '0 2px 8px #000',
                pointerEvents: 'none'
              }}
            >
              {hud.message}
            </div>
          )}

          <button
            className="btn"
            style={{
              position: 'absolute',
              bottom: 10,
              left: 10,
              background: logicOpen ? '#0e639c' : '#3e3e42'
            }}
            onClick={() => setLogicOpen(!logicOpen)}
          >
            🧩 Logic
          </button>
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

      {logicOpen && (
        <div style={{ height: 320, borderTop: '1px solid #3e3e42', background: '#1e1e1e' }}>
          <LogicEditor logic={logic} objects={objects} onChange={setLogic} />
        </div>
      )}

      <Wizard open={wizardOpen} onCreate={handleWizardCreate} onClose={() => setWizardOpen(false)} />
    </div>
  )
}
