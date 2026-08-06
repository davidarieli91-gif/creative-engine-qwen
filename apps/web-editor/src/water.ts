// Воксельная вода: гидравлический клеточный автомат того же класса,
// что в John Lin demo, voxel-watersim [4], VoxelWorld [6] и "The Game of Flow" [17].

export const WATER_MAX = 4

export function setWaterSphere(
  wat: Uint8Array, vox: Uint8Array, w: number, h: number, d: number, size: number,
  cx: number, cy: number, cz: number, radius: number, amount: number
) {
  const r = Math.ceil(radius)
  const bx = Math.floor(cx / size + w / 2)
  const by = Math.floor(cy / size)
  const bz = Math.floor(cz / size + d / 2)
  for (let y = Math.max(0, by - r); y <= Math.min(h - 1, by + r); y++) {
    for (let z = Math.max(0, bz - r); z <= Math.min(d - 1, bz + r); z++) {
      for (let x = Math.max(0, bx - r); x <= Math.min(w - 1, bx + r); x++) {
        const dx = x - bx
        const dy = y - by
        const dz = z - bz
        if (dx * dx + dy * dy + dz * dz > radius * radius) continue
        const i = (y * d + z) * w + x
        if (vox[i]) continue
        wat[i] = amount === 0 ? 0 : Math.max(wat[i], amount)
      }
    }
  }
}

export function stepWater(vox: Uint8Array, wat: Uint8Array, w: number, h: number, d: number): boolean {
  let moved = false
  const DW = d * w
  for (let y = 0; y < h; y++) {
    for (let z = 0; z < d; z++) {
      const ltr = (y + z) % 2 === 0
      for (let k = 0; k < w; k++) {
        const x = ltr ? k : w - 1 - k
        const i = (y * d + z) * w + x
        let a = wat[i]
        if (!a) continue
        if (y > 0) {
          const bi = i - DW
          if (!vox[bi] && wat[bi] < WATER_MAX) {
            const t = Math.min(a, WATER_MAX - wat[bi])
            wat[bi] += t
            wat[i] -= t
            moved = true
            a = wat[i]
            if (!a) continue
          }
        }
        const belowBlocked = y === 0 || vox[i - DW] || wat[i - DW] >= WATER_MAX
        if (!belowBlocked) continue
        const nbs = [i - 1, i + 1, i - w, i + w]
        const valid = [x > 0, x < w - 1, z > 0, z < d - 1]
        for (let n = 0; n < 4; n++) {
          if (!valid[n]) continue
          const ni = nbs[n]
          if (vox[ni]) continue
          if (a - wat[ni] >= 2) {
            wat[ni] += 1
            wat[i] -= 1
            moved = true
            a = wat[i]
            if (a <= 1) break
          }
        }
      }
    }
  }
  return moved
}

export function buildWaterGeometry(
  vox: Uint8Array, wat: Uint8Array, w: number, h: number, d: number, size: number
) {
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const FACES = [
    { n: [1, 0, 0], shade: 0.8, corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], shade: 0.7, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { n: [0, 1, 0], shade: 1.0, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], shade: 0.5, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], shade: 0.9, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { n: [0, 0, -1], shade: 0.6, corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }
  ]
  for (let y = 0; y < h; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const i = (y * d + z) * w + x
        if (!wat[i]) continue
        const fill = wat[i] / WATER_MAX
        for (const f of FACES) {
          const nx = x + f.n[0]
          const ny = y + f.n[1]
          const nz = z + f.n[2]
          if (ny < 0) continue
          const inside = nx >= 0 && ny >= 0 && nz >= 0 && nx < w && ny < h && nz < d
          if (inside && (wat[(ny * d + nz) * w + nx] > 0 || vox[(ny * d + nz) * w + nx] === 1)) continue
          const base = positions.length / 3
          for (const c of f.corners) {
            const topY = f.n[1] === 1 ? y + fill : c[1]
            positions.push((x + c[0] - w / 2) * size, topY * size, (z + c[2] - d / 2) * size)
            normals.push(f.n[0], f.n[1], f.n[2])
            colors.push(0.1 * f.shade, 0.35 * f.shade, 0.85 * f.shade, 1)
          }
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
        }
      }
    }
  }
  return { positions, normals, colors, indices }
}

export function topWaterAt(
  wat: Uint8Array, w: number, h: number, d: number, size: number, x: number, z: number
): number {
  const vx = Math.floor(x / size + w / 2)
  const vz = Math.floor(z / size + d / 2)
  if (vx < 0 || vz < 0 || vx >= w || vz >= d) return 0
  for (let y = h - 1; y >= 0; y--) {
    const a = wat[(y * d + vz) * w + vx]
    if (a > 0) return (y + a / WATER_MAX) * size
  }
  return 0
}
// END_WATER
