import { Mesh, Scene, VertexData, StandardMaterial, Color3 } from '@babylonjs/core'

export interface TerrainData {
  sub: number
  size: number
  heights: number[]
  colors: number[]
}

export type TerrainTool = 'raise' | 'lower' | 'smooth' | 'flatten' | 'paint' | 'explode' | 'pour' | 'dry'

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

export function createTerrainMesh(scene: Scene, id: string, geo: any): Mesh {
  const mesh = new Mesh(id, scene)
  const vd = new VertexData()
  vd.positions = geo.positions
  vd.normals = geo.normals
  vd.indices = geo.indices
  vd.colors = geo.colors
  vd.applyToMesh(mesh, true)
  const mat = new StandardMaterial('vm_' + id, scene)
  mat.diffuseColor = new Color3(1, 1, 1)
  mat.backFaceCulling = false
  mesh.material = mat
  return mesh
}

// ================= ВОКСЕЛИ (чанки, RLE, AO) =================

export const CHUNK = 32

export interface VoxelTerrainData {
  w: number
  h: number
  d: number
  size: number
  voxels: string
  mats: string
  rle?: boolean
}

export const VOX_PALETTE: number[][] = [
  [0.36, 0.55, 0.3], [0.55, 0.57, 0.6], [0.85, 0.76, 0.54], [0.95, 0.97, 1.0],
  [0.45, 0.33, 0.22], [0.75, 0.35, 0.2], [0.9, 0.6, 0.1], [0.9, 0.85, 0.2],
  [0.3, 0.6, 0.7], [0.2, 0.3, 0.6], [0.6, 0.3, 0.6], [0.9, 0.4, 0.6],
  [0.1, 0.1, 0.1], [0.9, 0.9, 0.9], [0.5, 0.35, 0.15], [0.35, 0.25, 0.5]
]

export function bytesToB64(u8: Uint8Array): string {
  let s = ''
  const CH = 0x8000
  for (let i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode.apply(null, Array.prototype.slice.call(u8.subarray(i, i + CH)))
  }
  return btoa(s)
}

export function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}

export function rleEncode(u8: Uint8Array): string {
  const out: number[] = []
  let i = 0
  while (i < u8.length) {
    const v = u8[i]
    let n = 1
    while (i + n < u8.length && u8[i + n] === v && n < 255) n++
    out.push(v, n)
    i += n
  }
  return bytesToB64(Uint8Array.from(out))
}

export function rleDecode(s: string, len: number): Uint8Array {
  const r = b64ToBytes(s)
  const out = new Uint8Array(len)
  let p = 0
  for (let i = 0; i + 1 < r.length; i += 2) {
    out.fill(r[i], p, p + r[i + 1])
    p += r[i + 1]
  }
  return out
}

export function createVoxelField(w: number, h: number, d: number) {
  return { vox: new Uint8Array(w * h * d), mat: new Uint8Array(w * h * d) }
}

export function matForHeight(y: number, h: number): number {
  if (y < 2) return 2
  if (y > h * 0.72) return 3
  if (y > h * 0.5) return 1
  return 0
}

export function generateVoxelHills(
  vox: Uint8Array, mat: Uint8Array, w: number, h: number, d: number, size: number, amp: number, seed: number
) {
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const wx = (x / w - 0.5) * w * size
      const wz = (z / d - 0.5) * d * size
      const n = fbm(wx * 0.06, wz * 0.06, seed, 4)
      let hgt = Math.floor(h * 0.35 + (n - 0.45) * 2 * amp)
      hgt = Math.max(1, Math.min(h - 1, hgt))
      for (let y = 0; y < hgt; y++) {
        const i = (y * d + z) * w + x
        vox[i] = 1
        mat[i] = y < hgt - 4 ? (y < 2 ? 2 : 4) : matForHeight(hgt, h)
      }
    }
  }
}

export function colHeight(vox: Uint8Array, w: number, h: number, d: number, x: number, z: number): number {
  for (let y = h - 1; y >= 0; y--) {
    if (vox[(y * d + z) * w + x]) return y + 1
  }
  return 0
}

