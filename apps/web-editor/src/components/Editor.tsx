import { useEffect, useRef, useState } from 'react'
import { Viewport } from './Viewport'
import { ScenePanel } from './ScenePanel'
import { Inspector } from './Inspector'
import { Toolbar, GizmoMode } from './Toolbar'
import { LogicEditor } from './LogicEditor'
import { TerrainPanel } from './TerrainPanel'
import { Wizard } from './Wizard'
import { FlyCam } from './FlyCam'
import { UndoRedo } from './UndoRedo'
import { LogicData } from '../logic'
import { WizardConfig, generateProject } from '../wizard'
import { exportGameHtml } from '../exporter'
import {
  TerrainTool,
  createVoxelField,
  generateVoxelHills,
  rleEncode,
  rleDecode,
  b64ToBytes,
  topHeightAt,
  autoBiomes,
  heightmapToVoxels
} from '../terrain'

export interface Vector3D { x: number; y: number; z: number }
export interface ColorRGB { r: number; g: number; b: number }
export interface ObjectBehaviors {
  spin: boolean
  bounce: boolean
  patrol: boolean
  player: boolean
  float: boolean
}
export interface WaterObjectData {
  level: number
  size: number
  waveHeight: number
  waveSpeed: number
  color: string
}
export interface SceneObject {
  id: string
  name: string
  type: 'cube' | 'sphere' | 'cylinder' | 'plane' | 'terrain' | 'water'
  position: Vector3D
  rotation: Vector3D
  scale: Vector3D
  color: ColorRGB
  behaviors: ObjectBehaviors
  terrain?: any
  water?: WaterObjectData
}

interface SavedProject { objects: SceneObject[]; logic: LogicData }

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

function migrate(list: SceneObject[]): SceneObject[] {
  return list.map((o) => {
    if (o.type === 'terrain' && o.terrain && !o.terrain.voxels) {
      return { ...o, terrain: heightmapToVoxels(o.terrain) }
    }
    return o
  })
}

