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
  Mesh
} from '@babylonjs/core'
import { SceneObject } from './Editor'

interface ViewportProps {
  objects: SceneObject[]
  selectedObject: SceneObject | null
  onSelect: (obj: SceneObject) => void
  isPlaying: boolean
}

const rad = (deg: number) => (deg * Math.PI) / 180

export function Viewport({ objects, selectedObject, onSelect, isPlaying }: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const meshesRef = useRef<Map<string, Mesh>>(new Map())
  const objectsRef = useRef<SceneObject[]>(objects)
  const onSelectRef = useRef(onSelect)
  const isPlayingRef = useRef(isPlaying)
  const playStartRef = useRef(0)

  useEffect(() => {
    objectsRef.current = objects
  }, [objects])

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    isPlayingRef.current = isPlaying
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

    const hemi = new HemisphericLight('hemi', Vector3.Up(), scene)
    hemi.intensity = 0.5

    const sun = new DirectionalLight('sun', new Vector3(-1, -2, -1), scene)
    sun.intensity = 0.8

    const ground = MeshBuilder.CreateGround('ground', { width: 30, height: 30 }, scene)
    const groundMaterial = new StandardMaterial('groundMaterial', scene)
    groundMaterial.diffuseColor = new Color3(0.25, 0.28, 0.25)
    ground.material = groundMaterial

    engine.runRenderLoop(() => {
      if (isPlayingRef.current) {
        const t = (performance.now() - playStartRef.current) / 1000
        objectsRef.current.forEach((obj) => {
          const mesh = meshesRef.current.get(obj.id)
          if (!mesh) return
          const b = obj.behaviors
          if (b?.spin) mesh.rotation.y += 0.03
          if (b?.bounce) mesh.position.y = obj.position.y + Math.abs(Math.sin(t * 3)) * 1.5
          if (b?.patrol) mesh.position.x = obj.position.x + Math.sin(t * 1.5) * 2
        })
      }
      scene.render()
    })

    const handleResize = () => engine.resize()
    window.addEventListener('resize', handleResize)

    sceneRef.current = scene

    return () => {
      window.removeEventListener('resize', handleResize)
      engine.dispose()
      sceneRef.current = null
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
        material.diffuseColor = new Color3(0.2, 0.5, 0.8)
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
      if (selectedObject?.id === obj.id) {
        mat.diffuseColor = new Color3(0.8, 0.3, 0.3)
      } else {
        mat.diffuseColor = new Color3(0.2, 0.5, 0.8)
      }
    })
  }, [objects, selectedObject])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', outline: 'none' }}
    />
  )
}
