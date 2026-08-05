import { useEffect, useRef } from 'react'
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  ActionManager,
  ExecuteCodeAction,
  GizmoManager,
  Quaternion,
  PointerEventTypes,
  Mesh
} from '@babylonjs/core'
import { SceneObject } from './Editor'
import { GizmoMode } from './Toolbar'
import { LogicData, LogicNode, buildChains } from '../logic'
import {
  TerrainTool,
  applyBrush,
  createTerrainMesh,
  updateTerrainMesh,
  sampleHeight
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
  paintColor: string
  onCommitTerrain: (heights: number[], colors: number[]) => void
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

interface TerrainWork {
  id: string
  sub: number
  size: number
  heights: Float32Array
  colors: Float32Array
  srcH: number[]
  srcC: number[]
}

export function Viewport(props: ViewportProps) {
  const { objects, selectedObject, onSelect, onUpdate, isPlaying, gizmoMode, logic, onHud } = props

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)
  const gizmoRef = useRef<GizmoManager | null>(null)
  const groundRef = useRef<Mesh | null>(null)
  const pointersInputRef = useRef<any>(null)
  const meshesRef = useRef<Map<string, Mesh>>(new Map())
  const terrainWorkRef = useRef<TerrainWork | null>(null)
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
  const gizmoModeRef = useRef<GizmoMode>('position')
  const chainsRef = useRef<{ event: LogicNode; actions: LogicNode[] }[]>([])
  const touchFiredRef = useRef<Set<string>>(new Set())
  const timerAccRef = useRef<Map<string, number>>(new Map())
  const scoreRef = useRef(0)
  const runtimeHiddenRef = useRef<Set<string>>(new Set())
  const toolRef = useRef<TerrainTool | null>(props.terrainTool)
  const radiusRef = useRef(props.brushRadius)
  const strengthRef = useRef(props.brushStrength)
  const paintRef = useRef(props.paintColor)
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
  useEffect(() => { paintRef.current = props.paintColor }, [props.paintColor])
  useEffect(() => { commitTerrainRef.current = props.onCommitTerrain }, [props.onCommitTerrain])

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
      // игнорируем ошибки управления камерой
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
        if (obj.type === 'terrain') return
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

    const camera = new ArcRotateCamera(
      'camera',
      Math.PI / 2,
      Math.PI / 3,
      12,
      new Vector3(0, 0.5, 0),
      scene
    )
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
    let flattenY = 0

    const sculptAt = (p: Vector3) => {
      const w = terrainWorkRef.current
      const tool = toolRef.current
      if (!w || !tool) return
      try {
        applyBrush(
          w.heights,
          w.colors,
          w.sub,
          w.size,
          p.x,
          p.z,
          radiusRef.current,
          tool === 'raise' || tool === 'lower' ? strengthRef.current * 0.3 : strengthRef.current,
          tool,
          Color3.FromHexString(paintRef.current),
          flattenY
        )
        const mesh = meshesRef.current.get(w.id)
        if (mesh) updateTerrainMesh(mesh, w.sub, w.size, w.heights, w.colors)
      } catch (err) {
        console.error('sculpt error', err)
      }
    }

    const commit = () => {
      const w = terrainWorkRef.current
      if (w) {
        commitTerrainRef.current(
          Array.from(w.heights, round2),
          Array.from(w.colors, round2)
        )
      }
    }

    const pointerObserver = scene.onPointerObservable.add((info) => {
      const tool = toolRef.current
      if (!tool || isPlayingRef.current) return
      const w = terrainWorkRef.current
      if (!w) return
      const terrainMesh = meshesRef.current.get(w.id)
      if (!terrainMesh) return
      const pick = info.pickInfo
      if (!pick || !pick.hit || !pick.pickedPoint) return
      if (pick.pickedMesh !== terrainMesh) return

      if (info.type === PointerEventTypes.POINTERDOWN) {
        if ((info.event as PointerEvent).button !== 0) return
        sculpting = true
        flattenY = pick.pickedPoint.y
        sculptAt(pick.pickedPoint)
      } else if (info.type === PointerEventTypes.POINTERMOVE) {
        if (sculpting) sculptAt(pick.pickedPoint)
      } else if (info.type === PointerEventTypes.POINTERUP) {
        if (sculpting) {
          sculpting = false
          commit()
        }
      }
    })

    const onWindowPointerUp = () => {
      if (sculpting) {
        sculpting = false
        commit()
      }
    }
    window.addEventListener('pointerup', onWindowPointerUp)

    const resizeObserver = new ResizeObserver(() => engine.resize())
    if (canvasRef.current.parentElement) resizeObserver.observe(canvasRef.current.parentElement)

    engine.runRenderLoop(() => {
      if (isPlayingRef.current) {
        const now = performance.now()
        const dt = Math.min(0.1, (now - lastTsRef.current) / 1000)
        lastTsRef.current = now
        const t = (now - playStartRef.current) / 1000

        const w = terrainWorkRef.current
        const playerObj = objectsRef.current.find((o) => o.behaviors?.player)
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
              playerMesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(
                Math.atan2(move.x, move.z),
                0,
                0
              )
            }
            if (w && !playerObj.behaviors?.bounce) {
              const half = w.size / 2
              if (Math.abs(playerMesh.position.x) < half && Math.abs(playerMesh.position.z) < half) {
                playerMesh.position.y =
                  sampleHeight(w.heights, w.sub, w.size, playerMesh.position.x, playerMesh.position.z) + 0.5
              }
            }
            camera.target.copyFrom(playerMesh.position)
            camera.target.y += 0.5
          }
        }

        objectsRef.current.forEach((obj) => {
          if (obj.type === 'terrain') return
          const mesh = meshesRef.current.get(obj.id)
          if (!mesh || !mesh.isEnabled()) return
          const b = obj.behaviors
          if (b?.spin) mesh.rotate(Vector3.Up(), 0.03)
          if (b?.bounce) mesh.position.y = obj.position.y + Math.abs(Math.sin(t * 3)) * 1.5
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
      window.removeEventListener('pointerup', onWindowPointerUp)
      scene.onPointerObservable.remove(pointerObserver)
      resizeObserver.disconnect()
      gizmoManager.dispose()
      engine.dispose()
      sceneRef.current = null
      cameraRef.current = null
      gizmoRef.current = null
      groundRef.current = null
      terrainWorkRef.current = null
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
      if (obj.type === 'terrain') return

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
      mat.emissiveColor =
        selectedObject?.id === obj.id ? new Color3(0.25, 0.08, 0.08) : Color3.Black()
    })

    const tObj = objects.find((o) => o.type === 'terrain')
    if (groundRef.current) groundRef.current.setEnabled(!tObj)

    if (tObj && tObj.terrain) {
      const td = tObj.terrain
      const w = terrainWorkRef.current
      if (!w || w.id !== tObj.id || w.srcH !== td.heights || w.srcC !== td.colors) {
        const heights = Float32Array.from(td.heights)
        const colors = Float32Array.from(td.colors)
        let mesh = meshesRef.current.get(tObj.id)
        if (!mesh) {
          mesh = createTerrainMesh(scene, tObj.id, td.sub, td.size, heights, colors)
          meshesRef.current.set(tObj.id, mesh)
        } else {
          updateTerrainMesh(mesh, td.sub, td.size, heights, colors)
        }
        terrainWorkRef.current = {
          id: tObj.id,
          sub: td.sub,
          size: td.size,
          heights,
          colors,
          srcH: td.heights,
          srcC: td.colors
        }
      }
    } else if (terrainWorkRef.current) {
      terrainWorkRef.current = null
    }
  }, [objects, selectedObject])

  useEffect(() => {
    const gm = gizmoRef.current
    if (!gm) return

    if (isPlaying || !selectedObject || selectedObject.type === 'terrain') {
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
