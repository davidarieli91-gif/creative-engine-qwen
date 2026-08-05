import { useEffect, useRef, useState } from 'react'
import { Scene, Engine, FreeCamera, Vector3, Ray } from '@babylonjs/core'

interface FlyCamProps { isPlaying: boolean }

export function FlyCam({ isPlaying }: FlyCamProps) {
  const [flyOn, setFlyOn] = useState(false)
  const [collision, setCollision] = useState(true)
  const [ready, setReady] = useState(false)
  const sceneRef = useRef<Scene | null>(null)
  const camRef = useRef<FreeCamera | null>(null)
  const orbitRef = useRef<any>(null)
  const removedInputsRef = useRef<any>(null)
  const stRef = useRef({
    pos: new Vector3(0, 20, -30), yaw: 0, pitch: -0.3, tYaw: 0, tPitch: -0.3, roll: 0,
    speed: 48, keys: new Set<string>(), looking: false
  })
  const flyOnRef = useRef(flyOn)
  const colRef = useRef(collision)
  useEffect(() => { flyOnRef.current = flyOn }, [flyOn])
  useEffect(() => { colRef.current = collision }, [collision])

  useEffect(() => {
    let tries = 0
    const iv = setInterval(() => {
      tries++
      let sc: any = null
      try {
        sc = (Scene as any).Instances && (Scene as any).Instances.find(
          (s: any) => s && s.getEngine && s.getEngine().getRenderingCanvas && s.getEngine().getRenderingCanvas()
        )
      } catch { /* ignore */ }
      if (!sc) {
        try {
          const eng: any = (Engine as any).Instances && (Engine as any).Instances[0]
          if (eng && eng.scenes && eng.scenes.length) sc = eng.scenes[0]
        } catch { /* ignore */ }
      }
      if (!sc) {
        try {
          const cv = document.querySelector('canvas')
          if (cv && (cv as any)._scene) sc = (cv as any)._scene
        } catch { /* ignore */ }
      }
      if (sc) {
        sceneRef.current = sc
        if (!camRef.current) {
          const fc = new FreeCamera('flyCam', new Vector3(0, 20, -30), sc)
          fc.minZ = 0.1
          camRef.current = fc
        }
        console.log('[flycam] scene ready')
        setReady(true)
        clearInterval(iv)
      } else if (tries > 100) {
        console.log('[flycam] scene NOT found')
        clearInterval(iv)
      }
    }, 100)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (isPlaying && flyOnRef.current) setFlyOn(false)
  }, [isPlaying])

  useEffect(() => {
    const sc = sceneRef.current
    const fc = camRef.current
    if (!sc || !fc || !ready) return
    const st = stRef.current

    if (flyOn && !isPlaying) {
      console.log('[flycam] enable')
      const orbit: any = sc.activeCamera
      orbitRef.current = orbit
      st.pos = orbit.position.clone()
      const dir = orbit.target.subtract(orbit.position)
      const len = dir.length() || 1
      st.yaw = st.tYaw = Math.atan2(dir.x, dir.z)
      st.pitch = st.tPitch = Math.asin(Math.max(-1, Math.min(1, dir.y / len)))
      st.roll = 0
      try {
        const at = orbit.inputs && orbit.inputs.attached
        if (at) {
          removedInputsRef.current = Object.values(at)
          removedInputsRef.current.forEach((i: any) => orbit.inputs.remove(i))
        }
      } catch { /* ignore */ }
      sc.activeCamera = fc
    } else {
      console.log('[flycam] disable')
      const orbit = orbitRef.current
      if (orbit) {
        const cp = Math.cos(st.pitch)
        const fwd = new Vector3(Math.sin(st.yaw) * cp, Math.sin(st.pitch), Math.cos(st.yaw) * cp)
        orbit.position = st.pos.clone()
        orbit.target = st.pos.add(fwd.scale(12))
        try {
          if (removedInputsRef.current) removedInputsRef.current.forEach((i: any) => orbit.inputs.add(i))
        } catch { /* ignore */ }
        removedInputsRef.current = null
        sc.activeCamera = orbit
      }
    }
  }, [flyOn, isPlaying, ready])

  useEffect(() => {
    if (!flyOn || isPlaying || !ready) return
    const sc = sceneRef.current
    const fc = camRef.current
    if (!sc || !fc) return
    const st = stRef.current
    const canvas = sc.getEngine().getRenderingCanvas() as HTMLCanvasElement

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      st.keys.add(e.code)
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ'].includes(e.code)) e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => st.keys.delete(e.code)
    const onDown = (e: PointerEvent) => { if (e.button === 2) st.looking = true }
    const onMove = (e: PointerEvent) => {
      if (!st.looking) return
      st.tYaw += e.movementX * 0.0032
      st.tPitch = Math.max(-1.45, Math.min(1.45, st.tPitch - e.movementY * 0.0032))
    }
    const onUp = (e: PointerEvent) => { if (e.button === 2) st.looking = false }
    const onWheel = (e: WheelEvent) => { st.speed = Math.max(8, Math.min(280, st.speed * (e.deltaY < 0 ? 1.15 : 0.87))) }
    const onCtx = (e: Event) => e.preventDefault()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    canvas.addEventListener('wheel', onWheel)
    canvas.addEventListener('contextmenu', onCtx)

    let last = performance.now()
    const obs = sc.onBeforeRenderObservable.add(() => {
      const now = performance.now()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const k = 1 - Math.exp(-dt * 8)
      st.yaw += (st.tYaw - st.yaw) * k
      st.pitch += (st.tPitch - st.pitch) * k
      const sway = Math.max(-0.18, Math.min(0.18, (st.tYaw - st.yaw) * 0.9))
      st.roll += (sway - st.roll) * Math.min(1, dt * 5)

      const boost = st.keys.has('ShiftLeft') || st.keys.has('ShiftRight') ? 3 : 1
      const sp = st.speed * boost * dt
      const cp = Math.cos(st.pitch)
      const fwd0 = new Vector3(Math.sin(st.yaw) * cp, Math.sin(st.pitch), Math.cos(st.yaw) * cp)
      fc.position = st.pos.clone()
      fc.setTarget(st.pos.add(fwd0))
      fc.rotation.z += st.roll

      const fwdV = fc.getForwardRay().direction
      const rightV = Vector3.Cross(fwdV, Vector3.Up())
      if (rightV.lengthSquared() > 0.0001) rightV.normalize()
      const move = Vector3.Zero()
      if (st.keys.has('KeyW')) move.addInPlace(fwdV)
      if (st.keys.has('KeyS')) move.subtractInPlace(fwdV)
      if (st.keys.has('KeyD')) move.subtractInPlace(rightV)
      if (st.keys.has('KeyA')) move.addInPlace(rightV)
      if (st.keys.has('KeyE')) move.addInPlace(Vector3.Up())
      if (st.keys.has('KeyQ')) move.subtractInPlace(Vector3.Up())
      if (move.lengthSquared() > 0) { move.normalize().scaleInPlace(sp); st.pos.addInPlace(move) }

      if (colRef.current) {
        const ray = new Ray(st.pos.clone(), new Vector3(0, -1, 0), 1000)
        const pick = sc.pickWithRay(ray, (m) => m.id.startsWith('terrain_') || m.id.startsWith('water_'))
        let minY = 1.5
        if (pick && pick.hit && pick.pickedPoint) minY = Math.max(minY, pick.pickedPoint.y + 1.5)
        if (st.pos.y < minY) st.pos.y += (minY - st.pos.y) * Math.min(1, dt * 10)
        st.pos.y = Math.min(st.pos.y, 400)
      }
    })

    return () => {
      sc.onBeforeRenderObservable.remove(obs)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onCtx)
    }
  }, [flyOn, isPlaying, ready])

  return (
    <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6, zIndex: 5 }}>
      {flyOn && (
        <button className="btn" style={{ background: collision ? '#0e639c' : '#3e3e42' }}
          onClick={() => setCollision(!collision)} title="Столкновения с землёй и водой">🛡</button>
      )}
      <button className="btn" style={{ background: flyOn ? '#16825d' : '#3e3e42' }}
        onClick={() => { console.log('[flycam] click, ready =', ready); setFlyOn(!flyOn) }}>
        🎥 Полёт
      </button>
      {flyOn && (
        <span style={{ color: '#bbb', fontSize: 11, alignSelf: 'center', background: 'rgba(0,0,0,.45)', padding: '3px 8px', borderRadius: 6 }}>
          ПКМ — смотреть · WASD/E/Q — лететь · Shift ×3 · колесо — скорость
        </span>
      )}
    </div>
  )
}
