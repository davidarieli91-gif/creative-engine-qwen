import { LogicData, LogicNode, LogicNodeData } from './logic'
import { makeHeights, makeColors, generateHills, sampleHeight } from './terrain'

export interface WizardConfig {
  kind: 'game' | 'scene'
  genre: 'collector' | 'race' | 'catch' | 'clicker' | 'explore'
  size: 'small' | 'medium' | 'large'
}

interface GenObject {
  id: string
  name: string
  type: 'cube' | 'sphere' | 'cylinder' | 'plane' | 'terrain'
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
  color: { r: number; g: number; b: number }
  behaviors: { spin: boolean; bounce: boolean; patrol: boolean; player: boolean }
  terrain?: { sub: number; size: number; heights: number[]; colors: number[] }
}

function hex(h: string): { r: number; g: number; b: number } {
  const s = h.replace('#', '')
  return {
    r: parseInt(s.slice(0, 2), 16) / 255,
    g: parseInt(s.slice(2, 4), 16) / 255,
    b: parseInt(s.slice(4, 6), 16) / 255
  }
}

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

export function generateProject(cfg: WizardConfig): { objects: GenObject[]; logic: LogicData } {
  const objects: GenObject[] = []
  const nodes: LogicNode[] = []
  const edges: { id: string; source: string; target: string }[] = []
  let oid = 0
  let nid = 0
  let eid = 0

  const add = (o: any): GenObject => {
    const obj: GenObject = {
      id: `gen_${++oid}`,
      name: 'Object',
      type: 'cube',
      position: { x: 0, y: 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: { r: 0.2, g: 0.5, b: 0.8 },
      behaviors: { spin: false, bounce: false, patrol: false, player: false },
      ...o
    }
    objects.push(obj)
    return obj
  }

  const node = (data: LogicNodeData, x: number, y: number): LogicNode => {
    const n: LogicNode = { id: `wn_${++nid}`, type: 'logicNode', position: { x, y }, data }
    nodes.push(n)
    return n
  }

  const link = (a: LogicNode, b: LogicNode) => {
    edges.push({ id: `we_${++eid}`, source: a.id, target: b.id })
  }

  const counts = { small: 5, medium: 8, large: 12 }
  const decorCounts = { small: 6, medium: 12, large: 20 }

  let terrainHeights: Float32Array | null = null
  let terrainSub = 0
  let terrainSize = 0

  const addTerrain = (amp: number) => {
    terrainSub = 96
    terrainSize = 60
    terrainHeights = makeHeights(terrainSub)
    generateHills(terrainHeights, terrainSub, terrainSize, amp, 7)
    add({
      type: 'terrain',
      name: 'Terrain',
      terrain: {
        sub: terrainSub,
        size: terrainSize,
        heights: Array.from(terrainHeights, (v) => Math.round(v * 100) / 100),
        colors: Array.from(makeColors(terrainSub), (v) => Math.round(v * 100) / 100)
      }
    })
  }

  const groundY = (x: number, z: number, fallback: number) => {
    if (terrainHeights) return sampleHeight(terrainHeights, terrainSub, terrainSize, x, z)
    return fallback
  }

  let player: GenObject | null = null
  if (cfg.kind === 'game') {
    player = add({
      type: 'cube',
      name: 'Player',
      color: hex('#ff8c42'),
      position: { x: 0, y: 0.5, z: 6 },
      behaviors: { spin: false, bounce: false, patrol: false, player: true }
    })
  }

  const addDecor = () => {
    const rnd = seeded(42)
    const count = decorCounts[cfg.size]
    for (let i = 0; i < count; i++) {
      const x = (rnd() - 0.5) * 22
      const z = (rnd() - 0.5) * 22
      const y = groundY(x, z, 0)
      if (rnd() > 0.4) {
        add({ type: 'cylinder', name: `Tree_${i + 1}`, color: hex('#6d4c41'), position: { x, y: y + 0.5, z }, scale: { x: 0.3, y: 1, z: 0.3 } })
        add({ type: 'sphere', name: `Leaves_${i + 1}`, color: hex('#66bb6a'), position: { x, y: y + 1.5, z }, scale: { x: 1.2, y: 1.2, z: 1.2 } })
      } else {
        const s = 0.5 + rnd()
        add({ type: 'cube', name: `Rock_${i + 1}`, color: hex('#90a4ae'), position: { x, y: y + s / 2, z }, scale: { x: s, y: s, z: s } })
      }
    }
  }

  if (cfg.kind === 'scene') {
    addTerrain(4)
    addDecor()
    return { objects, logic: { nodes: [], edges: [] } }
  }

  if (cfg.genre === 'collector') {
    const start = node({ kind: 'event', type: 'start' }, 40, 40)
    const hello = node({ kind: 'action', type: 'text', message: 'Собери монеты! 🪙' }, 300, 40)
    link(start, hello)
    const count = counts[cfg.size]
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const r = 5 + (i % 3)
      const coin = add({
        type: 'sphere',
        name: `Coin_${i + 1}`,
        color: hex('#ffd23e'),
        position: { x: Math.cos(angle) * r, y: 0.5, z: Math.sin(angle) * r },
        scale: { x: 0.7, y: 0.7, z: 0.7 }
      })
      const y = 180 + i * 150
      const ev = node({ kind: 'event', type: 'touch', objectId: coin.id }, 40, y)
      const sc = node({ kind: 'action', type: 'score', value: 1 }, 300, y)
      const del = node({ kind: 'action', type: 'delete', objectId: coin.id }, 560, y)
      link(ev, sc)
      link(sc, del)
    }
  }

  if (cfg.genre === 'race') {
    const start = node({ kind: 'event', type: 'start' }, 40, 40)
    const hello = node({ kind: 'action', type: 'text', message: 'Добеги до финиша! 🏁' }, 300, 40)
    link(start, hello)
    const walls = cfg.size === 'small' ? 2 : cfg.size === 'medium' ? 4 : 6
    for (let i = 0; i < walls; i++) {
      add({
        type: 'cube',
        name: `Wall_${i + 1}`,
        color: hex('#8d6e63'),
        position: { x: i % 2 === 0 ? -3 : 3, y: 0.5, z: -2 - i * 3 },
        scale: { x: 3, y: 1, z: 0.6 }
      })
    }
    const finish = add({
      type: 'cylinder',
      name: 'Finish',
      color: hex('#4caf50'),
      position: { x: 0, y: 0.5, z: -4 - walls * 3 },
      scale: { x: 2, y: 0.5, z: 2 }
    })
    const ev = node({ kind: 'event', type: 'touch', objectId: finish.id }, 40, 200)
    const sc = node({ kind: 'action', type: 'score', value: 10 }, 300, 200)
    const win = node({ kind: 'action', type: 'text', message: 'ПОБЕДА! 🏆' }, 560, 200)
    link(ev, sc)
    link(sc, win)
  }

  if (cfg.genre === 'catch') {
    const start = node({ kind: 'event', type: 'start' }, 40, 40)
    const hello = node({ kind: 'action', type: 'text', message: 'Убегай от ловцов! 👾' }, 300, 40)
    link(start, hello)
    const enemies = cfg.size === 'small' ? 1 : cfg.size === 'medium' ? 2 : 4
    for (let i = 0; i < enemies; i++) {
      const enemy = add({
        type: 'cube',
        name: `Enemy_${i + 1}`,
        color: hex('#e53935'),
        position: { x: -6 + i * 4, y: 0.5, z: -4 - i * 2 },
        behaviors: { spin: false, bounce: false, patrol: true, player: false }
      })
      const y = 180 + i * 150
      const ev = node({ kind: 'event', type: 'touch', objectId: enemy.id }, 40, y)
      const txt = node({ kind: 'action', type: 'text', message: 'Тебя поймали! 😱' }, 300, y)
      const col = node({ kind: 'action', type: 'color', objectId: player?.id, color: '#ff0000' }, 560, y)
      link(ev, txt)
      link(txt, col)
    }
  }

  if (cfg.genre === 'clicker') {
    const start = node({ kind: 'event', type: 'start' }, 40, 40)
    const hello = node({ kind: 'action', type: 'text', message: 'Кликай по целям! 🎯' }, 300, 40)
    link(start, hello)
    const count = counts[cfg.size]
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const r = 4 + (i % 4)
      const target = add({
        type: 'sphere',
        name: `Target_${i + 1}`,
        color: hex('#ab47bc'),
        position: { x: Math.cos(angle) * r, y: 0.7, z: Math.sin(angle) * r },
        behaviors: { spin: true, bounce: false, patrol: false, player: false }
      })
      const y = 180 + i * 150
      const ev = node({ kind: 'event', type: 'click', objectId: target.id }, 40, y)
      const sc = node({ kind: 'action', type: 'score', value: 1 }, 300, y)
      const del = node({ kind: 'action', type: 'delete', objectId: target.id }, 560, y)
      link(ev, sc)
      link(sc, del)
    }
  }

  if (cfg.genre === 'explore') {
    addTerrain(4)
    if (player) player.position = { x: 0, y: 1, z: 6 }
    const start = node({ kind: 'event', type: 'start' }, 40, 40)
    const hello = node({ kind: 'action', type: 'text', message: 'Исследуй горы! 🏔' }, 300, 40)
    link(start, hello)
    addDecor()
  }

  return { objects, logic: { nodes, edges } }
}