function setColumn(
  vox: Uint8Array, mat: Uint8Array, w: number, h: number, d: number, x: number, z: number, t: number
) {
  for (let y = 0; y < h; y++) {
    const i = (y * d + z) * w + x
    if (y < t) {
      vox[i] = 1
      mat[i] = matForHeight(t, h)
    } else vox[i] = 0
  }
}

function isSurface(vox: Uint8Array, w: number, h: number, d: number, x: number, y: number, z: number): boolean {
  const nb = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
  for (const n of nb) {
    const nx = x + n[0]
    const ny = y + n[1]
    const nz = z + n[2]
    if (nx < 0 || ny < 0 || nz < 0 || nx >= w || ny >= h || nz >= d) return true
    if (!vox[(ny * d + nz) * w + nx]) return true
  }
  return false
}

export function autoBiomes(vox: Uint8Array, mat: Uint8Array, w: number, h: number, d: number) {
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const hgt = colHeight(vox, w, h, d, x, z)
      for (let y = 0; y < hgt; y++) {
        const i = (y * d + z) * w + x
        if (y === hgt - 1) mat[i] = hgt < 3 ? 2 : hgt > h * 0.68 ? 3 : hgt > h * 0.45 ? 1 : 0
        else mat[i] = hgt > h * 0.45 ? 1 : 4
      }
    }
  }
}

export function applyVoxelBrush(
  vox: Uint8Array, mat: Uint8Array, w: number, h: number, d: number, size: number,
  cx: number, cy: number, cz: number, radius: number, tool: TerrainTool, paintId: number
) {
  const r = Math.ceil(radius)
  const bx = Math.floor(cx / size + w / 2)
  const by = Math.floor(cy / size)
  const bz = Math.floor(cz / size + d / 2)

  if (tool === 'smooth' || tool === 'flatten') {
    for (let z = Math.max(0, bz - r); z <= Math.min(d - 1, bz + r); z++) {
      for (let x = Math.max(0, bx - r); x <= Math.min(w - 1, bx + r); x++) {
        const dx = x - bx
        const dz = z - bz
        if (dx * dx + dz * dz > r * r) continue
        const ht = colHeight(vox, w, h, d, x, z)
        let target = ht
        if (tool === 'smooth') {
          const h1 = colHeight(vox, w, h, d, Math.max(0, x - 1), z)
          const h2 = colHeight(vox, w, h, d, Math.min(w - 1, x + 1), z)
          const h3 = colHeight(vox, w, h, d, x, Math.max(0, z - 1))
          const h4 = colHeight(vox, w, h, d, x, Math.min(d - 1, z + 1))
          target = (ht + h1 + h2 + h3 + h4) / 5
        } else {
          target = by + 1
        }
        setColumn(vox, mat, w, h, d, x, z, Math.max(0, Math.min(h, Math.round(target))))
      }
    }
    return
  }

  for (let y = Math.max(0, by - r); y <= Math.min(h - 1, by + r); y++) {
    for (let z = Math.max(0, bz - r); z <= Math.min(d - 1, bz + r); z++) {
      for (let x = Math.max(0, bx - r); x <= Math.min(w - 1, bx + r); x++) {
        const dx = x - bx
        const dy = y - by
        const dz = z - bz
        if (dx * dx + dy * dy + dz * dz > radius * radius) continue
        const i = (y * d + z) * w + x
        if (tool === 'raise') {
          if (!vox[i]) {
            vox[i] = 1
            mat[i] = matForHeight(y, h)
          }
        } else if (tool === 'lower' || tool === 'explode') {
          vox[i] = 0
        } else if (tool === 'paint') {
          if (vox[i] && isSurface(vox, w, h, d, x, y, z)) mat[i] = paintId
        }
      }
    }
  }
}

export function topHeightAt(
  vox: Uint8Array, w: number, h: number, d: number, size: number, x: number, z: number
): number {
  const vx = Math.floor(x / size + w / 2)
  const vz = Math.floor(z / size + d / 2)
  if (vx < 0 || vz < 0 || vx >= w || vz >= d) return 0
  return colHeight(vox, w, h, d, vx, vz) * size
}

