import { useEffect, useRef, useState } from 'react'
import {
  Engine, Scene, Vector3, SpotLight, MeshBuilder, StandardMaterial, Color3
} from '@babylonjs/core'

export function SkySystem() {
  const [open, setOpen] = useState(false)
  const [auto, setAuto] = useState(true)
  const [speed, setSpeed] = useState(0.05)
  const [radius, setRadius] = useState(140)
  const [height, setHeight] = useState(70)
  const stRef = useRef({ auto: true, speed: 0.05, radius: 140, height: 70, angle: 0.8 })

  useEffect(() => { stRef.current.auto = auto }, [auto])
  useEffect(() => { stRef.current.speed = speed }, [speed])
  useEffect(() => { stRef.current.radius = radius }, [radius])
  useEffect(() => { stRef.current.height = height }, [height])

  useEffect(() => {
    let scene: Scene | null = null
    let cleanup: (() => void) | null = null
    const iv = setInterval(() => {
      if (scene) return
      const eng: any = (Engine as any).Instances && (Engine as any).Instances[0]
      const sc = eng && eng.scenes && eng.scenes[0]
      if (!sc) return
      scene = sc

      const oldSun = sc.getLightByName('sun')
      const oldHemi = sc.getLightByName('hemi')
      if (oldSun) oldSun.setEnabled(false)
      if (oldHemi) oldHemi.intensity = 0.07

      const sunMesh = MeshBuilder.CreateSphere('skySunMesh', { diameter: 10 }, sc)
      const sunMat = new StandardMaterial('skySunMat', sc)
      sunMat.emissiveColor = new Color3(1, 0.75, 0.25)
      sunMat.disableLighting = true
      sunMesh.material = sunMat
      sunMesh.isPickable = false

      const moonMesh = MeshBuilder.CreateSphere('skyMoonMesh', { diameter: 6 }, sc)
      const moonMat = new StandardMaterial('skyMoonMat', sc)
      moonMat.emissiveColor = new Color3(0.75, 0.85, 1)
      moonMat.disableLighting = true
      moonMesh.material = moonMat
      moonMesh.isPickable = false

      const sunSpot = new SpotLight('skySun', new Vector3(0, 70, 0), new Vector3(0, -1, 0), 1.25, 1.2, sc)
      sunSpot.diffuseColor = new Color3(1, 0.9, 0.7)
      sunSpot.intensity = 2.4
      const moonSpot = new SpotLight('skyMoon', new Vector3(0, 70, 0), new Vector3(0, -1, 0), 0.85, 1.5, sc)
      moonSpot.diffuseColor = new Color3(0.55, 0.65, 1)
      moonSpot.intensity = 0.5

      const obs = sc.onBeforeRenderObservable.add(() => {
        const st = stRef.current
        if (st.auto) st.angle += st.speed * 0.016
        const a = st.angle
        sunMesh.position.set(Math.cos(a) * st.radius, st.height, Math.sin(a) * st.radius)
        sunSpot.position.copyFrom(sunMesh.position)
        const ma = a + Math.PI
        moonMesh.position.set(Math.cos(ma) * st.radius, st.height, Math.sin(ma) * st.radius)
        moonSpot.position.copyFrom(moonMesh.position)
      })

      cleanup = () => {
        sc.onBeforeRenderObservable.remove(obs)
        sunMesh.dispose()
        moonMesh.dispose()
        sunSpot.dispose()
        moonSpot.dispose()
        if (oldSun) oldSun.setEnabled(true)
        if (oldHemi) oldHemi.intensity = 0.5
      }
      clearInterval(iv)
    }, 100)
    return () => {
      clearInterval(iv)
      if (cleanup) cleanup()
    }
  }, [])

  const slider = (label: string, val: number, min: number, max: number, step: number, set: (n: number) => void) => (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: '#ccc' }}>
      {label}
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={(e) => set(parseFloat(e.target.value))} />
    </label>
  )

  return (
    <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 6, display: 'flex', gap: 6 }}>
      <button className="btn" style={{ background: open ? '#0e639c' : '#3e3e42' }} onClick={() => setOpen(!open)}>
        🌞 Небо
      </button>
      {open && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(20,20,24,.85)', padding: '4px 10px', borderRadius: 8 }}>
          <button className="btn" style={{ background: auto ? '#16825d' : '#3e3e42', padding: '2px 8px' }}
            onClick={() => setAuto(!auto)}>
            {auto ? '⏸' : '▶'}
          </button>
          {slider('Скорость', speed, 0.005, 0.3, 0.005, setSpeed)}
          {slider('Радиус', radius, 40, 400, 5, setRadius)}
          {slider('Высота', height, 20, 200, 5, setHeight)}
          <button className="btn" style={{ padding: '2px 8px' }}
            onClick={() => { stRef.current.angle += 0.3 }}>
            ⏩
          </button>
        </div>
      )}
    </div>
  )
}
// END_SKYSYSTEM
