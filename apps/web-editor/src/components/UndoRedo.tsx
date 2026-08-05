import { useEffect, useRef, useState } from 'react'
import { SceneObject } from './Editor'

interface UndoRedoProps {
  objects: SceneObject[]
  setObjects: (o: SceneObject[]) => void
  isPlaying: boolean
}

export function UndoRedo({ objects, setObjects, isPlaying }: UndoRedoProps) {
  const undoRef = useRef<string[]>([])
  const redoRef = useRef<string[]>([])
  const prevRef = useRef<string>(JSON.stringify(objects))
  const timerRef = useRef<any>(null)
  const [can, setCan] = useState({ u: false, r: false })
  const objectsRef = useRef(objects)
  useEffect(() => { objectsRef.current = objects }, [objects])

  const refresh = () => setCan({ u: undoRef.current.length > 0, r: redoRef.current.length > 0 })

  useEffect(() => {
    const cur = JSON.stringify(objects)
    if (cur === prevRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const snap = prevRef.current
      const max = snap.length > 1500000 ? 3 : 10
      undoRef.current.push(snap)
      if (undoRef.current.length > max) undoRef.current.shift()
      prevRef.current = JSON.stringify(objectsRef.current)
      redoRef.current = []
      refresh()
    }, 700)
    return () => clearTimeout(timerRef.current)
  }, [objects])

  const undo = () => {
    if (!undoRef.current.length) return
    clearTimeout(timerRef.current)
    redoRef.current.push(JSON.stringify(objectsRef.current))
    const prev = undoRef.current.pop()!
    prevRef.current = prev
    setObjects(JSON.parse(prev))
    refresh()
  }

  const redo = () => {
    if (!redoRef.current.length) return
    clearTimeout(timerRef.current)
    undoRef.current.push(JSON.stringify(objectsRef.current))
    const next = redoRef.current.pop()!
    prevRef.current = next
    setObjects(JSON.parse(next))
    refresh()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (isPlaying) return null
  return (
    <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6, zIndex: 5 }}>
      <button className="btn" style={{ background: '#3e3e42', opacity: can.u ? 1 : 0.35 }}
        onClick={undo} title="Отменить (Ctrl+Z)">↩ Undo</button>
      <button className="btn" style={{ background: '#3e3e42', opacity: can.r ? 1 : 0.35 }}
        onClick={redo} title="Вернуть (Ctrl+Y)">↪ Redo</button>
    </div>
  )
}
