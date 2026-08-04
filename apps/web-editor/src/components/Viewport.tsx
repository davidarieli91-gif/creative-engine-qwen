import { useEffect, useRef } from 'react'
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  ActionManager,
  ExecuteCodeAction,
  Mesh
} from '@babylonjs/core'
import { SceneObject } from './Editor'

interface ViewportProps {
  objects: SceneObject[]
  selectedObject: SceneObject | null
  onSelect: (obj: SceneObject) => void
}

export function Viewport({ objects, selectedObject, onSelect }: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const meshesRef = useRef<Map<string, Mesh>>(new Map())
  const objectsRef = useRef<SceneObject[]>(objects)
  const onSelectRef = useRef(onSelect)

  useEffect(() => {
    objectsRef.current = objects
  }, [objects])

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    if (!canvasRef.current) return

    const engine = new Engine(canvasRef.current, true)
    const scene = new Scene(engine)

    const camera = new ArcRotateCamera(
      'camera',
      Math.PI / 2,
      Math.PI / 3,
      10,
      Vector3.Zero(),
      scene
    )
    camera.attachControl(canvasRef.current, true)

    const light = new HemisphericLight('light', Vector3.Up(), scene)
    light.intensity = 0.7

    const ground = MeshBuilder.CreateGround('ground', { width: 20, height: 20 }, scene)
    const groundMaterial = new StandardMaterial('groundMaterial', scene)
    groundMaterial.diffuseColor = new Color3(0.3, 0.3, 0.3)
    ground.material = groundMaterial

    engine.runRenderLoop(() => scene.render())

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

      mesh.position = new Vector3(obj.position.x, obj.position.y, obj.position.z)
      mesh.rotation = new Vector3(
        (obj.rotation.x * Math.PI) / 180,
        (obj.rotation.y * Math.PI) / 180,
        (obj.rotation.z * Math.PI) / 180
      )
      mesh.scaling = new Vector3(obj.scale.x, obj.scale.y, obj.scale.z)

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
