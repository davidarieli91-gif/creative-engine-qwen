import { useEffect, useRef, useState } from 'react'
import {
  Engine, Scene, ArcRotateCamera, FreeCamera, Vector3, HemisphericLight, DirectionalLight,
  MeshBuilder, StandardMaterial, Color3, Color4, ActionManager, ExecuteCodeAction,
  GizmoManager, Quaternion, VertexData, NoiseProceduralTexture, Mesh
} from '@babylonjs/core'
import { WaterMaterial } from '@babylonjs/materials'
import { SceneObject } from './Editor'
import { GizmoMode } from './Toolbar'
import { LogicData, LogicNode, buildChains } from '../logic'
import {
  TerrainTool, VoxelTerrainData, CHUNK, b64ToBytes, rleDecode, rleEncode,
  buildVoxelGeometryRegion, createVoxelMesh, applyVoxelBrush, topHeightAt
} from '../terrain'

interface ViewportProps {
  objects: SceneObject[]
  selectedObject: SceneObject | null
  onSelect: (obj: SceneObject) => void
  onUpdate: (obj: SceneObject) => void
  isPlaying: boolean
  gizmoMode: GizmoMode
  logic: LogicData
  onHud: (h: { score: number; message: string }) => void
  terrainTool: TerrainTool | null
  brushRadius: number
  brushStrength: number
  paintId: number
  onCommitTerrain: (voxels: string, mats: string) => void
}

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI
const round2 = (v: number) => Math.round(v * 100) / 100
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function eulerToQuat(rot: { x: number; y: number; z: number }): Quaternion {
  return Quaternion.RotationYawPitchRoll(rad(rot.y), rad(rot.x), rad(rot.z))
}

function quatToEuler(q: Quaternion): { x: number; y: number; z: number } {
  const e = q.toEulerAngles()
  return { x: round2(deg(e.x)), y: round2(deg(e.y)), z: round2(deg(e.z)) }
}

function waveH(x: number, z: number, t: number, amp: number, speed: number): number {
  if (amp <= 0) return 0
  return (
    amp *
    (0.5 * Math.sin(x * 0.18 + t * speed) +
      0.3 * Math.sin(z * 0.23 + t * speed * 1.31) +
      0.2 * Math.sin((x + z) * 0.11 + t * speed * 0.71))
  )
}

// DDA-обход вокселей лучом по алгоритму Amanatides & Woo (1987),
// та же техника, что в открытом репозитории DeadlockCode/voxel_ray_traversal (MIT/Apache-2.0)
interface VoxelHit { x: number; y: number; z: number; nx: number; ny: number; nz: number }

function raycastVoxels(
  vox: Uint8Array, w: number, h: number, d: number, size: number,
  o: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number },
  maxDist: number
): VoxelHit | null {
  let dx = dir.x
  let dy = dir.y
  let dz = dir.z
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (len < 1e-9) return null
  dx /= len
  dy /= len
  dz /= len

  let x = Math.floor(o.x / size + w / 2)
  let y = Math.floor(o.y / size)
  let z = Math.floor(o.z / size + d / 2)

  const inRange = (a: number, b: number, c: number) => a >= 0 && b >= 0 && c >= 0 && a < w && b < h && c < d
  if (inRange(x, y, z) && vox[(y * d + z) * w + x]) return { x, y, z, nx: 0, ny: 1, nz: 0 }

  const stepX = dx > 0 ? 1 : -1
  const stepY = dy > 0 ? 1 : -1
  const stepZ = dz > 0 ? 1 : -1

  const tDeltaX = dx !== 0 ? Math.abs(size / dx) : Infinity
  const tDeltaY = dy !== 0 ? Math.abs(size / dy) : Infinity
  const tDeltaZ = dz !== 0 ? Math.abs(size / dz) : Infinity

  const worldX = (x - w / 2) * size
  const worldY = y * size
  const worldZ = (z - d / 2) * size

  let tMaxX = dx !== 0 ? (dx > 0 ? worldX + size - o.x : o.x - worldX) / Math.abs(dx) : Infinity
  let tMaxY = dy !== 0 ? (dy > 0 ? worldY + size - o.y : o.y - worldY) / Math.abs(dy) : Infinity
  let tMaxZ = dz !== 0 ? (dz > 0 ? worldZ + size - o.z : o.z - worldZ) / Math.abs(dz) : Infinity

  let nx = 0
  let ny = 0
  let nz = 0
  let t = 0

  while (t <= maxDist) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX
      t = tMaxX
      tMaxX += tDeltaX
      nx = -stepX
      ny = 0
      nz = 0
    } else if (tMaxY < tMaxZ) {
      y += stepY
      t = tMaxY
      tMaxY += tDeltaY
      nx = 0
      ny = -stepY
      nz = 0
    } else {
      z += stepZ
      t = tMaxZ
      tMaxZ += tDeltaZ
      nx = 0
      ny = 0
      nz = -stepZ
    }
    if (x < -2 || x > w + 1 || y < -2 || y > h + 1 || z < -2 || z > d + 1) break
    if (inRange(x, y, z) && vox[(y * d + z) * w + x]) return { x, y, z, nx, ny, nz }
  }
  return null
}

interface TerrainWork {
  id: string
  w: number
  h: number
  d: number
  size: number
  vox: Uint8Array
  mat: Uint8Array
  srcV: string
  srcM: string
  chunks: Map<string, Mesh>
}

