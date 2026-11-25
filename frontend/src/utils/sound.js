/**
 * 轻量氛围音效：纯 Web Audio API 合成，无外部音频文件
 * - setSoundEnabled(true) 开启夜空和弦铺底（默认静音，需用户手势触发）
 * - playChime(kind) 星铃：select（点击星星）| encourage（送出鼓励）| birth（新星诞生）
 */

let ctx = null
let master = null
let bus = null // 星铃总线（带回声）
let ambient = null
let enabled = false

const AMBIENT_VOLUME = 0.05
// Cmaj9 开放排列：C3 G3 B3 D4 E4
const PAD_NOTES = [130.81, 196.0, 246.94, 293.66, 329.63]

function ensureContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()

    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)

    // 简易回声：delay → 低通 → 反馈
    bus = ctx.createGain()
    const delay = ctx.createDelay(1.5)
    delay.delayTime.value = 0.33
    const feedback = ctx.createGain()
    feedback.gain.value = 0.32
    const damp = ctx.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 2600
    const wet = ctx.createGain()
    wet.gain.value = 0.35

    bus.connect(master)
    bus.connect(delay)
    delay.connect(damp)
    damp.connect(feedback)
    feedback.connect(delay)
    damp.connect(wet)
    wet.connect(master)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function startAmbient() {
  if (ambient || !ensureContext()) return
  const now = ctx.currentTime
  const out = ctx.createGain()
  out.gain.setValueAtTime(0, now)
  out.gain.linearRampToValueAtTime(AMBIENT_VOLUME, now + 4)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 750
  filter.Q.value = 0.4
  filter.connect(out)
  out.connect(master)

  const sources = []
  // 滤波器缓慢开合，营造呼吸感
  const filterLfo = ctx.createOscillator()
  const filterLfoGain = ctx.createGain()
  filterLfo.frequency.value = 0.04
  filterLfoGain.gain.value = 280
  filterLfo.connect(filterLfoGain).connect(filter.frequency)
  filterLfo.start()
  sources.push(filterLfo)

  PAD_NOTES.forEach((freq, i) => {
    const noteGain = ctx.createGain()
    noteGain.gain.value = 0.18
    noteGain.connect(filter)

    // 每个音独立的慢速起伏
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.value = 0.05 + i * 0.023
    lfoGain.gain.value = 0.1
    lfo.connect(lfoGain).connect(noteGain.gain)
    lfo.start()
    sources.push(lfo)

    ;[
      ['sine', 0],
      ['triangle', i % 2 ? 5 : -5],
    ].forEach(([type, detune]) => {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = freq
      osc.detune.value = detune
      osc.connect(noteGain)
      osc.start()
      sources.push(osc)
    })
  })

  ambient = { out, sources }
}

function stopAmbient() {
  if (!ambient) return
  const { out, sources } = ambient
  ambient = null
  const now = ctx.currentTime
  out.gain.cancelScheduledValues(now)
  out.gain.setValueAtTime(out.gain.value, now)
  out.gain.linearRampToValueAtTime(0, now + 1.2)
  setTimeout(() => {
    sources.forEach((s) => {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    })
    out.disconnect()
  }, 1400)
}

/** 合成一个星铃音：基频 + 少量泛音，快速起音、指数衰减 */
function bell(freq, delay = 0, volume = 0.08, decay = 1.8) {
  const t = ctx.currentTime + delay
  const partials = [
    [1, 1],
    [2, 0.35],
    [3.01, 0.12],
    [5.4, 0.04],
  ]
  partials.forEach(([ratio, amp], i) => {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq * ratio
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(volume * amp, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay / Math.sqrt(i + 1))
    osc.connect(g).connect(bus)
    osc.start(t)
    osc.stop(t + decay + 0.1)
  })
}

export function isSoundEnabled() {
  return enabled
}

export function setSoundEnabled(on) {
  enabled = on
  if (on) startAmbient()
  else stopAmbient()
}

export function playChime(kind = 'select') {
  if (!enabled || !ensureContext()) return
  switch (kind) {
    case 'encourage':
      bell(987.77, 0, 0.07) // B5
      bell(1318.51, 0.1, 0.06) // E6
      break
    case 'birth':
      ;[783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => bell(f, i * 0.12, 0.065, 2.4)) // G5 B5 D6 G6
      break
    case 'comment':
      bell(1567.98, 0, 0.04, 0.95) // G6 轻柔微光提示音
      break
    case 'select':
    default:
      bell(1318.51, 0, 0.055, 1.3) // E6
  }
}
