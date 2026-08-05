let ctx: AudioContext | null = null
function ac(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}
function tone(freq: number, dur: number, type: OscillatorType, vol = 0.2, slideTo?: number, delay = 0) {
  const c = ac()
  const t0 = c.currentTime + delay
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  o.connect(g)
  g.connect(c.destination)
  o.start(t0)
  o.stop(t0 + dur + 0.02)
}
function noise(dur: number, vol = 0.3, delay = 0) {
  const c = ac()
  const t0 = c.currentTime + delay
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  src.buffer = buf
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 900
  src.connect(f)
  f.connect(g)
  g.connect(c.destination)
  src.start(t0)
}
export function playSound(name: string) {
  try {
    if (name === 'coin') { tone(880, 0.09, 'square', 0.15); tone(1320, 0.18, 'square', 0.15, undefined, 0.08) }
    else if (name === 'jump') tone(280, 0.25, 'square', 0.2, 620)
    else if (name === 'click') tone(600, 0.06, 'triangle', 0.2)
    else if (name === 'boom') { noise(0.6, 0.4); tone(120, 0.5, 'sawtooth', 0.25, 40) }
    else if (name === 'win') { tone(523, 0.12, 'square', 0.18); tone(659, 0.12, 'square', 0.18, undefined, 0.12); tone(784, 0.12, 'square', 0.18, undefined, 0.24); tone(1046, 0.4, 'square', 0.18, undefined, 0.36) }
    else if (name === 'lose') { tone(392, 0.2, 'sawtooth', 0.2); tone(311, 0.2, 'sawtooth', 0.2, undefined, 0.2); tone(233, 0.5, 'sawtooth', 0.2, undefined, 0.4) }
  } catch { /* ignore */ }
}