interface WaterWork {
  id: string
  sub: number
  size: number
  mesh: Mesh
  base: Float32Array
  positions: Float32Array
  normals: Float32Array
  indices: number[]
}

interface FlyState {
  pos: Vector3
  yaw: number
  pitch: number
  tYaw: number
  tPitch: number
  roll: number
  speed: number
  keys: Set<string>
  looking: boolean
}

export function Viewport(props: ViewportProps) {
  const { objects, selectedObject, onSelect, onUpdate, isPlaying, gizmoMode, logic, onHud } = props

  const [flyMode, setFlyMode] = useState(false)
  const [flyCollision, setFlyCollision] = useState(true)
  const flyModeRef = useRef(flyMode)
  const flyCollisionRef = useRef(flyCollision)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)
  const flyCamRef = useRef<FreeCamera | null>(null)
  const flyRef = useRef<FlyState>({
    pos: new Vector3(0, 20, -30), yaw: 0, pitch: -0.3, tYaw: 0, tPitch: -0.3, roll: 0,
    speed: 20, keys: new Set(), looking: false
  })
  const gizmoRef = useRef<GizmoManager | null>(null)
  const groundRef = useRef<Mesh | null>(null)
  const cursorRef = useRef<Mesh | null>(null)
  const pointersInputRef = useRef<any>(null)
  const meshesRef = useRef<Map<string, Mesh>>(new Map())
  const terrainWorkRef = useRef<TerrainWork | null>(null)
  const waterWorkRef = useRef<WaterWork | null>(null)
  const waterDataRef = useRef<{ level: number; waveHeight: number; waveSpeed: number } | null>(null)
  const floatVelRef = useRef<Map<string, number>>(new Map())
  const sinkProgRef = useRef<Map<string, number>>(new Map())
  const sinkTargetRef = useRef<Map<string, number>>(new Map())
  const objectsRef = useRef<SceneObject[]>(objects)
  const selectedRef = useRef<SceneObject | null>(selectedObject)
  const onSelectRef = useRef(onSelect)
  const onUpdateRef = useRef(onUpdate)
  const isPlayingRef = useRef(isPlaying)
  const logicRef = useRef<LogicData>(logic)
  const onHudRef = useRef(onHud)
  const keysRef = useRef<Set<string>>(new Set())
  const playStartRef = useRef(0)
  const lastTsRef = useRef(0)
  const lastFlyRef = useRef(0)
  const lastWaterRef = useRef(0)
  const gizmoModeRef = useRef<GizmoMode>('position')
  const chainsRef = useRef<{ event: LogicNode; actions: LogicNode[] }[]>([])
  const touchFiredRef = useRef<Set<string>>(new Set())
  const timerAccRef = useRef<Map<string, number>>(new Map())
  const scoreRef = useRef(0)
  const runtimeHiddenRef = useRef<Set<string>>(new Set())
  const toolRef = useRef<TerrainTool | null>(props.terrainTool)
  const radiusRef = useRef(props.brushRadius)
  const strengthRef = useRef(props.brushStrength)
  const paintRef = useRef(props.paintId)
  const commitTerrainRef = useRef(props.onCommitTerrain)

  useEffect(() => { objectsRef.current = objects }, [objects])
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { onUpdateRef.current = onUpdate }, [onUpdate])
  useEffect(() => { selectedRef.current = selectedObject }, [selectedObject])
  useEffect(() => { logicRef.current = logic }, [logic])
  useEffect(() => { onHudRef.current = onHud }, [onHud])
  useEffect(() => { toolRef.current = props.terrainTool }, [props.terrainTool])
  useEffect(() => { radiusRef.current = props.brushRadius }, [props.brushRadius])
  useEffect(() => { strengthRef.current = props.brushStrength }, [props.brushStrength])
  useEffect(() => { paintRef.current = props.paintId }, [props.paintId])
  useEffect(() => { commitTerrainRef.current = props.onCommitTerrain }, [props.onCommitTerrain])

  useEffect(() => { flyModeRef.current = flyMode }, [flyMode])
  useEffect(() => { flyCollisionRef.current = flyCollision }, [flyCollision])

  useEffect(() => {
    const sc = sceneRef.current
    const orbit = cameraRef.current
    const fly = flyCamRef.current
    if (!sc || !orbit || !fly) return
    if (isPlaying && flyModeRef.current) setFlyMode(false)
  }, [isPlaying])

  useEffect(() => {
    const sc = sceneRef.current
    const orbit = cameraRef.current
    const fly = flyCamRef.current
    if (!sc || !orbit || !fly) return

    if (flyMode && !isPlaying) {
      const f = flyRef.current
      f.pos = orbit.position.clone()
      const dir = orbit.target.subtract(orbit.position)
      const len = dir.length()
      f.yaw = f.tYaw = Math.atan2(dir.x, dir.z)
      f.pitch = f.tPitch = Math.asin(clamp(dir.y / (len || 1), -1, 1))
      f.roll = 0
      sc.activeCamera = fly
    } else {
      const f = flyRef.current
      const cp = Math.cos(f.pitch)
      const fwd = new Vector3(Math.sin(f.yaw) * cp, Math.sin(f.pitch), Math.cos(f.yaw) * cp)
      orbit.position = f.pos.clone()
      orbit.target = f.pos.add(fwd.scale(12))
      sc.activeCamera = orbit
    }
  }, [flyMode, isPlaying])

  useEffect(() => {
    if (cursorRef.current) cursorRef.current.setEnabled(!!props.terrainTool && !isPlaying)
  }, [props.terrainTool, isPlaying])

  useEffect(() => {
    const cam = cameraRef.current
    if (!cam) return
    try {
      const attached: any = (cam.inputs as any).attached
      if (props.terrainTool) {
        if (attached && attached.pointers) {
          pointersInputRef.current = attached.pointers
          cam.inputs.remove(attached.pointers)
        }
      } else if (pointersInputRef.current) {
        cam.inputs.add(pointersInputRef.current)
        pointersInputRef.current = null
      }
    } catch {
      // ignore
    }
  }, [props.terrainTool])

  const disposeChunks = (w: TerrainWork) => {
    w.chunks.forEach((m) => m.dispose())
    w.chunks.clear()
  }

  const remeshChunk = (w: TerrainWork, cx: number, cz: number) => {
    const sc = sceneRef.current
    if (!sc) return
    const key = cx + '_' + cz
    const old = w.chunks.get(key)
    if (old) old.dispose()
    const x0 = cx * CHUNK
    const z0 = cz * CHUNK
    const x1 = Math.min(w.w, x0 + CHUNK)
    const z1 = Math.min(w.d, z0 + CHUNK)
    const geo = buildVoxelGeometryRegion(w.vox, w.mat, w.w, w.h, w.d, w.size, x0, z0, x1, z1)
    if (geo.indices.length === 0) {
      w.chunks.delete(key)
      return
    }
    const mesh = createVoxelMesh(sc, w.id + '_c' + key, geo)
    mesh.isPickable = true
    w.chunks.set(key, mesh)
  }

  const remeshAll = (w: TerrainWork) => {
    disposeChunks(w)
    const ncx = Math.ceil(w.w / CHUNK)
    const ncz = Math.ceil(w.d / CHUNK)
    for (let cz = 0; cz < ncz; cz++) {
      for (let cx = 0; cx < ncx; cx++) remeshChunk(w, cx, cz)
    }
  }

  const remeshRegion = (w: TerrainWork, minx: number, minz: number, maxx: number, maxz: number) => {
    const cx0 = Math.max(0, Math.floor(minx / CHUNK))
    const cx1 = Math.min(Math.ceil(w.w / CHUNK) - 1, Math.floor(maxx / CHUNK))
    const cz0 = Math.max(0, Math.floor(minz / CHUNK))
    const cz1 = Math.min(Math.ceil(w.d / CHUNK) - 1, Math.floor(maxz / CHUNK))
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) remeshChunk(w, cx, cz)
    }
  }

  const runChain = (actions: LogicNode[]) => {
    actions.forEach((node) => {
      const d = node.data
      switch (d.type) {
        case 'score': {
          scoreRef.current += typeof d.value === 'number' ? d.value : 1
          onHudRef.current({ score: scoreRef.current, message: '' })
          break
        }
        case 'text': {
          onHudRef.current({ score: scoreRef.current, message: d.message || '...' })
          break
        }
        case 'delete': {
          if (d.objectId) {
            const m = meshesRef.current.get(d.objectId)
            if (m) {
              m.setEnabled(false)
              runtimeHiddenRef.current.add(d.objectId)
            }
          }
          break
        }
        case 'color': {
          if (d.objectId) {
            const m = meshesRef.current.get(d.objectId)
            const mat = m?.material as StandardMaterial | undefined
            if (mat) mat.diffuseColor = Color3.FromHexString(d.color || '#ffcc00')
          }
          break
        }
        case 'sink': {
          if (d.objectId) sinkTargetRef.current.set(d.objectId, 1)
          break
        }
        case 'float': {
          if (d.objectId) sinkTargetRef.current.set(d.objectId, 0)
          break
        }
      }
    })
  }
  const runChainRef = useRef(runChain)
  useEffect(() => { runChainRef.current = runChain })

  useEffect(() => {
    isPlayingRef.current = isPlaying
    keysRef.current.clear()
    if (isPlaying) {
      playStartRef.current = performance.now()
      lastTsRef.current = performance.now()
      scoreRef.current = 0
      touchFiredRef.current.clear()
      timerAccRef.current.clear()
      sinkTargetRef.current.clear()
      sinkProgRef.current.clear()
      floatVelRef.current.clear()
      chainsRef.current = buildChains(logicRef.current)
      chainsRef.current
        .filter((c) => c.event.data.type === 'start')
        .forEach((c) => runChainRef.current(c.actions))
      const active = document.activeElement as HTMLElement | null
      if (active && typeof active.blur === 'function') active.blur()
    } else {
      runtimeHiddenRef.current.forEach((id) => {
        const m = meshesRef.current.get(id)
        if (m) m.setEnabled(true)
      })
      runtimeHiddenRef.current.clear()
      objectsRef.current.forEach((obj) => {
        if (obj.type === 'terrain' || obj.type === 'water') return
        const mesh = meshesRef.current.get(obj.id)
        if (!mesh) return
        mesh.position.set(obj.position.x, obj.position.y, obj.position.z)
        mesh.rotationQuaternion = eulerToQuat(obj.rotation)
        const mat = mesh.material as StandardMaterial
        const col = obj.color ?? { r: 0.2, g: 0.5, b: 0.8 }
        mat.diffuseColor = new Color3(col.r, col.g, col.b)
      })
    }
  }, [isPlaying])

  useEffect(() => {
    if (!canvasRef.current) return

    const engine = new Engine(canvasRef.current, true)
    const scene = new Scene(engine)
    scene.clearColor = new Color4(0.07, 0.07, 0.12, 1)

    const camera = new ArcRotateCamera('camera', Math.PI / 2, Math.PI / 3, 12, new Vector3(0, 0.5, 0), scene)
    camera.attachControl(canvasRef.current, true)
    camera.wheelPrecision = 20
    cameraRef.current = camera

    const flyCam = new FreeCamera('flyCam', new Vector3(0, 20, -30), scene)
    flyCam.minZ = 0.1
    flyCamRef.current = flyCam

    const hemi = new HemisphericLight('hemi', Vector3.Up(), scene)
    hemi.intensity = 0.5
    const sun = new DirectionalLight('sun', new Vector3(-1, -2, -1), scene)
    sun.intensity = 0.8

    const ground = MeshBuilder.CreateGround('ground', { width: 30, height: 30 }, scene)
    const groundMaterial = new StandardMaterial('groundMaterial', scene)
    groundMaterial.diffuseColor = new Color3(0.25, 0.28, 0.25)
    ground.material = groundMaterial
    groundRef.current = ground

    const cursor = MeshBuilder.CreateSphere('brushCursor', { diameter: 1 }, scene)
    const cursorMat = new StandardMaterial('cursorMat', scene)
    cursorMat.emissiveColor = new Color3(1, 0.8, 0.1)
    cursorMat.alpha = 0.5
    cursor.material = cursorMat
    cursor.isPickable = false
    cursor.setEnabled(false)
    cursorRef.current = cursor

    const gizmoManager = new GizmoManager(scene)
    gizmoManager.boundingBoxGizmoEnabled = false
    gizmoManager.usePointerToAttachGizmos = false
    gizmoRef.current = gizmoManager

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      flyRef.current.keys.add(e.code)
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'KeyQ'].includes(e.code)) {
        e.preventDefault()
        keysRef.current.add(e.code)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      flyRef.current.keys.delete(e.code)
      keysRef.current.delete(e.code)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    const onContextMenu = (e: Event) => e.preventDefault()
    canvasRef.current.addEventListener('contextmenu', onContextMenu)

    const onFlyDown = (e: PointerEvent) => {
      if (flyModeRef.current && !isPlayingRef.current && e.button === 2) flyRef.current.looking = true
    }
    const onFlyMove = (e: PointerEvent) => {
      const f = flyRef.current
      if (!f.looking) return
      f.tYaw -= e.movementX * 0.0032
      f.tPitch = clamp(f.tPitch - e.movementY * 0.0032, -1.45, 1.45)
    }
    const onFlyUp = (e: PointerEvent) => {
      if (e.button === 2) flyRef.current.looking = false
    }
    const onFlyWheel = (e: WheelEvent) => {
      if (!flyModeRef.current || isPlayingRef.current) return
      const f = flyRef.current
      f.speed = clamp(f.speed * (e.deltaY < 0 ? 1.15 : 0.87), 4, 140)
    }
    canvasRef.current.addEventListener('pointerdown', onFlyDown)
    window.addEventListener('pointermove', onFlyMove)
    window.addEventListener('pointerup', onFlyUp)
    canvasRef.current.addEventListener('wheel', onFlyWheel)

    let sculpting = false

    const voxelCenter = (w: TerrainWork, hx: number, hy: number, hz: number) =>
      new Vector3((hx + 0.5 - w.w / 2) * w.size, (hy + 0.5) * w.size, (hz + 0.5 - w.d / 2) * w.size)

    const getHit = (clientX: number, clientY: number): VoxelHit | null => {
      const canvas = canvasRef.current
      const sc = sceneRef.current
      const w = terrainWorkRef.current
      if (!canvas || !sc || !w) return null
      const rect = canvas.getBoundingClientRect()
      const cx = clientX - rect.left
      const cy = clientY - rect.top

      const ray = sc.createPickingRay(cx, cy)
      const dda = raycastVoxels(w.vox, w.w, w.h, w.d, w.size, ray.origin, ray.direction, 1000)
      if (dda) return dda

      const pick = sc.pick(cx, cy)
      if (pick && pick.hit && pick.pickedPoint && pick.pickedMesh && pick.pickedMesh.id.startsWith(w.id + '_c')) {
        const p = pick.pickedPoint
        let n = new Vector3(0, 1, 0)
        try {
          const gn = pick.getNormal(true)
          if (gn) n = gn
        } catch {
          // ignore
        }
        const ix = Math.floor((p.x - n.x * 0.01) / w.size + w.w / 2)
        const iy = Math.floor((p.y - n.y * 0.01) / w.size)
        const iz = Math.floor((p.z - n.z * 0.01) / w.size + w.d / 2)
        return {
          x: ix, y: iy, z: iz,
          nx: Math.round(n.x), ny: Math.round(n.y), nz: Math.round(n.z)
        }
      }
      return null
    }

    const updateCursor = (hit: VoxelHit | null) => {
      const c = cursorRef.current
      const w = terrainWorkRef.current
      if (!c || !w) return
      if (!hit || !toolRef.current || isPlayingRef.current) {
        c.setEnabled(false)
        return
      }
      c.setEnabled(true)
      c.position = voxelCenter(w, hit.x, hit.y, hit.z)
      const s = radiusRef.current * 2
      c.scaling.set(s, s, s)
    }

    const sculptHit = (hit: VoxelHit) => {
      const w = terrainWorkRef.current
      const tool = toolRef.current
      if (!w || !tool) return
      try {
        let bx = hit.x
        let by = hit.y
        let bz = hit.z
        if (tool === 'raise') {
          bx += hit.nx
          by += hit.ny
          bz += hit.nz
        }
        const px = (bx + 0.5 - w.w / 2) * w.size
        const py = (by + 0.5) * w.size
        const pz = (bz + 0.5 - w.d / 2) * w.size
        applyVoxelBrush(
          w.vox, w.mat, w.w, w.h, w.d, w.size,
          px, py, pz,
          radiusRef.current,
          tool,
          paintRef.current
        )
        const r = radiusRef.current + 1
        remeshRegion(w, px - r, pz - r, px + r, pz + r)
      } catch (err) {
        console.error('[terrain] sculpt error', err)
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      if (!toolRef.current || isPlayingRef.current || e.button !== 0) return
      if (!terrainWorkRef.current) return
      const hit = getHit(e.clientX, e.clientY)
      if (!hit) return
      sculpting = true
      sculptHit(hit)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (toolRef.current && !isPlayingRef.current) {
        const hit = getHit(e.clientX, e.clientY)
        updateCursor(hit)
        if (sculpting && hit) sculptHit(hit)
      }
    }

    const onPointerUp = () => {
      if (!sculpting) return
      sculpting = false
      const w = terrainWorkRef.current
      if (w) {
        commitTerrainRef.current(rleEncode(w.vox), rleEncode(w.mat))
      }
    }

    canvasRef.current.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)

    const resizeObserver = new ResizeObserver(() => engine.resize())
    if (canvasRef.current.parentElement) resizeObserver.observe(canvasRef.current.parentElement)

    engine.runRenderLoop(() => {
      const nowAll = performance.now()
      const tAll = nowAll / 1000

      if (flyModeRef.current && !isPlayingRef.current) {
        const f = flyRef.current
        const dt = Math.min(0.1, (nowAll - lastFlyRef.current) / 1000)
        lastFlyRef.current = nowAll

        const k = 1 - Math.exp(-dt * 8)
        f.yaw += (f.tYaw - f.yaw) * k
        f.pitch += (f.tPitch - f.pitch) * k
        const sway = clamp((f.tYaw - f.yaw) * 0.9, -0.18, 0.18)
        f.roll += (sway - f.roll) * Math.min(1, dt * 5)

        const boost = f.keys.has('ShiftLeft') || f.keys.has('ShiftRight') ? 3 : 1
        const sp = f.speed * boost * dt

        const cp = Math.cos(f.pitch)
        const fwd = new Vector3(Math.sin(f.yaw) * cp, Math.sin(f.pitch), Math.cos(f.yaw) * cp)
        flyCam.position = f.pos.clone()
        flyCam.setTarget(f.pos.add(fwd))
        flyCam.rotation.z += f.roll

        const fwdV = flyCam.getForwardRay().direction
        const rightV = Vector3.Cross(fwdV, Vector3.Up())
        if (rightV.lengthSquared() > 0.0001) rightV.normalize()

        const move = Vector3.Zero()
        if (f.keys.has('KeyW') || f.keys.has('ArrowUp')) move.addInPlace(fwdV)
        if (f.keys.has('KeyS') || f.keys.has('ArrowDown')) move.subtractInPlace(fwdV)
        if (f.keys.has('KeyD') || f.keys.has('ArrowRight')) move.addInPlace(rightV)
        if (f.keys.has('KeyA') || f.keys.has('ArrowLeft')) move.subtractInPlace(rightV)
        if (f.keys.has('KeyE')) move.addInPlace(Vector3.Up())
        if (f.keys.has('KeyQ')) move.subtractInPlace(Vector3.Up())
        if (move.lengthSquared() > 0) {
          move.normalize().scaleInPlace(sp)
          f.pos.addInPlace(move)
        }

        if (flyCollisionRef.current) {
          const tw = terrainWorkRef.current
          const wd = waterDataRef.current
          let minY = 1.5
          if (tw) minY = Math.max(minY, topHeightAt(tw.vox, tw.w, tw.h, tw.d, tw.size, f.pos.x, f.pos.z) + 1.5)
          if (wd) minY = Math.max(minY, wd.level + 1)
          if (f.pos.y < minY) f.pos.y += (minY - f.pos.y) * Math.min(1, dt * 10)
          const half = tw ? (tw.w * tw.size) / 2 + 120 : 200
          f.pos.x = clamp(f.pos.x, -half, half)
          f.pos.z = clamp(f.pos.z, -half, half)
          f.pos.y = clamp(f.pos.y, 0.5, 400)
        }
      } else {
        lastFlyRef.current = nowAll
      }

      const ww = waterWorkRef.current
      const wd = waterDataRef.current
      if (ww && wd && nowAll - lastWaterRef.current > 33) {
        lastWaterRef.current = nowAll
        const vcount = ww.positions.length / 3
        for (let i = 0; i < vcount; i++) {
          ww.positions[i * 3 + 1] =
            wd.level + waveH(ww.base[i * 2], ww.base[i * 2 + 1], tAll, wd.waveHeight, wd.waveSpeed)
        }
        VertexData.ComputeNormals(ww.positions, ww.indices, ww.normals)
        ww.mesh.updateVerticesData('position', ww.positions)
        ww.mesh.updateVerticesData('normal', ww.normals)
      }

      if (isPlayingRef.current) {
        const now = performance.now()
        const dt = Math.min(0.1, (now - lastTsRef.current) / 1000)
        lastTsRef.current = now
        const t = (now - playStartRef.current) / 1000

        const tw = terrainWorkRef.current
        const playerObj = objectsRef.current.find((o) => o.behaviors?.player)

        if (wd) {
          objectsRef.current.forEach((obj) => {
            if (obj.type === 'terrain' || obj.type === 'water') return
            if (!obj.behaviors?.float) return
            const mesh = meshesRef.current.get(obj.id)
            if (!mesh || !mesh.isEnabled()) return

            const target = sinkTargetRef.current.get(obj.id) ?? 0
            const p0 = sinkProgRef.current.get(obj.id) ?? 0
            const p = p0 + (target - p0) * Math.min(1, dt * 0.4)
            sinkProgRef.current.set(obj.id, p)

            const x = mesh.position.x
            const z = mesh.position.z
            const h = wd.level + waveH(x, z, t, wd.waveHeight, wd.waveSpeed)
            const targetY = h + obj.scale.y * 0.3 - p * (obj.scale.y * 0.5 + 2.5)

            let vy = floatVelRef.current.get(obj.id) ?? 0
            vy += (targetY - mesh.position.y) * 8 * dt
            vy *= Math.max(0, 1 - 2.5 * dt)
            mesh.position.y += vy
            floatVelRef.current.set(obj.id, vy)

            if (!obj.behaviors?.player) {
              const d = 1.5
              const hx = waveH(x + d, z, t, wd.waveHeight, wd.waveSpeed) - waveH(x - d, z, t, wd.waveHeight, wd.waveSpeed)
              const hz = waveH(x, z + d, t, wd.waveHeight, wd.waveSpeed) - waveH(x, z - d, t, wd.waveHeight, wd.waveSpeed)
              mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(0, hz * 0.12, -hx * 0.12)
            }
          })
        }

        if (playerObj) {
          const playerMesh = meshesRef.current.get(playerObj.id)
          if (playerMesh && playerMesh.isEnabled()) {
            const keys = keysRef.current
            const fwd = camera.target.subtract(camera.position)
            fwd.y = 0
            if (fwd.lengthSquared() > 0.0001) fwd.normalize()
            const right = Vector3.Cross(Vector3.Up(), fwd)

            const move = Vector3.Zero()
            if (keys.has('KeyW') || keys.has('ArrowUp')) move.addInPlace(fwd)
            if (keys.has('KeyS') || keys.has('ArrowDown')) move.subtractInPlace(fwd)
            if (keys.has('KeyD') || keys.has('ArrowRight')) move.addInPlace(right)
            if (keys.has('KeyA') || keys.has('ArrowLeft')) move.subtractInPlace(right)

            if (move.lengthSquared() > 0) {
              move.normalize().scaleInPlace(0.12)
              playerMesh.position.addInPlace(move)
              if (!playerObj.behaviors?.float) {
                import { useEffect, useRef, useState } from 'react'
import {
  Engine, Scene, ArcRotateCamera, FreeCamera, Vector3, HemisphericLight, DirectionalLight,
  MeshBuilder, StandardMaterial, Color3, Color4, ActionManager, ExecuteCodeAction,
  GizmoManager, Quaternion, VertexData, NoiseProceduralTexture, Mesh
} from '@babylonjs/core'
import { WaterMaterial } from '@babylonjs/materials'
import { SceneObject } from './Editor'
import { GizmoMode } from './Toolbar'
import { LogicData, LogicNode, buildChains } from '../logic'
import {
  TerrainTool, VoxelTerrainData, CHUNK, b64ToBytes, rleDecode, rleEncode,
  buildVoxelGeometryRegion, createVoxelMesh, applyVoxelBrush, topHeightAt
} from '../terrain'

interface ViewportProps {
  objects: SceneObject[]
  selectedObject: SceneObject | null
  onSelect: (obj: SceneObject) => void
  onUpdate: (obj: SceneObject) => void
  isPlaying: boolean
  gizmoMode: GizmoMode
  logic: LogicData
  onHud: (h: { score: number; message: string }) => void
  terrainTool: TerrainTool | null
  brushRadius: number
  brushStrength: number
  paintId: number
  onCommitTerrain: (voxels: string, mats: string) => void
}

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI
const round2 = (v: number) => Math.round(v * 100) / 100
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function eulerToQuat(rot: { x: number; y: number; z: number }): Quaternion {
  return Quaternion.RotationYawPitchRoll(rad(rot.y), rad(rot.x), rad(rot.z))
}
function quatToEuler(q: Quaternion): { x: number; y: number; z: number } {
  const e = q.toEulerAngles()
  return { x: round2(deg(e.x)), y: round2(deg(e.y)), z: round2(deg(e.z)) }
}
function waveH(x: number, z: number, t: number, amp: number, speed: number): number {
  if (amp <= 0) return 0
  return amp * (0.5 * Math.sin(x * 0.18 + t * speed) + 0.3 * Math.sin(z * 0.23 + t * speed * 1.31) + 0.2 * Math.sin((x + z) * 0.11 + t * speed * 0.71))
}

// DDA-обход вокселей (Amanatides & Woo 1987, как в DeadlockCode/voxel_ray_traversal, MIT/Apache-2.0)
interface VoxelHit { x: number; y: number; z: number; nx: number; ny: number; nz: number }
function raycastVoxels(
  vox: Uint8Array, w: number, h: number, d: number, size: number,
  o: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, maxDist: number
): VoxelHit | null {
  let dx = dir.x, dy = dir.y, dz = dir.z
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (len < 1e-9) return null
  dx /= len; dy /= len; dz /= len
  let x = Math.floor(o.x / size + w / 2)
  let y = Math.floor(o.y / size)
  let z = Math.floor(o.z / size + d / 2)
  const inRange = (a: number, b: number, c: number) => a >= 0 && b >= 0 && c >= 0 && a < w && b < h && c < d
  if (inRange(x, y, z) && vox[(y * d + z) * w + x]) return { x, y, z, nx: 0, ny: 1, nz: 0 }
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1
  const tDeltaX = dx !== 0 ? Math.abs(size / dx) : Infinity
  const tDeltaY = dy !== 0 ? Math.abs(size / dy) : Infinity
  const tDeltaZ = dz !== 0 ? Math.abs(size / dz) : Infinity
  const worldX = (x - w / 2) * size, worldY = y * size, worldZ = (z - d / 2) * size
  let tMaxX = dx !== 0 ? (dx > 0 ? worldX + size - o.x : o.x - worldX) / Math.abs(dx) : Infinity
  let tMaxY = dy !== 0 ? (dy > 0 ? worldY + size - o.y : o.y - worldY) / Math.abs(dy) : Infinity
  let tMaxZ = dz !== 0 ? (dz > 0 ? worldZ + size - o.z : o.z - worldZ) / Math.abs(dz) : Infinity
  let nx = 0, ny = 0, nz = 0, t = 0
  while (t <= maxDist) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0 }
    else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0 }
    else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ }
    if (x < -2 || x > w + 1 || y < -2 || y > h + 1 || z < -2 || z > d + 1) break
    if (inRange(x, y, z) && vox[(y * d + z) * w + x]) return { x, y, z, nx, ny, nz }
  }
  return null
}

interface TerrainWork {
  id: string; w: number; h: number; d: number; size: number
  vox: Uint8Array; mat: Uint8Array; srcV: string; srcM: string
  chunks: Map<string, Mesh>
}
interface WaterWork {
  id: string; sub: number; size: number; mesh: Mesh
  base: Float32Array; positions: Float32Array; normals: Float32Array; indices: number[]
}
interface FlyState {
  pos: Vector3; yaw: number; pitch: number; tYaw: number; tPitch: number
  roll: number; speed: number; keys: Set<string>; looking: boolean
}

export function Viewport(props: ViewportProps) {
  const { objects, selectedObject, onSelect, onUpdate, isPlaying, gizmoMode, logic, onHud } = props
  const [flyMode, setFlyMode] = useState(false)
  const [flyCollision, setFlyCollision] = useState(true)
  const flyModeRef = useRef(flyMode)
  const flyCollisionRef = useRef(flyCollision)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)
  const flyCamRef = useRef<FreeCamera | null>(null)
  const flyRef = useRef<FlyState>({
    pos: new Vector3(0, 20, -30), yaw: 0, pitch: -0.3, tYaw: 0, tPitch: -0.3,
    roll: 0, speed: 20, keys: new Set(), looking: false
  })
  const gizmoRef = useRef<GizmoManager | null>(null)
  const groundRef = useRef<Mesh | null>(null)
  const cursorRef = useRef<Mesh | null>(null)
  const pointersInputRef = useRef<any>(null)
  const meshesRef = useRef<Map<string, Mesh>>(new Map())
  const terrainWorkRef = useRef<TerrainWork | null>(null)
  const waterWorkRef = useRef<WaterWork | null>(null)
  const waterDataRef = useRef<{ level: number; waveHeight: number; waveSpeed: number } | null>(null)
  const floatVelRef = useRef<Map<string, number>>(new Map())
  const sinkProgRef = useRef<Map<string, number>>(new Map())
  const sinkTargetRef = useRef<Map<string, number>>(new Map())
  const objectsRef = useRef<SceneObject[]>(objects)
  const selectedRef = useRef<SceneObject | null>(selectedObject)
  const onSelectRef = useRef(onSelect)
  const onUpdateRef = useRef(onUpdate)
  const isPlayingRef = useRef(isPlaying)
  const logicRef = useRef<LogicData>(logic)
  const onHudRef = useRef(onHud)
  const keysRef = useRef<Set<string>>(new Set())
  const playStartRef = useRef(0)
  const lastTsRef = useRef(0)
  const lastFlyRef = useRef(0)
  const lastWaterRef = useRef(0)
  const gizmoModeRef = useRef<GizmoMode>('position')
  const chainsRef = useRef<{ event: LogicNode; actions: LogicNode[] }[]>([])
  const touchFiredRef = useRef<Set<string>>(new Set())
  const timerAccRef = useRef<Map<string, number>>(new Map())
  const scoreRef = useRef(0)
  const runtimeHiddenRef = useRef<Set<string>>(new Set())
  const toolRef = useRef<TerrainTool | null>(props.terrainTool)
  const radiusRef = useRef(props.brushRadius)
  const strengthRef = useRef(props.brushStrength)
  const paintRef = useRef(props.paintId)
  const commitTerrainRef = useRef(props.onCommitTerrain)

  useEffect(() => { objectsRef.current = objects }, [objects])
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { onUpdateRef.current = onUpdate }, [onUpdate])
  useEffect(() => { selectedRef.current = selectedObject }, [selectedObject])
  useEffect(() => { logicRef.current = logic }, [logic])
  useEffect(() => { onHudRef.current = onHud }, [onHud])
  useEffect(() => { toolRef.current = props.terrainTool }, [props.terrainTool])
  useEffect(() => { radiusRef.current = props.brushRadius }, [props.brushRadius])
  useEffect(() => { strengthRef.current = props.brushStrength }, [props.brushStrength])
  useEffect(() => { paintRef.current = props.paintId }, [props.paintId])
  useEffect(() => { commitTerrainRef.current = props.onCommitTerrain }, [props.onCommitTerrain])
  useEffect(() => { flyModeRef.current = flyMode }, [flyMode])
  useEffect(() => { flyCollisionRef.current = flyCollision }, [flyCollision])

  useEffect(() => {
    if (isPlaying && flyModeRef.current) setFlyMode(false)
  }, [isPlaying])

  useEffect(() => {
    const sc = sceneRef.current
    const orbit = cameraRef.current
    const fly = flyCamRef.current
    if (!sc || !orbit || !fly) return
    if (flyMode && !isPlaying) {
      const f = flyRef.current
      f.pos = orbit.position.clone()
      const dir = orbit.target.subtract(orbit.position)
      const len = dir.length() || 1
      f.yaw = f.tYaw = Math.atan2(dir.x, dir.z)
      f.pitch = f.tPitch = Math.asin(clamp(dir.y / len, -1, 1))
      f.roll = 0
      sc.activeCamera = fly
    } else {
      const f = flyRef.current
      const cp = Math.cos(f.pitch)
      const fwd = new Vector3(Math.sin(f.yaw) * cp, Math.sin(f.pitch), Math.cos(f.yaw) * cp)
      orbit.position = f.pos.clone()
      orbit.target = f.pos.add(fwd.scale(12))
      sc.activeCamera = orbit
    }
  }, [flyMode, isPlaying])

  useEffect(() => {
    if (cursorRef.current) cursorRef.current.setEnabled(!!props.terrainTool && !isPlaying)
  }, [props.terrainTool, isPlaying])

  useEffect(() => {
    const cam = cameraRef.current
    if (!cam) return
    try {
      const attached: any = (cam.inputs as any).attached
      if (props.terrainTool) {
        if (attached && attached.pointers) {
          pointersInputRef.current = attached.pointers
          cam.inputs.remove(attached.pointers)
        }
      } else if (pointersInputRef.current) {
        cam.inputs.add(pointersInputRef.current)
        pointersInputRef.current = null
      }
    } catch { /* ignore */ }
  }, [props.terrainTool])

  const disposeChunks = (w: TerrainWork) => { w.chunks.forEach((m) => m.dispose()); w.chunks.clear() }
  const remeshChunk = (w: TerrainWork, cx: number, cz: number) => {
    const sc = sceneRef.current
    if (!sc) return
    const key = cx + '_' + cz
    const old = w.chunks.get(key)
    if (old) old.dispose()
    const x0 = cx * CHUNK, z0 = cz * CHUNK
    const x1 = Math.min(w.w, x0 + CHUNK), z1 = Math.min(w.d, z0 + CHUNK)
    const geo = buildVoxelGeometryRegion(w.vox, w.mat, w.w, w.h, w.d, w.size, x0, z0, x1, z1)
    if (geo.indices.length === 0) { w.chunks.delete(key); return }
    const mesh = createVoxelMesh(sc, w.id + '_c' + key, geo)
    mesh.isPickable = true
    w.chunks.set(key, mesh)
  }
  const remeshAll = (w: TerrainWork) => {
    disposeChunks(w)
    for (let cz = 0; cz < Math.ceil(w.d / CHUNK); cz++)
      for (let cx = 0; cx < Math.ceil(w.w / CHUNK); cx++) remeshChunk(w, cx, cz)
  }
  const remeshRegion = (w: TerrainWork, minx: number, minz: number, maxx: number, maxz: number) => {
    const cx0 = Math.max(0, Math.floor(minx / CHUNK))
    const cx1 = Math.min(Math.ceil(w.w / CHUNK) - 1, Math.floor(maxx / CHUNK))
    const cz0 = Math.max(0, Math.floor(minz / CHUNK))
    const cz1 = Math.min(Math.ceil(w.d / CHUNK) - 1, Math.floor(maxz / CHUNK))
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) remeshChunk(w, cx, cz)
  }

  const runChain = (actions: LogicNode[]) => {
    actions.forEach((node) => {
      const d = node.data
      switch (d.type) {
        case 'score': scoreRef.current += typeof d.value === 'number' ? d.value : 1; onHudRef.current({ score: scoreRef.current, message: '' }); break
        case 'text': onHudRef.current({ score: scoreRef.current, message: d.message || '...' }); break
        case 'delete': { const m = meshesRef.current.get(d.objectId); if (m) { m.setEnabled(false); runtimeHiddenRef.current.add(d.objectId) } break }
        case 'color': { const m = meshesRef.current.get(d.objectId); const mat = m?.material as StandardMaterial | undefined; if (mat) mat.diffuseColor = Color3.FromHexString(d.color || '#ffcc00'); break }
        case 'sink': if (d.objectId) sinkTargetRef.current.set(d.objectId, 1); break
        case 'float': if (d.objectId) sinkTargetRef.current.set(d.objectId, 0); break
      }
    })
  }
  const runChainRef = useRef(runChain)
  useEffect(() => { runChainRef.current = runChain }