export function buildVoxelGeometryRegion(
  vox: Uint8Array, mat: Uint8Array, w: number, h: number, d: number, size: number,
  x0: number, z0: number, x1: number, z1: number
) {
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const solid = (x: number, y: number, z: number) =>
    y < 0 ? true : x >= 0 && y >= 0 && z >= 0 && x < w && y < h && z < d && vox[(y * d + z) * w + x] === 1
  const AO = [0.42, 0.62, 0.82, 1]

  const FACES = [
    { n: [1, 0, 0], shade: 0.8, corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], shade: 0.7, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { n: [0, 1, 0], shade: 1.0, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], shade: 0.5, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], shade: 0.9, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { n: [0, 0, -1], shade: 0.6, corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }
  ]

  for (let y = 0; y < h; y++) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * d + z) * w + x
        if (!vox[i]) continue
        const pal = VOX_PALETTE[mat[i]] || VOX_PALETTE[0]
        for (const f of FACES) {
          const nx = x + f.n[0]
          const ny = y + f.n[1]
          const nz = z + f.n[2]
          if (ny < 0) continue
          if (nx >= 0 && ny >= 0 && nz >= 0 && nx < w && ny < h && nz < d && vox[(ny * d + nz) * w + nx]) continue
          const base = positions.length / 3
          for (const c of f.corners) {
            const sy = c[1] === 1 ? 1 : -1
            const sz = c[2] === 1 ? 1 : -1
            let a1: number, a2: number, a3: number
            if (f.n[0] !== 0) {
              a1 = solid(nx, y + sy, z) ? 1 : 0
              a2 = solid(nx, y, z + sz) ? 1 : 0
              a3 = solid(nx, y + sy, z + sz) ? 1 : 0
            } else if (f.n[1] !== 0) {
              const sx = c[0] === 1 ? 1 : -1
              a1 = solid(x + sx, ny, z) ? 1 : 0
              a2 = solid(x, ny, z + sz) ? 1 : 0
              a3 = solid(x + sx, ny, z + sz) ? 1 : 0
            } else {
              const sx = c[0] === 1 ? 1 : -1
              a1 = solid(x + sx, y, nz) ? 1 : 0
              a2 = solid(x, y + sy, nz) ? 1 : 0
              a3 = solid(x + sx, y + sy, nz) ? 1 : 0
            }
            const ao = a1 && a2 ? 0 : 3 - (a1 + a2 + a3)
            const light = f.shade * AO[ao]
            positions.push((x + c[0] - w / 2) * size, (y + c[1]) * size, (z + c[2] - d / 2) * size)
            normals.push(f.n[0], f.n[1], f.n[2])
            colors.push(pal[0] * light, pal[1] * light, pal[2] * light, 1)
          }
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
        }
      }
    }
  }
  return { positions, normals, colors, indices }
}

export function buildVoxelGeometry(
  vox: Uint8Array, mat: Uint8Array, w: number, h: number, d: number, size: number
) {
  return buildVoxelGeometryRegion(vox, mat, w, h, d, size, 0, 0, w, d)
}

export function createVoxelMesh(scene: Scene, id: string, geo: any): Mesh {
  const mesh = new Mesh(id, scene)
  const vd = new VertexData()
  vd.positions = geo.positions
  vd.normals = geo.normals
  vd.indices = geo.indices
  vd.colors = geo.colors
  vd.applyToMesh(mesh, true)
  const mat = new StandardMaterial('vm_' + id, scene)
  mat.diffuseColor = new Color3(1, 1, 1)
  mat.backFaceCulling = false
  mesh.material = mat
  return mesh
}

export function heightmapToVoxels(td: TerrainData): VoxelTerrainData {
  const w = 64
  const d = 64
  const h = 32
  const size = td.size / w
  const { vox, mat } = createVoxelField(w, h, d)
  const hf = Float32Array.from(td.heights)
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const wx = (x / w - 0.5) * td.size
      const wz = (z / d - 0.5) * td.size
      const hgt = Math.max(1, Math.min(h - 1, Math.round((sampleHeight(hf, td.sub, td.size, wx, wz) + 8) / size)))
      for (let y = 0; y < hgt; y++) {
        const i = (y * d + z) * w + x
        vox[i] = 1
        mat[i] = matForHeight(hgt, h)
      }
    }
  }
  return { w, h, d, size, voxels: rleEncode(vox), mats: rleEncode(mat), rle: true }
}
// END_TERRAIN