function loadSavedProject(): SavedProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return { objects: migrate(parsed), logic: { nodes: [], edges: [] } }
      return {
        objects: migrate(parsed.objects ?? []),
        logic: parsed.logic ?? { nodes: [], edges: [] }
      }
    }
  } catch { /* ignore */ }
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
  const [waterOpen, setWaterOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(initialRef.current.objects.length === 0)
  const [hud, setHud] = useState({ score: 0, message: '' })
  const [terrainTool, setTerrainTool] = useState<TerrainTool>('raise')
  const [brushRadius, setBrushRadius] = useState(3)
  const [brushStrength, setBrushStrength] = useState(0.5)
  const [paintId, setPaintId] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const terrain = objects.find((o) => o.type === 'terrain') ?? null
  const water = objects.find((o) => o.type === 'water') ?? null

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ objects, logic }))
    } catch { /* проект слишком большой для автосохранения — используй Save в файл */ }
  }, [objects, logic])

  useEffect(() => {
    if (!hud.message) return
    const t = setTimeout(() => setHud((h) => ({ ...h, message: '' })), 2500)
    return () => clearTimeout(t)
  }, [hud.message])

  const handleWizardCreate = (cfg: WizardConfig) => {
    if (objects.length > 0 && !window.confirm('Заменить текущий проект новым?')) return
    const project = generateProject(cfg)
    setObjects(migrate(project.objects as SceneObject[]))
    setLogic(project.logic)
    setSelectedObject(null)
    setHud({ score: 0, message: '' })
    setWizardOpen(false)
  }

  const addObject = (type: SceneObject['type']) => {
    if (isPlaying || type === 'terrain' || type === 'water') return
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
      behaviors: { spin: false, bounce: false, patrol: false, player: false, float: false }
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
          setObjects(migrate(list))
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

  const decodeTerrain = (td: any) => {
    const len = td.w * td.h * td.d
    return {
      vox: td.rle ? rleDecode(td.voxels, len) : b64ToBytes(td.voxels),
      mat: td.rle ? rleDecode(td.mats, len) : b64ToBytes(td.mats)
    }
  }

  const createTerrain = (w: number, fine: boolean) => {
    if (isPlaying) return
    const size = fine ? 0.5 : 1
    const ww = fine ? Math.min(w, 256) : w
    const h = fine ? 64 : 48
    const { vox, mat } = createVoxelField(ww, h, ww)
    generateVoxelHills(vox, mat, ww, h, ww, size, fine ? 10 : 8, Math.random() * 100)
    const t: SceneObject = {
      id: 'terrain_' + Date.now(),
      name: 'Terrain',
      type: 'terrain',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: { r: 1, g: 1, b: 1 },
      behaviors: { spin: false, bounce: false, patrol: false, player: false, float: false },
      terrain: { w: ww, h, d: ww, size, voxels: rleEncode(vox), mats: rleEncode(mat), water: rleEncode(new Uint8Array(ww * h * ww)), rle: true }
    }
    setObjects([...objects.filter((o) => o.type !== 'terrain'), t])
  }

  const genHills = () => {
    if (!terrain?.terrain || isPlaying) return
    const td = terrain.terrain
    const { vox, mat } = decodeTerrain(td)
    vox.fill(0)
    mat.fill(0)
    generateVoxelHills(vox, mat, td.w, td.h, td.d, td.size, 8, Math.random() * 100)
    const updated: SceneObject = {
      ...terrain,
      terrain: { ...td, voxels: rleEncode(vox), mats: rleEncode(mat), water: rleEncode(new Uint8Array(td.w * td.h * td.d)), rle: true }
    }
    setObjects(objects.map((o) => (o.id === terrain.id ? updated : o)))
  }

  const genBiomes = () => {
    if (!terrain?.terrain || isPlaying) return
    const td = terrain.terrain
    const { vox, mat } = decodeTerrain(td)
    autoBiomes(vox, mat, td.w, td.h, td.d)
    const updated: SceneObject = {
      ...terrain,
      terrain: { ...td, voxels: rleEncode(vox), mats: rleEncode(mat), rle: true }
    }
    setObjects(objects.map((o) => (o.id === terrain.id ? updated : o)))
  }

  const scatter = (kind: 'trees' | 'rocks') => {
    if (!terrain?.terrain || isPlaying) return
    const td = terrain.terrain
    const { vox } = decodeTerrain(td)
    const add: SceneObject[] = []
    const count = kind === 'trees' ? 15 : 10
    const stamp = Date.now()
    const half = (td.w * td.size) / 2
    for (let i = 0; i < count; i++) {
      const x = round2((Math.random() - 0.5) * half * 1.8)
      const z = round2((Math.random() - 0.5) * half * 1.8)
      const y = round2(topHeightAt(vox, td.w, td.h, td.d, td.size, x, z))
      if (y <= 0) continue
      if (kind === 'trees') {
        add.push({
          id: `${stamp}_t${i}`, name: `Tree_${i + 1}`, type: 'cylinder',
          position: { x, y: round2(y + 0.5), z }, rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 0.3, y: 1, z: 0.3 }, color: hexToRgb('#6d4c41'),
          behaviors: { spin: false, bounce: false, patrol: false, player: false, float: false }
        })
        add.push({
          id: `${stamp}_l${i}`, name: `Leaves_${i + 1}`, type: 'sphere',
          position: { x, y: round2(y + 1.5), z }, rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1.2, y: 1.2, z: 1.2 }, color: hexToRgb('#66bb6a'),
          behaviors: { spin: false, bounce: false, patrol: false, player: false, float: false }
        })
      } else {
        const s = round2(0.5 + Math.random())
        add.push({
          id: `${stamp}_r${i}`, name: `Rock_${i + 1}`, type: 'cube',
          position: { x, y: round2(y + s / 2), z }, rotation: { x: 0, y: round2(Math.random() * 40), z: 0 },
          scale: { x: s, y: s, z: s }, color: hexToRgb('#90a4ae'),
          behaviors: { spin: false, bounce: false, patrol: false, player: false, float: false }
        })
      }
    }
    setObjects([...objects, ...add])
  }

  const deleteTerrain = () => {
    if (!terrain) return
    setObjects(objects.filter((o) => o.type !== 'terrain'))
  }

  const commitTerrain = (voxels: string, mats: string, water?: string) => {
    if (!terrain?.terrain) return
    const updated: SceneObject = {
      ...terrain,
      terrain: { ...terrain.terrain, voxels, mats, rle: true, ...(water !== undefined ? { water } : {}) }
    }
    setObjects(objects.map((o) => (o.id === terrain.id ? updated : o)))
  }

  const createWater = () => {
    if (isPlaying) return
    const w: SceneObject = {
      id: 'water_' + Date.now(),
      name: 'Water',
      type: 'water',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: { r: 0.1, g: 0.3, b: 0.6 },
      behaviors: { spin: false, bounce: false, patrol: false, player: false, float: false },
      water: {
        level: 2,
        size: terrain?.terrain ? terrain.terrain.w * (terrain.terrain.size || 1) : 70,
        waveHeight: 0.35,
        waveSpeed: 1.2,
        color: '#1e6fd8'
      }
    }
    setObjects([...objects.filter((o) => o.type !== 'water'), w])
  }

  const updateWater = (patch: Partial<WaterObjectData>) => {
    if (!water?.water) return
    const updated: SceneObject = { ...water, water: { ...water.water, ...patch } }
    setObjects(objects.map((o) => (o.id === water.id ? updated : o)))
  }

  const deleteWater = () => {
    setObjects(objects.filter((o) => o.type !== 'water'))
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
        <div className="panel left-panel" style={{ width: leftPanelCollapsed ? '40px' : '250px' }}>
          <div className="panel-header" onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}>
            <span style={{ display: leftPanelCollapsed ? 'none' : 'inline' }}>Scene</span>
            <span className={`collapse-icon ${leftPanelCollapsed ? 'collapsed' : ''}`}>▼</span>
          </div>
          {!leftPanelCollapsed && (
            <div className="panel-content">
              <ScenePanel objects={objects} onObjectsChange={setObjects} selectedObject={selectedObject} onSelect={setSelectedObject} />
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
            paintId={paintId}
            onCommitTerrain={commitTerrain}
          />

          <UndoRedo objects={objects} setObjects={setObjects} isPlaying={isPlaying} />
          <FlyCam isPlaying={isPlaying} />

          {isPlaying && (
            <div style={{ position: 'absolute', top: 10, left: 12, fontSize: 20, fontWeight: 800, color: '#fff', textShadow: '0 1px 4px #000', pointerEvents: 'none' }}>
              🏆 {hud.score}
            </div>
          )}

          {isPlaying && hud.message && (
            <div style={{ position: 'absolute', top: '38%', left: 0, right: 0, textAlign: 'center', fontSize: 30, fontWeight: 800, color: '#ffe08a', textShadow: '0 2px 8px #000', pointerEvents: 'none' }}>
              {hud.message}
            </div>
          )}

          <div style={{ position: 'absolute', bottom: 10, left: 10, display: 'flex', gap: 6 }}>
            <button className="btn" style={{ background: logicOpen ? '#0e639c' : '#3e3e42' }}
              onClick={() => { setLogicOpen(!logicOpen); setTerrainOpen(false); setWaterOpen(false) }}>
              🧩 Logic
            </button>
            <button className="btn" style={{ background: terrainOpen ? '#0e639c' : '#3e3e42' }}
              onClick={() => { setTerrainOpen(!terrainOpen); setLogicOpen(false); setWaterOpen(false) }}>
              ⛰ Terrain
            </button>
            <button className="btn" style={{ background: waterOpen ? '#0e639c' : '#3e3e42' }}
              onClick={() => { setWaterOpen(!waterOpen); setLogicOpen(false); setTerrainOpen(false) }}>
              🌊 Water
            </button>
          </div>
        </div>

        <div className="panel right-panel" style={{ width: rightPanelCollapsed ? '40px' : '300px' }}>
          <div className="panel-header" onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}>
            <span style={{ display: rightPanelCollapsed ? 'none' : 'inline' }}>Inspector</span>
            <span className={`collapse-icon ${rightPanelCollapsed ? 'collapsed' : ''}`}>▼</span>
          </div>
          {!rightPanelCollapsed && (
            <div className="panel-content">
              <Inspector object={selectedObject} onUpdate={updateObject} onDelete={deleteObject} />
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
            paintId={paintId}
            onPaintId={setPaintId}
            onCreate={createTerrain}
            onHills={genHills}
            onBiomes={genBiomes}
            onScatter={scatter}
            onDelete={deleteTerrain}
          />
        </div>
      )}

      {waterOpen && (
        <div style={{ borderTop: '1px solid #3e3e42', background: '#252526', padding: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
          {!water ? (
            <>
              <span style={{ fontWeight: 700 }}>🌊 Вода:</span>
              <button className="btn" style={{ background: '#16825d' }} onClick={createWater}>🌊 Создать воду</button>
              <span style={{ color: '#888' }}>Море с волнами для кораблей и приключений!</span>
            </>
          ) : (
            <>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                Уровень
                <input type="range" min={-2} max={20} step={0.5} value={water.water?.level ?? 2}
                  onChange={(e) => updateWater({ level: parseFloat(e.target.value) })} />
                {water.water?.level}
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                Волны
                <input type="range" min={0} max={1.5} step={0.05} value={water.water?.waveHeight ?? 0.35}
                  onChange={(e) => updateWater({ waveHeight: parseFloat(e.target.value) })} />
                {water.water?.waveHeight}
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                Ветер
                <input type="range" min={0} max={3} step={0.1} value={water.water?.waveSpeed ?? 1.2}
                  onChange={(e) => updateWater({ waveSpeed: parseFloat(e.target.value) })} />
                {water.water?.waveSpeed}
              </label>
              <button className="btn btn-danger" onClick={deleteWater}>🗑 Удалить воду</button>
            </>
          )}
        </div>
      )}

      <Wizard open={wizardOpen} onCreate={handleWizardCreate} onClose={() => setWizardOpen(false)} />
    </div>
  )
}
// END_EDITOR
