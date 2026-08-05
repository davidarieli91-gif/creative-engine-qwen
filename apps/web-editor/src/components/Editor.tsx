import { useEffect, useRef, useState } from 'react'
import { Viewport } from './Viewport'
import { SceneHierarchy } from './SceneHierarchy'
import { Inspector } from './Inspector'
import { Toolbar, GizmoMode } from './Toolbar'
import { LogicEditor } from './LogicEditor'
import { TerrainPanel } from './TerrainPanel'
import { Wizard } from './Wizard'
import { LogicData } from '../logic'
import { WizardConfig, generateProject } from '../wizard'
import { exportGameHtml } from '../exporter'
import {
  TerrainTool,
  makeHeights,
  makeColors,
  generateHills,
  sampleHeight
} from '../terrain'

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

export interface TerrainObjectData {
  sub: number
  size: number
  heights: number[]
  colors: number[]
}

export interface SceneObject {
  id: string
  name: string
  type: 'cube' | 'sphere' | 'cylinder' | 'plane' | 'terrain'
  position: Vector3D
  rotation: Vector3D
  scale: Vector3D
  color: ColorRGB
  behaviors: ObjectBehaviors
  terrain?: TerrainObjectData
}

interface SavedProject {
  objects: SceneObject[]
  logic: LogicData
}

const STORAGE_KEY = 'creative-engine-qwen-scene'
const round2 = (v: number) => Math.round(v * 100) / 100

function hexToRgb(h: string): ColorRGB {
  const s = h.replace('#', '')
  return {
    r: parseInt(s.slice(0, 2), 16) / 255,
    g: parseInt(s.slice(2, 4), 16) / 255,
    b: parseInt(s.slice(4, 6), 16) / 255
  }
}

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
  const [terrainOpen, setTerrainOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(initialRef.current.objects.length === 0)
  const [hud, setHud] = useState({ score: 0, message: '' })
  const [terrainTool, setTerrainTool] = useState<TerrainTool>('raise')
  const [brushRadius, setBrushRadius] = useState(4)
  const [brushStrength, setBrushStrength] = useState(0.4)
  const [paintColor, setPaintColor] = useState('#5da345')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const terrain = objects.find((o) => o.type === 'terrain') ?? null

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
    if (isPlaying || type === 'terrain') return
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

  const exportGame = () => {
    const html = exportGameHtml(objects, logic, 'My Game — Creative Engine Qwen')
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'my-game.html'
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

  const createTerrain = (sub: number, size: number) => {
    if (isPlaying) return
    const t: SceneObject = {
      id: 'terrain_' + Date.now(),
      name: 'Terrain',
      type: 'terrain',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: { r: 1, g: 1, b: 1 },
      behaviors: { spin: false, bounce: false, patrol: false, player: false },
      terrain: {
        sub,
        size,
        heights: Array.from(makeHeights(sub)),
        colors: Array.from(makeColors(sub), round2)
      }
    }
    setObjects([...objects.filter((o) => o.type !== 'terrain'), t])
  }

  const genHills = () => {
    if (!terrain?.terrain || isPlaying) return
    const { sub, size } = terrain.terrain
    const h = Float32Array.from(terrain.terrain.heights)
    generateHills(h, sub, size, 4, Math.random() * 100)
    const updated: SceneObject = {
      ...terrain,
      terrain: { ...terrain.terrain, heights: Array.from(h, round2) }
    }
    setObjects(objects.map((o) => (o.id === terrain.id ? updated : o)))
  }

  const scatter = (kind: 'trees' | 'rocks') => {
    if (!terrain?.terrain || isPlaying) return
    const { sub, size, heights } = terrain.terrain
    const hf = Float32Array.from(heights)
    const add: SceneObject[] = []
    const count = kind === 'trees' ? 15 : 10
    const stamp = Date.now()
    for (let i = 0; i < count; i++) {
      const x = round2((Math.random() - 0.5) * size * 0.9)
      const z = round2((Math.random() - 0.5) * size * 0.9)
      const y = round2(sampleHeight(hf, sub, size, x, z))
      if (kind === 'trees') {
        add.push({
          id: `${stamp}_t${i}`,
          name: `Tree_${i + 1}`,
          type: 'cylinder',
          position: { x, y: round2(y + 0.5), z },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 0.3, y: 1, z: 0.3 },
          color: hexToRgb('#6d4c41'),
          behaviors: { spin: false, bounce: false, patrol: false, player: false }
        })
        add.push({
          id: `${stamp}_l${i}`,
          name: `Leaves_${i + 1}`,
          type: 'sphere',
          position: { x, y: round2(y + 1.5), z },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1.2, y: 1.2, z: 1.2 },
          color: hexToRgb('#66bb6a'),
          behaviors: { spin: false, bounce: false, patrol: false, player: false }
        })
      } else {
        const s = round2(0.5 + Math.random())
        add.push({
          id: `${stamp}_r${i}`,
          name: `Rock_${i + 1}`,
          type: 'cube',
          position: { x, y: round2(y + s / 2), z },
          rotation: { x: 0, y: round2(Math.random() * 40), z: 0 },
          scale: { x: s, y: s, z: s },
          color: hexToRgb('#90a4ae'),
          behaviors: { spin: false, bounce: false, patrol: false, player: false }
        })
      }
    }
    setObjects([...objects, ...add])
  }

  const deleteTerrain = () => {
    if (!terrain) return
    setObjects(objects.filter((o) => o.type !== 'terrain'))
  }

  const commitTerrain = (heights: number[], colors: number[]) => {
    if (!terrain?.terrain) return
    const updated: SceneObject = {
      ...terrain,
      terrain: { ...terrain.terrain, heights, colors }
    }
    setObjects(objects.map((o) => (o.id === terrain.id ? updated : o)))
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
        onExport={exportGame}
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
            terrainTool={terrainOpen && terrain && !isPlaying ? terrainTool : null}
            brushRadius={brushRadius}
            brushStrength={brushStrength}
            paintColor={paintColor}
            onCommitTerrain={commitTerrain}
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

          <div style={{ position: 'absolute', bottom: 10, left: 10, display: 'flex', gap: 6 }}>
            <button
              className="btn"
              style={{ background: logicOpen ? '#0e639c' : '#3e3e42' }}
              onClick={() => {
                setLogicOpen(!logicOpen)
                setTerrainOpen(false)
              }}
            >
              🧩 Logic
            </button>
            <button
              className="btn"
              style={{ background: terrainOpen ? '#0e639c' : '#3e3e42' }}
              onClick={() => {
                setTerrainOpen(!terrainOpen)
                setLogicOpen(false)
              }}
            >
              ⛰ Terrain
            </button>
          </div>
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

      {terrainOpen && (
        <div style={{ borderTop: '1px solid #3e3e42', background: '#252526' }}>
          <TerrainPanel
            terrain={terrain}
            tool={terrainTool}
            onTool={setTerrainTool}
            radius={brushRadius}
            onRadius={setBrushRadius}
            strength={brushStrength}
            onStrength={setBrushStrength}
            paintColor={paintColor}
            onPaintColor={setPaintColor}
            onCreate={createTerrain}
            onHills={genHills}
            onScatter={scatter}
            onDelete={deleteTerrain}
          />
        </div>
      )}

      <Wizard open={wizardOpen} onCreate={handleWizardCreate} onClose={() => setWizardOpen(false)} />
    </div>
  )
}
