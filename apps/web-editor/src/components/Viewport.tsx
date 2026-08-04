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
  Mesh
} from '@babylonjs/core'
import { SceneObject } from './Editor'
import { GizmoMode } from './Toolbar'

interface ViewportProps {
  objects: SceneObject[]
  selectedObject: SceneObject | null
  onSelect: (obj: SceneObject) => void
  onUpdate: (obj: SceneObject) => void
  isPlaying: boolean
  gizmoMode: GizmoMode
}

const rad = (deg: number) => (deg * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI
const round2 = (v: number) => Math.round(v * 100) / 100

export function Viewport({ objects, selectedObject, onSelect, onUpdate, isPlaying, gizmoMode }: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)
  const gizmoRef = useRef<GizmoManager | null>(null)
  const meshesRef = useRef<Map<string, Mesh>>(new Map())
  const objectsRef = useRef<SceneObject[]>(objects)
  const selectedRef = useRef<SceneObject | null>(selectedObject)
  const onSelectRef = useRef(onSelect)
  const onUpdateRef = useRef(onUpdate)
  const isPlayingRef = useRef(isPlaying)
  const keysRef = useRef<Set<string>>(new Set())
  const playStartRef = useRef(0)

  useEffect(() => {
    objectsRef.current = objects
  }, [objects])

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    selectedRef.current = selectedObject
  }, [selectedObject])

  useEffect(() => {
    isPlayingRef.current = isPlaying
    keysRef.current.clear()
    if (isPlaying) {
      playStartRef.current = performance.now()
    } else {
      objectsRef.current.forEach((obj) => {
        const mesh = meshesRef.current.get(obj.id)
        if (!mesh) return
        mesh.position.set(obj.position.x, obj.position.y, obj.position.z)
        mesh.rotation.set(rad(obj.rotation.x), rad(obj.rotation.y), rad(obj.rotation.z))
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

    const gizmoManager = new GizmoManager(scene)
    gizmoManager.positionGizmo.enabled = false
    gizmoManager.rotationGizmo.enabled = false
    gizmoManager.scaleGizmo.enabled = false
    gizmoRef.current = gizmoManager

    const commitTransform = () => {
      const sel = selectedRef.current
      if (!sel) return
      const mesh = meshesRef.current.get(sel.id)
      if (!mesh) return
      onUpdateRef.current({
        ...sel,
        position: { x: round2(mesh.position.x), y: round2(mesh.position.y), z: round2(mesh.position.z) },
        rotation: { x: round2(deg(mesh.rotation.x)), y: round2(deg(mesh.rotation.y)), z: round2(deg(mesh.rotation.z)) },
        scale: { x: round2(mesh.scaling.x), y: round2(mesh.scaling.y), z: round2(mesh.scaling.z) }
      })
    }
    gizmoManager.positionGizmo.onDragEndObservable.add(commitTransform)
    gizmoManager.rotationGizmo.onDragEndObservable.add(commitTransform)
    gizmoManager.scaleGizmo.onDragEndObservable.add(commitTransform)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      keysRef.current.add(e.code)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    engine.runRenderLoop(() => {
      if (isPlayingRef.current) {
        const t = (performance.now() - playStartRef.current) / 1000

        const playerObj = objectsRef.current.find((o) => o.behaviors?.player)
        if (playerObj) {
          const playerMesh = meshesRef.current.get(playerObj.id)
          if (playerMesh) {
            const keys = keysRef.current
            const fwd = camera.getForwardRay().direction.clone()
            fwd.y = 0
            if (fwd.lengthSquared() > 0.0001) fwd.normalize()
            const right = Vector3.Cross(fwd, Vector3.Up())

            const move = Vector3.Zero()
            if (keys.has('KeyW') || keys.has('ArrowUp')) move.addInPlace(fwd)
            if (keys.has('KeyS') || keys.has('ArrowDown')) move.subtractInPlace(fwd)
            if (keys.has('KeyD') || keys.has('ArrowRight')) move.addInPlace(right)
            if (keys.has('KeyA') || keys.has('ArrowLeft')) move.subtractInPlace(right)

            if (move.lengthSquared() > 0) {
              move.normalize().scaleInPlace(0.12)
              playerMesh.position.addInPlace(move)
              playerMesh.rotation.y = Math.atan2(move.x, move.z)
            }
            camera.target.copyFrom(playerMesh.position)
            camera.target.y += 0.5
          }
        }

        objectsRef.current.forEach((obj) => {
          const mesh = meshesRef.current.get(obj.id)
          if (!mesh) return
          const b = obj.behaviors
          if (b?.spin) mesh.rotation.y += 0.03
          if (b?.bounce) mesh.position.y = obj.position.y + Math.abs(Math.sin(t * 3)) * 1.5
          if (b?.patrol && !b?.player) mesh.position.x = obj.position.x + Math.sin(t * 1.5) * 2
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
      gizmoManager.dispose()
      engine.dispose()
      sceneRef.current = null
      cameraRef.current = null
      gizmoRef.current = null
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
            if (latest) onSelectRef.current(latest)
          })
        )

        meshesRef.current.set(obj.id, mesh)
      }

      mesh.position.set(obj.position.x, obj.position.y, obj.position.z)
      mesh.rotation.set(rad(obj.rotation.x), rad(obj.rotation.y), rad(obj.rotation.z))
      mesh.scaling.set(obj.scale.x, obj.scale.y, obj.scale.z)

      const mat = mesh.material as StandardMaterial
      const col = obj.color ?? { r: 0.2, g: 0.5, b: 0.8 }
      mat.diffuseColor = new Color3(col.r, col.g, col.b)
      mat.emissiveColor =
        selectedObject?.id === obj.id ? new Color3(0.25, 0.08, 0.08) : Color3.Black()
    })
  }, [objects, selectedObject])

  useEffect(() => {
    const gm = gizmoRef.current
    if (!gm) return

    if (isPlaying || !selectedObject) {
      gm.attachToMesh(null)
      return
    }

    const mesh = meshesRef.current.get(selectedObject.id)
    if (!mesh) return

    gm.attachToMesh(mesh)
    gm.positionGizmo.enabled = gizmoMode === 'position'
    gm.rotationGizmo.enabled = gizmoMode === 'rotation'
    gm.scaleGizmo.enabled = gizmoMode === 'scale'
  }, [selectedObject, isPlaying, gizmoMode, objects])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', outline: 'none' }}
    />
  )
}
