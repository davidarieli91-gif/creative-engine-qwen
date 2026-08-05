import { Mesh, Scene, VertexData, StandardMaterial, Color3 } from '@babylonjs/core'

export interface TerrainData {
  sub: number
  size: number
  heights: number[]
  colors: number[]
}

export type TerrainTool = 'raise' | 'lower' | 'smooth' | 'flatten' | 'paint'

export function makeHeights(sub: number): Float32Array {
  return new Float32Array((sub + 1) * (sub + 1))
}

export function makeColors(sub: number): Float32Array {
  const c = new Float32Array((sub + 1) * (sub + 1) * 4)
  for (let i = 0; i < c.length; i += 4) {
    c[i] = 0.36
    c[i + 1] = 0.55
    c[i + 2] = 0.3
    c[i + 3] = 1
  }
  return c
}

function hash(x: number, z: number, seed: number): number {
  const h = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453
  return h - Math.floor(h)
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = x - xi
  const zf = z - zi
  const a = hash(xi, zi, seed)
  const b = hash(xi + 1, zi, seed)
  const c = hash(xi, zi + 1, seed)
  const d = hash(xi + 1, zi + 1, seed)
  const u = smooth(xf)
  const v = smooth(zf)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export function fbm(x: number, z: number, seed: number, octaves = 4): number {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, z * freq, seed + i * 17)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

export function generateHills(heights: Float32Array, sub: number, size: number, amp: number, seed: number) {
  for (let row = 0; row <= sub; row++) {
    for (let col = 0; col <= sub; col++) {
      const x = (col / sub - 0.5) * size
      const z = (row / sub - 0.5) * size
      const n = fbm(x * 0.06, z * 0.06, seed, 4)
      heights[row * (sub + 1) + col] = (n - 0.45) * 2 * amp
    }
  }
}

export function sampleHeight(heights: Float32Array, sub: number, size: number, x: number, z: number): number {
  const gx = Math.min(Math.max((x / size + 0.5) * sub, 0), sub - 0.0001)
  const gz = Math.min(Math.max((z / size + 0.5) * sub, 0), sub - 0.0001)
  const c0 = Math.floor(gx)
  const r0 = Math.floor(gz)
  const fx = gx - c0
  const fz = gz - r0
  const i = r0 * (sub + 1) + c0
  const h00 = heights[i]
  const h10 = heights[i + 1]
  const h01 = heights[i + sub + 1]
  const h11 = heights[i + sub + 2]
  return h00 + (h10 - h00) * fx + (h01 - h00) * fz + (h00 - h10 - h01 + h11) * fx * fz
}

export function applyBrush(
  heights: Float32Array,
  colors: Float32Array,
  sub: number,
  size: number,
  cx: number,
  cz: number,
  radius: number,
  strength: number,
  tool: TerrainTool,
  paint: Color3,
  flattenY: number
) {
  const step = size / sub
  const rCells = Math.ceil(radius / step)
  const cCol = (cx / size + 0.5) * sub
  const cRow = (cz / size + 0.5) * sub
  const minCol = Math.max(0, Math.floor(cCol - rCells))
  const maxCol = Math.min(sub, Math.ceil(cCol + rCells))
  const minRow = Math.max(0, Math.floor(cRow - rCells))
  const maxRow = Math.min(sub, Math.ceil(cRow + rCells))

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const dx = (col - cCol) * step
      const dz = (row - cRow) * step
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > radius) continue
      const fall = smooth(1 - dist / radius)
      const i = row * (sub + 1) + col

      if (tool === 'raise') heights[i] += strength * fall
      else if (tool === 'lower') heights[i] -= strength * fall
      else if (tool === 'smooth') {
        const l = heights[row * (sub + 1) + Math.max(0, col - 1)]
        const r = heights[row * (sub + 1) + Math.min(sub, col + 1)]
        const u = heights[Math.max(0, row - 1) * (sub + 1) + col]
        const d = heights[Math.min(sub, row + 1) * (sub + 1) + col]
        heights[i] += ((l + r + u + d) / 4 - heights[i]) * fall * Math.min(1, strength * 2)
      } else if (tool === 'flatten') {
        heights[i] += (flattenY - heights[i]) * fall * Math.min(1, strength)
      } else if (tool === 'paint') {
        const k = i * 4
        const t = fall * Math.min(1, strength * 2)
        colors[k] += (paint.r - colors[k]) * t
        colors[k + 1] += (paint.g - colors[k + 1]) * t
        colors[k + 2] += (paint.b - colors[k + 2]) * t
      }
    }
  }
}

function fillIndices(indices: number[], sub: number, flipped: boolean) {
  indices.length = 0
  for (let row = 0; row < sub; row++) {
    for (let col = 0; col < sub; col++) {
      const a = row * (sub + 1) + col
      const b = a + 1
      const c = a + sub + 1
      const d = c + 1
      if (flipped) indices.push(a, c, b, b, c, d)
      else indices.push(c, a, b, b, d, c)
    }
  }
}

export function buildTerrainGeometry(sub: number, size: number, heights: Float32Array, colors: Float32Array) {
  const vcount = (sub + 1) * (sub + 1)
  const positions = new Float32Array(vcount * 3)
  const normals = new Float32Array(vcount * 3)
  for (let row = 0; row <= sub; row++) {
    for (let col = 0; col <= sub; col++) {
      const i = row * (sub + 1) + col
      positions[i * 3] = (col / sub - 0.5) * size
      positions[i * 3 + 1] = heights[i]
      positions[i * 3 + 2] = (row / sub - 0.5) * size
    }
  }
  const indices: number[] = []
  fillIndices(indices, sub, false)
  VertexData.ComputeNormals(positions, indices, normals)
  const mid = (Math.floor(sub / 2) * (sub + 1) + Math.floor(sub / 2)) * 3 + 1
  if (normals[mid] < 0) {
    fillIndices(indices, sub, true)
    VertexData.ComputeNormals(positions, indices, normals)
  }
  return { positions, normals, indices, colors }
}

export function createTerrainMesh(
  scene: Scene,
  id: string,
  sub: number,
  size: number,
  heights: Float32Array,
  colors: Float32Array
): Mesh {
  const mesh = new Mesh(id, scene)
  const geo = buildTerrainGeometry(sub, size, heights, colors)
  const vd = new VertexData()
  vd.positions = geo.positions
  vd.normals = geo.normals
  vd.indices = geo.indices
  vd.colors = geo.colors
  vd.applyToMesh(mesh, true)
  const mat = new StandardMaterial('tm_' + id, scene)
  mat.diffuseColor = new Color3(1, 1, 1)
  mesh.material = mat
  return mesh
}

export function updateTerrainMesh(
  mesh: Mesh,
  sub: number,
  size: number,
  heights: Float32Array,
  colors: Float32Array
) {
  const geo = buildTerrainGeometry(sub, size, heights, colors)
  mesh.updateVerticesData(VertexData.PositionKind, geo.positions)
  mesh.updateVerticesData(VertexData.NormalKind, geo.normals)
  mesh.updateVerticesData(VertexData.ColorKind, geo.colors)
}
