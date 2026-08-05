import { useEffect, useRef } from 'react'
import {
  Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight,
  MeshBuilder, StandardMaterial, Color3, Color4, ActionManager, ExecuteCodeAction,
  GizmoManager, Quaternion, VertexData, NoiseProceduralTexture, Mesh
} from '@babylonjs/core'
import { WaterMaterial } from '@babylonjs/materials'
import { SceneObject } from './Editor'
import { GizmoMode } from './Toolbar'
import { LogicData, LogicNode, buildChains } from '../logic'
import {
  TerrainTool, VoxelTerrainData, b64ToBytes, bytesToB64, buildVoxelGeometry,
  createVoxelMesh, applyVoxelBrush, topHeightAt
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

export function Viewport(props: ViewportProps) {
  const { objects, selectedObject, onSelect, onUpdate, isPlaying, gizmoMode, logic, onHud } = props

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)
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
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault()
        keysRef.current.add(e.code)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    let sculpting = false
    let lastRefresh = 0

    const remeshTerrain = () => {
      const w = terrainWorkRef.current
      if (!w) return
      const geo = buildVoxelGeometry(w.vox, w.mat, w.w, w.h, w.d, w.size)
      const newMesh = createVoxelMesh(scene, w.id, geo)
      newMesh.isPickable = true
      const old = meshesRef.current.get(w.id)
      meshesRef.current.set(w.id, newMesh)
      if (old) old.dispose()
    }

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
      const dda = raycastVoxels(w.vox, w.w, w.h, w.d, w.size, ray.origin, ray.direction, 400)
      if (dda) return dda

      const pick = sc.pick(cx, cy)
      if (pick && pick.hit && pick.pickedPoint && pick.pickedMesh === meshesRef.current.get(w.id)) {
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
        const now = performance.now()
        if (now - lastRefresh > 60) {
          lastRefresh = now
          remeshTerrain()
        }
      } catch (err) {
        console.error('[terrain] sculpt error', err)
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      if (!toolRef.current || isPlayingRef.current || e.button !== 0) return
      if (!terrainWorkRef.current) return
      const hit = getHit(e.clientX, e.clientY)
      console.log('[tool] down', toolRef.current, hit)
      if (!hit) return
      sculpting = true
      sculptHit(hit)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!toolRef.current || isPlayingRef.current) return
      const hit = getHit(e.clientX, e.clientY)
      updateCursor(hit)
      if (sculpting && hit) sculptHit(hit)
    }

    const onPointerUp = () => {
      if (!sculpting) return
      sculpting = false
      const w = terrainWorkRef.current
      if (w) {
        remeshTerrain()
        console.log('[tool] commit')
        commitTerrainRef.current(bytesToB64(w.vox), bytesToB64(w.mat))
      }
    }

    canvasRef.current.addEventListener('pointerdown', onPointerDown)
    canvasRef.current.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    const resizeObserver = new ResizeObserver(() => engine.resize())
    if (canvasRef.current.parentElement) resizeObserver.observe(canvasRef.current.parentElement)

    engine.runRenderLoop(() => {
      const nowAll = performance.now()
      const tAll = nowAll / 1000

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
                playerMesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(Math.atan2(move.x, move.z), 0, 0)
              }
            }
            if (tw && !playerObj.behaviors?.bounce && !playerObj.behaviors?.float) {
              playerMesh.position.y =
                topHeightAt(tw.vox, tw.w, tw.h, tw.d, tw.size, playerMesh.position.x, playerMesh.position.z) + 0.5
            }
            camera.target.copyFrom(playerMesh.position)
            camera.target.y += 0.5
          }
        }

        objectsRef.current.forEach((obj) => {
          if (obj.type === 'terrain' || obj.type === 'water') return
          const mesh = meshesRef.current.get(obj.id)
          if (!mesh || !mesh.isEnabled()) return
          const b = obj.behaviors
          if (b?.spin) mesh.rotate(Vector3.Up(), 0.03)
          if (b?.bounce && !b?.float) mesh.position.y = obj.position.y + Math.abs(Math.sin(t * 3)) * 1.5
          if (b?.patrol && !b?.player) mesh.position.x = obj.position.x + Math.sin(t * 1.5) * 2
        })

        chainsRef.current.forEach((chain) => {
          const ev = chain.event.data
          if (ev.type === 'timer') {
            const sec = Math.max(0.1, ev.seconds || 1)
            const acc = (timerAccRef.current.get(chain.event.id) ?? 0) + dt
            if (acc >= sec) {
              timerAccRef.current.set(chain.event.id, 0)
              runChainRef.current(chain.actions)
            } else {
              timerAccRef.current.set(chain.event.id, acc)
            }
          }
          if (ev.type === 'touch' && ev.objectId) {
            const target = meshesRef.current.get(ev.objectId)
            const pObj = objectsRef.current.find((o) => o.behaviors?.player)
            const player = pObj && meshesRef.current.get(pObj.id)
            if (target && player && target.isEnabled() && player.isEnabled()) {
              const dist = Vector3.Distance(player.position, target.position)
              if (dist < 1.3) {
                if (!touchFiredRef.current.has(chain.event.id)) {
                  touchFiredRef.current.add(chain.event.id)
                  runChainRef.current(chain.actions)
                }
              } else {
                touchFiredRef.current.delete(chain.event.id)
              }
            }
          }
        })
      }
      scene.render()
    })

    const handleResize = () => engine.resize()
    window.addEventListener('resize', handleResize)

    sceneRef.current = scene

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('pointerup', onPointerUp)
      canvasRef.current?.removeEventListener('pointerdown', onPointerDown)
      canvasRef.current?.removeEventListener('pointermove', onPointerMove)
      resizeObserver.disconnect()
      gizmoManager.dispose()
      engine.dispose()
      sceneRef.current = null
      cameraRef.current = null
      gizmoRef.current = null
      groundRef.current = null
      cursorRef.current = null
      terrainWorkRef.current = null
      waterWorkRef.current = null
      meshesRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    const currentIds = new Set(objects.map((obj) => obj.id))

    meshesRef.current.forEach((mesh, id) => {
      if (!currentIds.has(id)) {
        mesh.dispose()
        meshesRef.current.delete(id)
      }
    })

    objects.forEach((obj) => {
      if (obj.type === 'terrain' || obj.type === 'water') return

      let mesh = meshesRef.current.get(obj.id)

      if (!mesh) {
        switch (obj.type) {
          case 'cube':
            mesh = MeshBuilder.CreateBox(obj.id, { size: 1 }, scene)
            break
          case 'sphere':
            mesh = MeshBuilder.CreateSphere(obj.id, { diameter: 1 }, scene)
            break
          case 'cylinder':
            mesh = MeshBuilder.CreateCylinder(obj.id, { height: 1, diameter: 1 }, scene)
            break
          case 'plane':
            mesh = MeshBuilder.CreatePlane(obj.id, { size: 1 }, scene)
            break
        }

        const material = new StandardMaterial(`material_${obj.id}`, scene)
        mesh.material = material
        mesh.isPickable = true

        mesh.actionManager = new ActionManager(scene)
        mesh.actionManager.registerAction(
          new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
            const latest = objectsRef.current.find((o) => o.id === obj.id)
            if (!latest) return
            if (isPlayingRef.current) {
              chainsRef.current.forEach((chain) => {
                if (chain.event.data.type === 'click' && chain.event.data.objectId === obj.id) {
                  runChainRef.current(chain.actions)
                }
              })
            } else {
              onSelectRef.current(latest)
            }
          })
        )

        meshesRef.current.set(obj.id, mesh)
      }

      mesh.position.set(obj.position.x, obj.position.y, obj.position.z)
      mesh.rotationQuaternion = eulerToQuat(obj.rotation)
      mesh.scaling.set(obj.scale.x, obj.scale.y, obj.scale.z)

      const mat = mesh.material as StandardMaterial
      const col = obj.color ?? { r: 0.2, g: 0.5, b: 0.8 }
      mat.diffuseColor = new Color3(col.r, col.g, col.b)
      mat.emissiveColor = selectedObject?.id === obj.id ? new Color3(0.25, 0.08, 0.08) : Color3.Black()
    })

    const tObj = objects.find((o) => o.type === 'terrain')
    if (groundRef.current) groundRef.current.setEnabled(!tObj)

    if (tObj && tObj.terrain && tObj.terrain.voxels) {
      const td = tObj.terrain as VoxelTerrainData
      const w0 = terrainWorkRef.current
      if (!w0 || w0.id !== tObj.id || w0.srcV !== td.voxels || w0.srcM !== td.mats) {
        const vox = b64ToBytes(td.voxels)
        const mat = b64ToBytes(td.mats)
        const geo = buildVoxelGeometry(vox, mat, td.w, td.h, td.d, td.size)
        const newMesh = createVoxelMesh(scene, tObj.id, geo)
        newMesh.isPickable = true
        const old = meshesRef.current.get(tObj.id)
        meshesRef.current.set(tObj.id, newMesh)
        if (old) old.dispose()
        terrainWorkRef.current = {
          id: tObj.id, w: td.w, h: td.h, d: td.d, size: td.size,
          vox, mat, srcV: td.voxels, srcM: td.mats
        }
      }
    } else if (terrainWorkRef.current) {
      terrainWorkRef.current = null
    }

    const wObj = objects.find((o) => o.type === 'water')
    if (wObj && wObj.water) {
      const wd = wObj.water
      waterDataRef.current = { level: wd.level, waveHeight: wd.waveHeight, waveSpeed: wd.waveSpeed }
      let ww = waterWorkRef.current
      if (!ww || ww.id !== wObj.id || ww.size !== wd.size) {
        if (ww) {
          ww.mesh.dispose()
          meshesRef.current.delete(ww.id)
        }
        const sub = 64
        const vcount = (sub + 1) * (sub + 1)
        const positions = new Float32Array(vcount * 3)
        const normals = new Float32Array(vcount * 3)
        const base = new Float32Array(vcount * 2)
        for (let row = 0; row <= sub; row++) {
          for (let col = 0; col <= sub; col++) {
            const i = row * (sub + 1) + col
            const x = (col / sub - 0.5) * wd.size
            const z = (row / sub - 0.5) * wd.size
            positions[i * 3] = x
            positions[i * 3 + 1] = wd.level
            positions[i * 3 + 2] = z
            base[i * 2] = x
            base[i * 2 + 1] = z
          }
        }
        const indices: number[] = []
        const fill = (flipped: boolean) => {
          indices.length = 0
          for (let r = 0; r < sub; r++) {
            for (let c = 0; c < sub; c++) {
              const a = r * (sub + 1) + c
              const b = a + 1
              const cc = a + sub + 1
              const d = cc + 1
              if (flipped) indices.push(a, cc, b, b, cc, d)
              else indices.push(cc, a, b, b, d, cc)
            }
          }
        }
        fill(false)
        VertexData.ComputeNormals(positions, indices, normals)
        const mid = (Math.floor(sub / 2) * (sub + 1) + Math.floor(sub / 2)) * 3 + 1
        if (normals[mid] < 0) {
          fill(true)
          VertexData.ComputeNormals(positions, indices, normals)
        }
        const mesh = new Mesh(wObj.id, scene)
        const vd = new VertexData()
        vd.positions = positions
        vd.normals = normals
        vd.indices = indices
        vd.applyToMesh(mesh, true)

        let mat: any = null
        try {
          const wm = new WaterMaterial('wm_' + wObj.id, scene)
          const noise = new NoiseProceduralTexture('wbn_' + wObj.id, 256, scene)
          noise.animationSpeedEnabled = true
          wm.bumpTexture = noise
          wm.windForce = 5 + wd.waveSpeed * 15
          wm.waveLength = 0.4
          wm.timeScale = wd.waveSpeed
          wm.bumpLevel = 2
          wm.alpha = 0.85
          mat = wm
        } catch {
          const sm = new StandardMaterial('wm_' + wObj.id, scene)
          sm.diffuseColor = Color3.FromHexString(wd.color || '#1e6fd8')
          sm.specularColor = new Color3(0.7, 0.9, 1)
          sm.alpha = 0.72
          sm.backFaceCulling = false
          mat = sm
        }
        mesh.material = mat
        meshesRef.current.set(wObj.id, mesh)
        ww = { id: wObj.id, sub, size: wd.size, mesh, base, positions, normals, indices }
        waterWorkRef.current = ww
      } else {
        const m: any = ww.mesh.material
        if (m && m.windForce !== undefined) {
          m.windForce = 5 + wd.waveSpeed * 15
          m.timeScale = wd.waveSpeed
        }
      }
    } else {
      waterDataRef.current = null
      if (waterWorkRef.current) {
        waterWorkRef.current.mesh.dispose()
        meshesRef.current.delete(waterWorkRef.current.id)
        waterWorkRef.current = null
      }
    }
  }, [objects, selectedObject])

  useEffect(() => {
    const gm = gizmoRef.current
    if (!gm) return

    if (isPlaying || !selectedObject || selectedObject.type === 'terrain' || selectedObject.type === 'water') {
      gm.attachToMesh(null)
      return
    }

    const mesh = meshesRef.current.get(selectedObject.id)
    if (!mesh) return

    gm.attachToMesh(mesh)
    gm.positionGizmoEnabled = gizmoMode === 'position'
    gm.rotationGizmoEnabled = gizmoMode === 'rotation'
    gm.scaleGizmoEnabled = gizmoMode === 'scale'
    gizmoModeRef.current = gizmoMode

    const g = gm.gizmos
    if (gizmoMode === 'position' && g.positionGizmo) {
      g.positionGizmo.onDragEndObservable.clear()
      g.positionGizmo.onDragEndObservable.add(() => {
        const sel = selectedRef.current
        const m = sel && meshesRef.current.get(sel.id)
        if (!sel || !m) return
        onUpdateRef.current({
          ...sel,
          position: { x: round2(m.position.x), y: round2(m.position.y), z: round2(m.position.z) }
        })
      })
    }
    if (gizmoMode === 'rotation' && g.rotationGizmo) {
      g.rotationGizmo.onDragEndObservable.clear()
      g.rotationGizmo.onDragEndObservable.add(() => {
        const sel = selectedRef.current
        const m = sel && meshesRef.current.get(sel.id)
        if (!sel || !m || !m.rotationQuaternion) return
        onUpdateRef.current({ ...sel, rotation: quatToEuler(m.rotationQuaternion) })
      })
    }
    if (gizmoMode === 'scale' && g.scaleGizmo) {
      g.scaleGizmo.onDragEndObservable.clear()
      g.scaleGizmo.onDragEndObservable.add(() => {
        const sel = selectedRef.current
        const m = sel && meshesRef.current.get(sel.id)
        if (!sel || !m) return
        onUpdateRef.current({
          ...sel,
          scale: { x: round2(m.scaling.x), y: round2(m.scaling.y), z: round2(m.scaling.z) }
        })
      })
    }
  }, [selectedObject, isPlaying, gizmoMode, objects])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', outline: 'none' }}
    />
  )
}
