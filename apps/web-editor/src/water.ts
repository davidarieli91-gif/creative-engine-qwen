// Воксельная вода: CA с поверхностным натяжением (лужи, а не плёнка) +
// рендер только реальной воды. Следующим шагом — GPU heightfield (shallow water) [15], [16].

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
        // 1) падение вниз (водопады, заполнение ям)
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
        // 2) растекание ТОЛЬКО для объёмной воды (поверхностное натяжение)
        if (a < 3) continue
        const nbs = [i - 1, i + 1, i - w, i + w]
        const valid = [x > 0, x < w - 1, z > 0, z < d - 1]
        for (let n = 0; n < 4; n++) {
          if (!valid[n]) continue
          const ni = nbs[n]
          if (vox[ni]) continue
          const diff = a - wat[ni]
          if (diff >= 3) {
            const t = diff >> 1
            wat[ni] += t
            wat[i] -= t
            moved = true
            a = wat[i]
            if (a < 3) break
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
  const wTop = new Float32Array(w * d)
  const tTop = new Float32Array(w * d)
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const ci = z * w + x
      for (let y = h - 1; y >= 0; y--) {
        const a = wat[(y * d + z) * w + x]
        if (a > 0) { wTop[ci] = (y + a / WATER_MAX) * size; break }
      }
      for (let y = h - 1; y >= 0; y--) {
        if (vox[(y * d + z) * w + x]) { tTop[ci] = (y + 1) * size; break }
      }
    }
  }
  const bl = new Float32Array(w * d)
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const ci = z * w + x
      if (!wTop[ci]) { bl[ci] = 0; continue }
      let s = 0
      let n = 0
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const nz = z + dz
          if (nx < 0 || nz < 0 || nx >= w || nz >= d) continue
          const v = wTop[nz * w + nx]
          if (v > 0) { s += v; n++ }
        }
      }
      bl[ci] = s / n
    }
  }

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const X = (x: number) => (x - w / 2) * size
  const Z = (z: number) => (z - d / 2) * size

  const quad = (pts: number[][], nrm: number[]) => {
    const base = positions.length / 3
    for (const p of pts) {
      positions.push(p[0], p[1], p[2])
      normals.push(nrm[0], nrm[1], nrm[2])
      uvs.push(p[0] / (size * 6), p[2] / (size * 6))
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const ci = z * w + x
      const top = bl[ci] - 0.05 * size
      if (top <= 0) continue
      // плёнку тоньше 0.25 не рендерим — вода видна только как реальная масса
      if (top - tTop[ci] < 0.25 * size) continue
      const x0 = X(x)
      const x1 = X(x + 1)
      const z0 = Z(z)
      const z1 = Z(z + 1)
      quad([[x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1]], [0, 1, 0])

      const nX = [x + 1, x - 1, x, x]
      const nZ = [z, z, z + 1, z - 1]
      for (let k = 0; k < 4; k++) {
        const nx = nX[k]
        const nz = nZ[k]
        const inb = nx >= 0 && nz >= 0 && nx < w && nz < d
        const nw = inb ? bl[nz * w + nx] : 0
        const nt = inb ? tTop[nz * w + nx] : 0
        let bottom = -1
        if (!inb) {
          bottom = Math.max(tTop[ci] - 1, top - 3)
        } else if (nw > 0) {
          if (nw - 0.05 * size < top - 0.05) bottom = nw - 0.05 * size
          else continue
        } else {
          if (nt >= top - 0.05) continue
          bottom = Math.max(nt, top - 3)
        }
        if (bottom < 0) continue
        if (k === 0) quad([[x1, top, z0], [x1, top, z1], [x1, bottom, z1], [x1, bottom, z0]], [1, 0, 0])
        else if (k === 1) quad([[x0, top, z0], [x0, bottom, z0], [x0, bottom, z1], [x0, top, z1]], [-1, 0, 0])
        else if (k === 2) quad([[x0, top, z1], [x1, top, z1], [x1, bottom, z1], [x0, bottom, z1]], [0, 0, 1])
        else quad([[x0, top, z0], [x0, bottom, z0], [x1, bottom, z0], [x1, top, z0]], [0, 0, -1])
      }
    }
  }
  return { positions, normals, uvs, indices }
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
