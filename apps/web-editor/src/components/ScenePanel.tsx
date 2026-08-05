import { useMemo, useState } from 'react'
import { Engine, Vector3 } from '@babylonjs/core'
import { SceneObject } from './Editor'

interface ScenePanelProps {
  objects: SceneObject[]
  onObjectsChange: (objs: SceneObject[]) => void
  selectedObject: SceneObject | null
  onSelect: (o: SceneObject | null) => void
}

interface Group { key: string; label: string; items: SceneObject[] }

export function ScenePanel({ objects, onObjectsChange, selectedObject, onSelect }: ScenePanelProps) {
  const [search, setSearch] = useState('')
  const [multi, setMulti] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)

  const groups: Group[] = useMemo(() => {
    const q = search.toLowerCase()
    const filt = objects.filter((o) => o.name.toLowerCase().includes(q))
    const list: Group[] = []
    const push = (key: string, label: string, fn: (o: SceneObject) => boolean) => {
      const items = filt.filter(fn)
      if (items.length) list.push({ key, label, items })
    }
    push('terrain', '🌍 Terrain', (o) => o.type === 'terrain')
    push('water', '🌊 Water', (o) => o.type === 'water')
    push('veg', '🌲 Vegetation', (o) => /^(Tree_|Leaves_)/.test(o.name))
    push('rocks', '🪨 Rocks', (o) => o.name.startsWith('Rock_'))
    push('obj', '🧱 Objects', (o) =>
      o.type !== 'terrain' && o.type !== 'water' && !/^(Tree_|Leaves_|Rock_)/.test(o.name))
    return list
  }, [objects, search])

  const getSel = () => objects.filter((o) => multi.has(o.id))

  const clickItem = (o: SceneObject, e: any) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      const s = new Set(multi)
      if (s.has(o.id)) s.delete(o.id)
      else s.add(o.id)
      setMulti(s)
    } else {
      setMulti(new Set([o.id]))
    }
    onSelect(o)
    setMenu(null)
  }

  const toggleGroup = (key: string) => {
    const s = new Set(collapsed)
    if (s.has(key)) s.delete(key)
    else s.add(key)
    setCollapsed(s)
  }

  const delSel = () => {
    onObjectsChange(objects.filter((o) => !multi.has(o.id)))
    setMulti(new Set())
    onSelect(null)
    setMenu(null)
  }

  const dupSel = () => {
    const stamp = Date.now()
    const copies = getSel()
      .filter((o) => o.type !== 'terrain' && o.type !== 'water')
      .map((o, i) => ({
        ...o,
        id: `${stamp}_dup${i}`,
        name: `${o.name}_copy`,
        position: { ...o.position, x: o.position.x + 1.5, z: o.position.z + 0.5 }
      }))
    if (copies.length) onObjectsChange([...objects, ...copies])
    setMenu(null)
  }

  const renameSel = () => {
    const o = getSel()[0]
    if (!o) return
    const n = window.prompt('Новое имя объекта:', o.name)
    if (n) onObjectsChange(objects.map((x) => (x.id === o.id ? { ...x, name: n } : x)))
    setMenu(null)
  }

  const focusSel = () => {
    try {
      const eng: any = (Engine as any).Instances && (Engine as any).Instances[0]
      const sc = eng && eng.scenes && eng.scenes[0]
      const o = getSel()[0] || selectedObject
      if (!sc || !o) return
      const cam: any = sc.activeCamera
      if (cam && cam.target) {
        cam.target = new Vector3(o.position.x, o.position.y, o.position.z)
        if (cam.radius !== undefined) {
          cam.radius = Math.max(6, Math.max(o.scale.x, o.scale.y, o.scale.z) * 4)
        }
      }
    } catch { /* ignore */ }
    setMenu(null)
  }

  const selectGroup = (g: Group) => {
    setMulti(new Set(g.items.map((o) => o.id)))
    setMenu(null)
  }

  const menuItem = (label: string, fn: () => void) => (
    <div
      style={{ padding: '5px 12px', cursor: 'pointer', fontSize: 12, background: '#2d2d30' }}
      onMouseEnter={(e) => ((e.target as any).style.background = '#094771')}
      onMouseLeave={(e) => ((e.target as any).style.background = '#2d2d30')}
      onClick={fn}
    >
      {label}
    </div>
  )

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}
      onMouseDown={() => setMenu(null)}>
      <div style={{ padding: 6, borderBottom: '1px solid #3e3e42' }}>
        <input
          className="property-input"
          placeholder="🔍 Поиск в сцене…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '6px 6px 0 6px', alignItems: 'center', fontSize: 11, color: '#999' }}>
        <span>Объектов: {objects.length}</span>
        {multi.size > 1 && <span style={{ color: '#4ec9a0' }}>· выбрано: {multi.size}</span>}
        <span style={{ flex: 1 }} />
        <button className="btn" style={{ padding: '2px 8px' }} title="Дублировать выбранные" onClick={dupSel}>⧉</button>
        <button className="btn" style={{ padding: '2px 8px' }} title="Фокус камеры на выбранном" onClick={focusSel}>🎯</button>
        <button className="btn btn-danger" style={{ padding: '2px 8px' }} title="Удалить выбранные" onClick={delSel}>🗑</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
        {groups.map((g) => (
          <div key={g.key} style={{ marginBottom: 6 }}>
            <div
              style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', padding: '3px 4px', background: '#333337', borderRadius: 4, fontSize: 12, fontWeight: 700 }}
              onClick={() => toggleGroup(g.key)}
              onContextMenu={(e) => { e.preventDefault(); selectGroup(g) }}
              title="ПКМ — выделить всю группу"
            >
              <span style={{ transform: collapsed.has(g.key) ? 'rotate(-90deg)' : 'none', fontSize: 10 }}>▼</span>
              {g.label}
              <span style={{ color: '#888', fontWeight: 400 }}>({g.items.length})</span>
            </div>
            {!collapsed.has(g.key) &&
              g.items.map((o) => (
                <div
                  key={o.id}
                  className="object-item"
                  style={{
                    background: multi.has(o.id) ? (o.id === selectedObject?.id ? '#094771' : '#0e3a5c') : undefined,
                    marginLeft: 10,
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}
                  onClick={(e) => clickItem(o, e)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    if (!multi.has(o.id)) { setMulti(new Set([o.id])); onSelect(o) }
                    setMenu({ x: e.clientX, y: e.clientY, id: o.id })
                  }}
                >
                  <span>{o.name}</span>
                  <span style={{ color: '#666', fontSize: 10 }}>{o.type}</span>
                </div>
              ))}
          </div>
        ))}
        {groups.length === 0 && (
          <p style={{ fontSize: 12, color: '#888' }}>Ничего не найдено</p>
        )}
      </div>

      {menu && (
        <div
          style={{
            position: 'fixed', left: menu.x, top: menu.y, zIndex: 100,
            border: '1px solid #3e3e42', borderRadius: 6, overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0,0,0,.5)', minWidth: 170
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menuItem('✏️ Переименовать', renameSel)}
          {menuItem('⧉ Дублировать', dupSel)}
          {menuItem('🎯 Фокус камеры', focusSel)}
          {menuItem('🗑 Удалить', delSel)}
        </div>
      )}
    </div>
  )
}
