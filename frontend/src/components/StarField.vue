<script setup>
/**
 * 电影级 3D「旋涡星云星系 ⇄ 极简香槟金《STAR MAP》」双态可逆引擎
 * - mapMorph ∈ [0, 1]（总时长 ~1.6s，正反向平滑可逆）：
 *   * 阶段 A (0.00 → 0.28)：3D 轨道淡出、公转平滑静止、同星座在星系内亮起香槟金连线 (#ebd7a7)
 *   * 阶段 B (0.28 → 0.85)：GLSL 旋涡星云与高密旋臂星尘淡隐至深靛蓝净空；相机移至星图正面视角；
 *                           各星座连同连线丝滑抽离展开为经典不交叉天文轮廓星图阵列
 *   * 阶段 C (0.72 → 1.00)：各星座下方淡入极简香槟金铭牌标签 + 底部 WEIGUANG STAR MAP 细字
 * - 完整保留原有全部 props / emits('select','blank') / expose(focusStar, focusConstellation, resetView)
 *   并新增 emit('select-constellation', constellationId)
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { EMOTION_META } from '@/utils/format'

const props = defineProps({
  stars: { type: Array, default: () => [] },
  selectedId: { type: Number, default: null },
  constellations: { type: Array, default: () => [] },
  showConstellations: { type: Boolean, default: false },
  activeConstellationId: { type: Number, default: null },
})
const emit = defineEmits(['select', 'blank', 'select-constellation'])

const container = ref(null)
const tip = ref(null)
const mapLabels = ref([]) // [{ id, name, count, x, y, active }]
const labelOpacity = ref(0)

const IS_MOBILE =
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768)
const USE_BLOOM = !IS_MOBILE && (typeof window === 'undefined' || (window.devicePixelRatio || 1) >= 1)

const GALAXY_BG = new THREE.Color(0x02030a)
const STARMAP_BG = new THREE.Color(0x050a18)
const CHAMPAGNE_GOLD = new THREE.Color('#ebd7a7')
const CHAMPAGNE_BRIGHT = new THREE.Color('#fff1cc')
const FOG_DENSITY = 0.00125
const GALAXY_TILT_X = 0.44
const GALAXY_TILT_Z = -0.1
const GALAXY_SPIN_SPEED = 0.0085
const MORPH_DURATION_SEC = 1.6

const HOME_POS = new THREE.Vector3(0, 62, 134)
const INTRO_POS = new THREE.Vector3(0, 170, 224)
const MAP_CAM_POS = new THREE.Vector3(0, 0, IS_MOBILE ? 245 : 192)
const FOCUS_OFFSET = 32
const FRESH_MS = 60_000

let renderer, composer, bloomPass, scene, camera, controls, raycaster, resizeObserver
let galaxyTilt, galaxyGroup, nebulaGroup, stardustPoints, stardustMat, quietStarsPoints
let orbitGroup, bgOrbitsMesh, bgOrbitsMaterial
let constellationGroup, pulseGroup, starGroup, fxGroup, meteorGroup, reticle
let frameId = 0
let lastTime = 0
let hovered = null
let reticleOpacity = 0
let orbitTimeScale = 1
let mapMorph = 0 // 0 = 星系模式，1 = 星图模式
let resumeTimer = null
let meteorTimer = null
let morphCamTimer = null
let initialized = false
let cameraTween = null
let isIntroTween = false

const pointer = new THREE.Vector2(-10, -10)
const lastClient = { x: 0, y: 0 }
const down = { x: 0, y: 0, t: 0 }
const sprites = new Map() // starId -> Sprite（位于世界坐标系 starGroup 中）
const starOrbits = new Map() // starId -> { mesh, material }（位于 galaxyGroup 中）
const nebulaMaterials = []
const constellationEntries = new Map() // cid -> { line, orderedIds, segments, totalLen, mapCenter, labelAnchor, name, count }
const constellationPulses = []
const meteors = []
const textures = new Map()
const tweens = []
const tmpV = new THREE.Vector3()
const tmpV2 = new THREE.Vector3()
const tmpLocal = new THREE.Vector3()
const tmpGalaxyWorld = new THREE.Vector3()
const tmpBgColor = new THREE.Color()

// ---------------- 经典天文星图不交叉折线模板（归一化 [-1, 1]） ----------------
const CONSTELLATION_TEMPLATES = [
  // 0: 仙后 W 形 (Cassiopeia)
  [
    [-0.95, 0.35],
    [-0.45, -0.35],
    [0.02, 0.22],
    [0.48, -0.4],
    [0.95, 0.3],
    [0.62, 0.68],
    [-0.65, 0.65],
  ],
  // 1: 北斗勺形 (Big Dipper)
  [
    [-0.98, 0.38],
    [-0.5, 0.25],
    [-0.08, 0.14],
    [0.24, -0.04],
    [0.82, -0.06],
    [0.74, -0.56],
    [0.2, -0.52],
  ],
  // 2: 天鹅展翼形 (Cygnus)
  [
    [0.0, 0.85],
    [0.0, 0.12],
    [-0.86, 0.26],
    [0.86, -0.08],
    [0.0, -0.78],
    [-0.45, -0.45],
    [0.52, 0.52],
  ],
  // 3: 天琴菱形 (Lyra)
  [
    [-0.78, 0.62],
    [-0.2, 0.24],
    [0.45, 0.42],
    [0.72, -0.25],
    [0.08, -0.55],
    [-0.36, -0.28],
    [0.88, 0.65],
  ],
  // 4: 天蝎弧形 (Scorpius)
  [
    [-0.82, 0.68],
    [-0.42, 0.32],
    [-0.12, -0.08],
    [0.16, -0.48],
    [0.62, -0.52],
    [0.92, -0.18],
    [0.76, 0.22],
  ],
  // 5: 猎户星带形 (Orion)
  [
    [-0.62, 0.78],
    [0.54, 0.68],
    [0.22, 0.08],
    [-0.02, 0.0],
    [-0.26, -0.08],
    [-0.56, -0.74],
    [0.62, -0.68],
  ],
]

// ---------------- easing & helpers ----------------
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2
const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2)
const smoothstep = (edge0, edge1, x) => {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function addTween(duration, onUpdate, onDone) {
  const tw = { start: performance.now(), duration, onUpdate, onDone, cancelled: false }
  tweens.push(tw)
  return tw
}

function runTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]
    if (tw.cancelled) {
      tweens.splice(i, 1)
      continue
    }
    const p = Math.min(1, (now - tw.start) / tw.duration)
    tw.onUpdate(p)
    if (p >= 1) {
      tweens.splice(i, 1)
      tw.onDone?.()
    }
  }
}

function hash01(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123
  return x - Math.floor(x)
}

// ---------------- 确定性 3D 倾斜椭圆轨道参数 ----------------
function buildOrbitMatrix(ascNode, inclination, argPeri) {
  const m = new THREE.Matrix4()
  const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ascNode)
  const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), inclination)
  const q3 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), argPeri)
  q1.multiply(q2).multiply(q3)
  m.makeRotationFromQuaternion(q1)
  return m
}

function computeOrbitParams(star) {
  const seed = (star.id || 1) * 1.73 + (star.posX || 0) * 0.13 + (star.posY || 0) * 0.17 + (star.posZ || 0) * 0.23
  const u1 = hash01(seed)
  const u2 = hash01(seed + 13.7)
  const u3 = hash01(seed + 29.3)
  const u4 = hash01(seed + 47.9)
  const u5 = hash01(seed + 71.1)
  const u6 = hash01(seed + 97.3)

  const a = 48 + Math.pow(u1, 0.92) * 107
  const e = 0.05 + u2 * 0.19
  const b = a * Math.sqrt(1 - e * e)

  const isHighTilt = Math.abs(star.id || 0) % 4 === 0
  const tiltDeg = isHighTilt ? 25 + u3 * 20 : 6 + u3 * 12
  const inclination = THREE.MathUtils.degToRad(tiltDeg * (u4 > 0.5 ? 1 : -1))

  const ascNode = u5 * Math.PI * 2
  const argPeri = u6 * Math.PI * 2
  const phase0 = hash01(seed + 131.5) * Math.PI * 2
  const angularSpeed = 0.058 * Math.pow(82 / a, 0.78)
  const tailFrac = 0.36 + hash01(seed + 163.9) * 0.14

  return { a, b, e, inclination, ascNode, argPeri, phase0, angularSpeed, tailFrac, matrix: buildOrbitMatrix(ascNode, inclination, argPeri) }
}

function evalOrbitPoint(orbit, theta, out) {
  out.set(Math.cos(theta) * orbit.a - orbit.a * orbit.e, 0, Math.sin(theta) * orbit.b)
  return out.applyMatrix4(orbit.matrix)
}

function evalOrbitTangent(orbit, theta, out) {
  out.set(-Math.sin(theta) * orbit.a, 0, Math.cos(theta) * orbit.b).normalize()
  return out.transformDirection(orbit.matrix)
}

// ---------------- 程序化 Canvas 纹理 ----------------
function canvasTexture(key, draw, size = 128) {
  if (textures.has(key)) return textures.get(key)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  draw(canvas.getContext('2d'), size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  textures.set(key, tex)
  return tex
}

const rgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

function radial(ctx, s, stops, inner = 0) {
  const g = ctx.createRadialGradient(s / 2, s / 2, inner, s / 2, s / 2, s / 2)
  stops.forEach(([o, c]) => g.addColorStop(o, c))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
}

const starburstTexture = (hex) =>
  canvasTexture(
    `starburst:${hex}`,
    (ctx, s) => {
      const c = rgb(hex)
      const h = s / 2
      radial(ctx, s, [
        [0, 'rgba(255,255,255,1)'],
        [0.075, 'rgba(255,255,255,0.98)'],
        [0.16, `rgba(${c},0.92)`],
        [0.34, `rgba(${c},0.28)`],
        [0.64, `rgba(${c},0.05)`],
        [1, `rgba(${c},0)`],
      ])
      const drawRay = (angle, len, width, alpha) => {
        ctx.save()
        ctx.translate(h, h)
        ctx.rotate(angle)
        const grad = ctx.createLinearGradient(-len, 0, len, 0)
        grad.addColorStop(0, `rgba(${c},0)`)
        grad.addColorStop(0.3, `rgba(${c},${alpha * 0.42})`)
        grad.addColorStop(0.5, `rgba(255,255,255,${alpha})`)
        grad.addColorStop(0.7, `rgba(${c},${alpha * 0.42})`)
        grad.addColorStop(1, `rgba(${c},0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.moveTo(-len, 0)
        ctx.quadraticCurveTo(0, -width, len, 0)
        ctx.quadraticCurveTo(0, width, -len, 0)
        ctx.fill()
        ctx.restore()
      }
      drawRay(0, h * 0.96, s * 0.015, 0.98)
      drawRay(Math.PI / 2, h * 0.96, s * 0.015, 0.98)
      drawRay(Math.PI / 4, h * 0.4, s * 0.008, 0.34)
      drawRay(-Math.PI / 4, h * 0.4, s * 0.008, 0.34)
    },
    256,
  )

const reticleTexture = () =>
  canvasTexture(
    'reticle',
    (ctx, s) => {
      const h = s / 2
      const r = s * 0.38
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 2.2
      for (let i = 0; i < 4; i++) {
        const a0 = i * (Math.PI / 2) + 0.18
        const a1 = (i + 1) * (Math.PI / 2) - 0.18
        ctx.beginPath()
        ctx.arc(h, h, r, a0, a1)
        ctx.stroke()
      }
      ctx.lineWidth = 1.6
      for (let i = 0; i < 4; i++) {
        const a = i * (Math.PI / 2)
        ctx.beginPath()
        ctx.moveTo(h + Math.cos(a) * (r - 8), h + Math.sin(a) * (r - 8))
        ctx.lineTo(h + Math.cos(a) * (r + 10), h + Math.sin(a) * (r + 10))
        ctx.stroke()
      }
    },
    256,
  )

const diamondDustTexture = () =>
  canvasTexture(
    'diamond-dust',
    (ctx, s) =>
      radial(ctx, s, [
        [0, 'rgba(255,255,255,1)'],
        [0.18, 'rgba(255,255,255,0.72)'],
        [0.48, 'rgba(255,255,255,0.14)'],
        [1, 'rgba(255,255,255,0)'],
      ]),
    32,
  )

const pulseTexture = () =>
  canvasTexture(
    'pulse-dot',
    (ctx, s) =>
      radial(ctx, s, [
        [0, 'rgba(255,252,240,1)'],
        [0.24, 'rgba(235,215,167,0.9)'],
        [0.6, 'rgba(235,215,167,0.22)'],
        [1, 'rgba(235,215,167,0)'],
      ]),
    64,
  )

const ringTexture = () =>
  canvasTexture(
    'ring',
    (ctx, s) =>
      radial(
        ctx,
        s,
        [
          [0, 'rgba(255,255,255,0)'],
          [0.46, 'rgba(255,255,255,0.92)'],
          [0.66, 'rgba(255,255,255,0.28)'],
          [1, 'rgba(255,255,255,0)'],
        ],
        s * 0.28,
      ),
    256,
  )

const glowMaterial = (map, extra = {}) =>
  new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    ...extra,
  })

// ---------------- 1. GLSL 旋涡星云盘 + 钻石星尘 + 静谧星图底星 ----------------
const NEBULA_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const NEBULA_FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uPhase;
  uniform float uLayerGain;
  uniform float uFade;

  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.52;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += amp * noise(p);
      p = rot * p * 2.04 + vec2(17.1, 31.7);
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    if (uFade < 0.004) discard;
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;

    float theta = atan(p.y, p.x);
    float logR = log(max(r, 0.018));
    float twist = logR * 3.85 - uPhase - uTime * 0.015;
    float arm2 = 0.5 + 0.5 * cos(theta * 2.0 - twist);
    float arm3 = 0.5 + 0.5 * cos(theta * 3.0 - twist * 1.18 + 1.1);
    float spiralProfile = pow(arm2, 1.65) * 0.78 + pow(arm3, 2.2) * 0.28;

    float warpAngle = theta - logR * 2.6 + uPhase;
    vec2 swirlUv = vec2(cos(warpAngle), sin(warpAngle)) * (r * 3.6);
    float cloud = fbm(swirlUv + vec2(r * 2.2, -r * 1.4));
    float detail = fbm(swirlUv * 2.1 + vec2(5.2, 8.7));

    float dustWave = 0.5 + 0.5 * cos(theta * 2.0 - twist + 0.85);
    float dustNoise = fbm(swirlUv * 2.6 + vec2(-3.1, 4.4));
    // 强化旋臂间暗色尘埃缝隙遮蔽深度，营造深邃丝绒反差
    float dustLane = 1.0 - smoothstep(0.32, 0.74, dustWave * dustNoise * 1.48) * smoothstep(0.06, 0.24, r) * 0.86;

    // 强化外缘衰减指数，确保星系外围干净沉入纯黑深空 #02030a
    float radialFade = pow(smoothstep(1.0, 0.46, r), 1.45) * smoothstep(0.0, 0.035, r);
    float diskBody = (0.08 + spiralProfile * 0.92) * (0.42 + 0.85 * cloud) * (0.7 + 0.42 * detail) * dustLane * radialFade;

    vec3 cCore = vec3(1.0, 0.95, 0.88);
    vec3 cPink = vec3(1.0, 0.34, 0.66);
    vec3 cViolet = vec3(0.54, 0.17, 1.0);
    vec3 cCobalt = vec3(0.11, 0.36, 1.0);
    vec3 cDeepBlue = vec3(0.06, 0.18, 0.64);

    vec3 col = mix(cCore, cPink, smoothstep(0.03, 0.18, r));
    col = mix(col, cViolet, smoothstep(0.18, 0.44, r));
    col = mix(col, cCobalt, smoothstep(0.40, 0.68, r));
    col = mix(col, cDeepBlue, smoothstep(0.68, 0.94, r));

    // 极核心一小团柔和亮核，不泛白扩散
    float coreGlow = exp(-r * r * 240.0) * 0.78 + exp(-r * r * 68.0) * 0.10;
    float outerBoost = 1.0 + smoothstep(0.35, 0.76, r) * 0.46;
    vec3 finalCol = col * diskBody * outerBoost * 0.96 + cCore * coreGlow * (0.8 + 0.2 * cloud);

    float gain = uLayerGain * uFade;
    float alpha = clamp((diskBody * outerBoost * 0.85 + coreGlow * 0.72) * gain, 0.0, 0.84);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(finalCol * gain, alpha);
  }
`

function createNebulaDisk() {
  const layers = [
    { size: 540, y: -2.0, phase: 0.0, gain: 0.36 },
    { size: 510, y: 2.4, phase: 0.42, gain: 0.17 },
  ]
  for (const cfg of layers) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERT,
      fragmentShader: NEBULA_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPhase: { value: cfg.phase },
        uLayerGain: { value: cfg.gain },
        uFade: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    nebulaMaterials.push(mat)
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(cfg.size, cfg.size), mat)
    plane.rotation.x = -Math.PI / 2
    plane.position.y = cfg.y
    nebulaGroup.add(plane)
  }
}

function createSpiralStardust() {
  const count = IS_MOBILE ? 1800 : 5000
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)

  const cCore = new THREE.Color('#fff7eb')
  const cPink = new THREE.Color('#ffb3d1')
  const cViolet = new THREE.Color('#b692ff')
  const cBlue = new THREE.Color('#6ca2ff')
  const cFar = new THREE.Color('#dbe8ff')
  const c = new THREE.Color()

  for (let i = 0; i < count; i++) {
    let x, y, z, normR
    const p = Math.random()
    if (p < 0.72) {
      const arm = i % 2
      const r = Math.pow(Math.random(), 1.35) * 245
      normR = r / 245
      const logR = Math.log(Math.max(normR, 0.018))
      const angle = arm * Math.PI + logR * 1.92 + (Math.random() - 0.5) * (0.48 + normR * 0.62)
      x = Math.cos(angle) * r
      z = Math.sin(angle) * r
      y = (Math.random() - 0.5) * ((1 - normR * 0.65) * 16 + 3)
    } else if (p < 0.84) {
      const r = Math.pow(Math.random(), 2.2) * 58
      normR = r / 245
      tmpV.randomDirection().multiplyScalar(r)
      x = tmpV.x
      y = tmpV.y * 0.45
      z = tmpV.z
    } else {
      const r = 265 + Math.random() * 260
      normR = 1.2
      tmpV.randomDirection().multiplyScalar(r)
      x = tmpV.x
      y = tmpV.y
      z = tmpV.z
    }

    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    if (normR > 1.0) {
      c.copy(cFar).multiplyScalar(0.32 + Math.random() * 0.5)
    } else {
      if (normR < 0.2) c.copy(cCore).lerp(cPink, normR / 0.2)
      else if (normR < 0.52) c.copy(cPink).lerp(cViolet, (normR - 0.2) / 0.32)
      else c.copy(cViolet).lerp(cBlue, (normR - 0.52) / 0.48)
      c.lerp(cCore, Math.random() * 0.35)
      c.multiplyScalar(0.38 + Math.random() * 0.62)
    }

    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  stardustMat = new THREE.PointsMaterial({
    size: IS_MOBILE ? 1.75 : 1.48,
    map: diamondDustTexture(),
    vertexColors: true,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  stardustPoints = new THREE.Points(geo, stardustMat)
  galaxyGroup.add(stardustPoints)
}

/** 极简星图底色中保留的稀疏微弱静谧小星点 */
function createQuietBackgroundStars() {
  const count = IS_MOBILE ? 140 : 280
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const c1 = new THREE.Color('#dbe8ff')
  const c2 = new THREE.Color('#ebd7a7')
  const c = new THREE.Color()

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 420
    positions[i * 3 + 1] = (Math.random() - 0.5) * 320
    positions[i * 3 + 2] = -30 - Math.random() * 140
    c.copy(Math.random() > 0.7 ? c2 : c1).multiplyScalar(0.18 + Math.random() * 0.35)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  quietStarsPoints = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 1.5,
      map: diamondDustTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  scene.add(quietStarsPoints)
}

// ---------------- 2. 3D 倾斜立体公转轨道 + 高亮长尾迹 + 陪衬背景细轨道 ----------------
const ORBIT_VERT = /* glsl */ `
  attribute vec3 aTangent;
  attribute float aSide;
  attribute float aAngle;

  uniform float uHalfWidth;
  uniform float uHeadAngle;
  uniform float uTailFrac;

  varying float vSide;
  varying float vAngle;
  varying float vFogDepth;

  const float TWO_PI = 6.28318530718;

  void main() {
    vSide = aSide;
    vAngle = aAngle;

    float behind = mod(uHeadAngle - aAngle + TWO_PI * 4.0, TWO_PI) / TWO_PI;
    float inTail = 1.0 - smoothstep(0.0, uTailFrac, behind);
    float widthScale = mix(0.46, 1.38, pow(inTail, 1.2));

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vec3 viewTangent = normalize((modelViewMatrix * vec4(aTangent, 0.0)).xyz);
    vec3 viewDir = normalize(-mvPos.xyz);
    vec3 sideDir = cross(viewDir, viewTangent);
    float sLen = length(sideDir);
    sideDir = sLen > 0.001 ? sideDir / sLen : vec3(0.0, 1.0, 0.0);

    mvPos.xyz += sideDir * (aSide * uHalfWidth * widthScale);
    vFogDepth = -mvPos.z;
    gl_Position = projectionMatrix * mvPos;
  }
`

const ORBIT_FRAG = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;
  uniform float uHeadAngle;
  uniform float uTailFrac;
  uniform float uOpacity;
  uniform float uFogDensity;

  varying float vSide;
  varying float vAngle;
  varying float vFogDepth;

  const float TWO_PI = 6.28318530718;

  void main() {
    float behind = mod(uHeadAngle - vAngle + TWO_PI * 4.0, TWO_PI) / TWO_PI;
    float trail = clamp(1.0 - behind / uTailFrac, 0.0, 1.0);
    float trailGlow = pow(trail, 1.65);

    float core = exp(-vSide * vSide * 5.8);
    float razor = exp(-vSide * vSide * 18.0);
    // 柔和克制的闭环基底细轨 + 降低约 40% 的高亮尾弧，自然融入深邃星系
    float baseTrack = 0.135 * core;
    float headHot = pow(trail, 5.0) * 0.38;
    float intensity = (baseTrack + trailGlow * (0.56 * core + 0.30 * razor)) * uOpacity;

    float fogFactor = exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    vec3 col = mix(uColor, vec3(1.0), clamp(headHot + razor * trailGlow * 0.32, 0.0, 0.72));

    float alpha = intensity * fogFactor;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * alpha, alpha);
  }
`

function createStarOrbitMesh(star, orbit) {
  const segs = IS_MOBILE ? 84 : 128
  const vCount = (segs + 1) * 2
  const positions = new Float32Array(vCount * 3)
  const tangents = new Float32Array(vCount * 3)
  const sides = new Float32Array(vCount)
  const angles = new Float32Array(vCount)
  const indices = []

  const p = new THREE.Vector3()
  const tg = new THREE.Vector3()

  for (let i = 0; i <= segs; i++) {
    const theta = (i / segs) * Math.PI * 2
    evalOrbitPoint(orbit, theta, p)
    evalOrbitTangent(orbit, theta, tg)
    for (let s = 0; s < 2; s++) {
      const idx = i * 2 + s
      positions[idx * 3] = p.x
      positions[idx * 3 + 1] = p.y
      positions[idx * 3 + 2] = p.z
      tangents[idx * 3] = tg.x
      tangents[idx * 3 + 1] = tg.y
      tangents[idx * 3 + 2] = tg.z
      sides[idx] = s === 0 ? -1 : 1
      angles[idx] = theta
    }
    if (i < segs) {
      const a0 = i * 2
      indices.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aTangent', new THREE.BufferAttribute(tangents, 3))
  geometry.setAttribute('aSide', new THREE.BufferAttribute(sides, 1))
  geometry.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1))
  geometry.setIndex(indices)

  const material = new THREE.ShaderMaterial({
    vertexShader: ORBIT_VERT,
    fragmentShader: ORBIT_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(star.colorHex || '#ffffff') },
      uHalfWidth: { value: 0.78 },
      uHeadAngle: { value: orbit.phase0 },
      uTailFrac: { value: orbit.tailFrac },
      uOpacity: { value: 0.95 },
      uFogDensity: { value: FOG_DENSITY },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  orbitGroup.add(mesh)
  const entry = { mesh, material }
  starOrbits.set(star.id, entry)
  return entry
}

const BG_ORBIT_VERT = /* glsl */ `
  attribute vec3 aTangent;
  attribute float aSide;
  attribute vec3 aColor;
  uniform float uHalfWidth;
  varying float vSide;
  varying vec3 vColor;
  varying float vFogDepth;
  void main() {
    vSide = aSide;
    vColor = aColor;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vec3 viewTangent = normalize((modelViewMatrix * vec4(aTangent, 0.0)).xyz);
    vec3 viewDir = normalize(-mvPos.xyz);
    vec3 sideDir = cross(viewDir, viewTangent);
    float sLen = length(sideDir);
    sideDir = sLen > 0.001 ? sideDir / sLen : vec3(0.0, 1.0, 0.0);
    mvPos.xyz += sideDir * (aSide * uHalfWidth);
    vFogDepth = -mvPos.z;
    gl_Position = projectionMatrix * mvPos;
  }
`

const BG_ORBIT_FRAG = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  uniform float uFogDensity;
  varying float vSide;
  varying vec3 vColor;
  varying float vFogDepth;
  void main() {
    float core = exp(-vSide * vSide * 7.5);
    float fogFactor = exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    float alpha = core * uOpacity * fogFactor;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(vColor * alpha, alpha);
  }
`

function createBackgroundOrbitRings() {
  const ringCount = IS_MOBILE ? 10 : 28
  const segs = IS_MOBILE ? 56 : 76
  const vertsPerRing = (segs + 1) * 2
  const totalVerts = ringCount * vertsPerRing

  const positions = new Float32Array(totalVerts * 3)
  const tangents = new Float32Array(totalVerts * 3)
  const sides = new Float32Array(totalVerts)
  const colors = new Float32Array(totalVerts * 3)
  const indices = []

  const palette = [new THREE.Color('#8eb4ff'), new THREE.Color('#c2a8ff'), new THREE.Color('#d8c6ff')]
  const p = new THREE.Vector3()
  const tg = new THREE.Vector3()

  for (let rIdx = 0; rIdx < ringCount; rIdx++) {
    const u1 = hash01(rIdx * 7.31 + 1.2)
    const u2 = hash01(rIdx * 11.17 + 3.4)
    const u3 = hash01(rIdx * 17.53 + 5.6)
    const u4 = hash01(rIdx * 23.19 + 7.8)

    const a = 42 + (rIdx / ringCount) * 158 + (u1 - 0.5) * 10
    const e = 0.04 + u2 * 0.16
    const b = a * Math.sqrt(1 - e * e)
    const inc = THREE.MathUtils.degToRad((u3 - 0.5) * 44)
    const orbit = { a, b, e, matrix: buildOrbitMatrix(u4 * Math.PI * 2, inc, u1 * Math.PI * 2) }
    const col = palette[rIdx % palette.length]
    const baseVert = rIdx * vertsPerRing

    for (let i = 0; i <= segs; i++) {
      const theta = (i / segs) * Math.PI * 2
      evalOrbitPoint(orbit, theta, p)
      evalOrbitTangent(orbit, theta, tg)
      for (let s = 0; s < 2; s++) {
        const idx = baseVert + i * 2 + s
        positions[idx * 3] = p.x
        positions[idx * 3 + 1] = p.y
        positions[idx * 3 + 2] = p.z
        tangents[idx * 3] = tg.x
        tangents[idx * 3 + 1] = tg.y
        tangents[idx * 3 + 2] = tg.z
        sides[idx] = s === 0 ? -1 : 1
        colors[idx * 3] = col.r
        colors[idx * 3 + 1] = col.g
        colors[idx * 3 + 2] = col.b
      }
      if (i < segs) {
        const a0 = baseVert + i * 2
        indices.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3)
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aTangent', new THREE.BufferAttribute(tangents, 3))
  geometry.setAttribute('aSide', new THREE.BufferAttribute(sides, 1))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(indices)

  bgOrbitsMaterial = new THREE.ShaderMaterial({
    vertexShader: BG_ORBIT_VERT,
    fragmentShader: BG_ORBIT_FRAG,
    uniforms: {
      uHalfWidth: { value: 0.28 },
      uOpacity: { value: 0.075 },
      uFogDensity: { value: FOG_DENSITY },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })

  bgOrbitsMesh = new THREE.Mesh(geometry, bgOrbitsMaterial)
  bgOrbitsMesh.frustumCulled = false
  galaxyGroup.add(bgOrbitsMesh)
}

// ---------------- 3. 《STAR MAP》美学拓扑排版（防拥挤、不交叉经典星座模板） ----------------
function computeStarMapLayout() {
  const constList = props.constellations.filter((c) => c.stars && c.stars.length >= 2)
  const count = constList.length
  const clusteredIds = new Set()

  // 为每个星座分配互不重叠的错落蜂窝区块
  const cols = IS_MOBILE ? 2 : count <= 4 ? 2 : 3
  const cellW = IS_MOBILE ? 64 : 74
  const cellH = IS_MOBILE ? 58 : 54
  const rows = Math.max(1, Math.ceil(count / cols))

  constList.forEach((c, cIdx) => {
    const row = Math.floor(cIdx / cols)
    const itemsInRow = row === rows - 1 ? count - row * cols : cols
    const colInRow = cIdx - row * cols
    const cx = (colInRow - (itemsInRow - 1) / 2) * cellW + (row % 2 ? 4 : -4)
    const cy = ((rows - 1) / 2 - row) * cellH + (colInRow % 2 === 1 ? 5 : -3)
    const blockR = IS_MOBILE ? 18 : 23

    const tpl = CONSTELLATION_TEMPLATES[cIdx % CONSTELLATION_TEMPLATES.length]
    const orderedIds = c.stars.map((s) => s.id)
    let minY = Infinity

    orderedIds.forEach((starId, sIdx) => {
      clusteredIds.add(starId)
      const sp = sprites.get(starId)
      if (!sp) return

      let lx, ly
      if (sIdx < tpl.length) {
        lx = tpl[sIdx][0] * blockR
        ly = tpl[sIdx][1] * blockR * 0.82
      } else {
        // 超过模板星数时沿优雅外弧延伸不交叉
        const extra = sIdx - tpl.length + 1
        const ang = -0.3 + extra * 0.55
        lx = Math.cos(ang) * blockR * 1.05
        ly = Math.sin(ang) * blockR * 0.78
      }
      const lz = (hash01(starId * 9.7) - 0.5) * 4.5 // 极轻微景深
      sp.userData.mapPos.set(cx + lx, cy + ly, lz)
      sp.userData.inConstellation = true
      if (cy + ly < minY) minY = cy + ly
    })

    const entry = constellationEntries.get(c.id)
    if (entry) {
      entry.orderedIds = orderedIds
      entry.mapCenter.set(cx, cy, 0)
      entry.labelAnchor.set(cx, (Number.isFinite(minY) ? minY : cy - 16) - (IS_MOBILE ? 9 : 10), 0)
      entry.name = c.name
      entry.count = c.stars.length
    }
  })

  // 未成座散星：柔和退至星图外围作为待汇聚微光点（仍可点击查看）
  const unclustered = [...sprites.values()].filter((sp) => !clusteredIds.has(sp.userData.id))
  const ringRx = IS_MOBILE ? 76 : 122
  const ringRy = IS_MOBILE ? 92 : 70
  unclustered.forEach((sp, i) => {
    const a = (i / Math.max(1, unclustered.length)) * Math.PI * 2 + 0.35
    const jitter = 0.94 + hash01(sp.userData.id * 5.3) * 0.14
    sp.userData.mapPos.set(Math.cos(a) * ringRx * jitter, Math.sin(a) * ringRy * jitter, -4)
    sp.userData.inConstellation = false
  })
}

// ---------------- 4. 用户善意主星管理 ----------------
function starVisual(star) {
  const l = Math.min(star.lightCount || 0, 60) / 60
  return { scale: 7.4 + l * 4.4, opacity: 0.9 + l * 0.1 }
}

function createSprite(star) {
  const v = starVisual(star)
  const orbit = computeOrbitParams(star)
  const pos = evalOrbitPoint(orbit, orbit.phase0, new THREE.Vector3())
  if (galaxyGroup) pos.applyMatrix4(galaxyGroup.matrixWorld)

  const sprite = new THREE.Sprite(glowMaterial(starburstTexture(star.colorHex || '#ffffff'), { opacity: 0 }))
  sprite.position.copy(pos)
  sprite.scale.setScalar(v.scale)
  sprite.userData = {
    id: star.id,
    colorHex: star.colorHex || '#ffffff',
    baseScale: v.scale,
    baseOpacity: v.opacity,
    phase: Math.random() * Math.PI * 2,
    speed: 0.65 + Math.random() * 0.85,
    orbit,
    theta: orbit.phase0,
    mapPos: pos.clone(),
    inConstellation: false,
    appear: 1,
    focus: 0,
    removing: false,
  }
  starGroup.add(sprite)
  sprites.set(star.id, sprite)
  createStarOrbitMesh(star, orbit)
  return sprite
}

function removeSprite(id) {
  const s = sprites.get(id)
  if (!s) return
  sprites.delete(id)
  s.userData.removing = true
  if (hovered === s) hovered = null

  const orb = starOrbits.get(id)
  if (orb) {
    starOrbits.delete(id)
    orbitGroup.remove(orb.mesh)
    orb.mesh.geometry.dispose()
    orb.material.dispose()
  }

  const from = s.userData.appear
  addTween(
    600,
    (p) => (s.userData.appear = from * (1 - easeOutCubic(p))),
    () => {
      starGroup.remove(s)
      s.material.dispose()
    },
  )
}

function syncStars(list) {
  if (!scene) return
  const ids = new Set()
  for (const star of list) {
    ids.add(star.id)
    const existing = sprites.get(star.id)
    if (existing) {
      const v = starVisual(star)
      if (v.scale !== existing.userData.baseScale) {
        Object.assign(existing.userData, { baseScale: v.scale, baseOpacity: v.opacity })
        spawnRipple(existing.position, star.colorHex, 0.95)
      }
      continue
    }
    const sprite = createSprite(star)
    const fresh = initialized && Date.now() - new Date(star.createdAt).getTime() < FRESH_MS
    if (fresh) playBirth(sprite, star)
  }
  for (const id of [...sprites.keys()]) if (!ids.has(id)) removeSprite(id)
  if (list.length) initialized = true
  computeStarMapLayout()
}

// ---------------- 5. 香槟金星座连线 + 游走脉冲（实时跟随星星从星系飞向星图） ----------------
function syncConstellations() {
  if (!constellationGroup) return

  for (const { line } of constellationEntries.values()) {
    constellationGroup.remove(line)
    line.geometry.dispose()
    line.material.dispose()
  }
  constellationEntries.clear()

  for (const p of constellationPulses) {
    pulseGroup.remove(p.sprite)
    p.sprite.material.dispose()
  }
  constellationPulses.length = 0

  const pTex = pulseTexture()

  for (const c of props.constellations) {
    if (!c.stars || c.stars.length < 2) continue
    const orderedIds = c.stars.map((s) => s.id)
    const segCount = orderedIds.length - 1
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segCount * 6), 3))

    // 经典极简香槟金连线 (#ebd7a7)
    const material = new THREE.LineBasicMaterial({
      color: CHAMPAGNE_GOLD.clone(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    const line = new THREE.LineSegments(geometry, material)
    line.frustumCulled = false
    constellationGroup.add(line)
    constellationEntries.set(c.id, {
      line,
      orderedIds,
      segments: [],
      totalLen: 0,
      mapCenter: new THREE.Vector3(),
      labelAnchor: new THREE.Vector3(),
      name: c.name,
      count: c.stars.length,
    })

    const pulseCount = IS_MOBILE ? 1 : 2
    for (let k = 0; k < pulseCount; k++) {
      const sp = new THREE.Sprite(glowMaterial(pTex, { color: CHAMPAGNE_BRIGHT.clone(), opacity: 0 }))
      sp.scale.setScalar(2.4)
      pulseGroup.add(sp)
      constellationPulses.push({
        sprite: sp,
        cid: c.id,
        t: k / pulseCount + Math.random() * 0.2,
        speed: 0.075 + Math.random() * 0.03,
      })
    }
  }

  computeStarMapLayout()
  updateConstellationGeometry()
}

function updateConstellationGeometry() {
  for (const entry of constellationEntries.values()) {
    const posAttr = entry.line.geometry.attributes.position
    const pts = []
    for (const id of entry.orderedIds) {
      const sp = sprites.get(id)
      if (sp) pts.push(sp.position)
    }
    entry.segments.length = 0
    let totalLen = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      posAttr.setXYZ(i * 2, a.x, a.y, a.z)
      posAttr.setXYZ(i * 2 + 1, b.x, b.y, b.z)
      const len = a.distanceTo(b)
      entry.segments.push({ a, b, len, accStart: totalLen })
      totalLen += len
    }
    entry.totalLen = totalLen
    posAttr.needsUpdate = true
  }
}

function samplePolyline(entry, t, out) {
  const dist = (t % 1) * entry.totalLen
  for (const seg of entry.segments) {
    if (dist <= seg.accStart + seg.len || seg === entry.segments[entry.segments.length - 1]) {
      const local = seg.len > 1e-4 ? (dist - seg.accStart) / seg.len : 0
      out.lerpVectors(seg.a, seg.b, Math.min(1, Math.max(0, local)))
      return
    }
  }
}

/** 将星图铭牌 3D 锚点实时投影到屏幕坐标 */
function updateMapLabels(alpha) {
  labelOpacity.value = alpha
  if (alpha < 0.02 || !renderer) {
    if (mapLabels.value.length) mapLabels.value = []
    return
  }
  const rect = renderer.domElement.getBoundingClientRect()
  const next = []
  for (const [id, entry] of constellationEntries.entries()) {
    tmpV.copy(entry.labelAnchor).project(camera)
    if (tmpV.z > 1) continue
    next.push({
      id,
      name: entry.name,
      count: entry.count,
      x: ((tmpV.x + 1) / 2) * rect.width,
      y: ((1 - tmpV.y) / 2) * rect.height,
      active: props.activeConstellationId === id,
    })
  }
  mapLabels.value = next
}

// ---------------- 6. 3D 涟漪、新星飞入与偶发流星 ----------------
function spawnRipple(worldPos, hex, strength = 1) {
  const color = new THREE.Color(hex || '#ffffff')
  const ring = new THREE.Sprite(glowMaterial(ringTexture(), { color }))
  const flash = new THREE.Sprite(glowMaterial(starburstTexture(hex || '#ffffff')))
  ring.position.copy(worldPos)
  flash.position.copy(worldPos)
  fxGroup.add(ring, flash)

  addTween(
    1150,
    (p) => {
      const e = easeOutCubic(p)
      ring.scale.setScalar(3 + e * 28 * strength)
      ring.material.opacity = (1 - p) * 0.9
      flash.scale.setScalar((5 + 15 * strength) * (1 - e) + 2)
      flash.material.opacity = (1 - p) * 0.85
    },
    () => {
      fxGroup.remove(ring, flash)
      ring.material.dispose()
      flash.material.dispose()
    },
  )
}

function playBirth(sprite, star) {
  const u = sprite.userData
  u.appear = 0
  const orb = starOrbits.get(star.id)
  if (orb) orb.mesh.visible = false

  const initEnd = sprite.position.clone()
  const outward = initEnd.clone().normalize()
  if (outward.lengthSq() < 1e-4) outward.set(0, 0, 1)
  const tangent = new THREE.Vector3().crossVectors(outward, new THREE.Vector3(0, 1, 0))
  if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0)
  tangent.normalize()
  const side = Math.random() > 0.5 ? 1 : -1
  const start = initEnd.clone().addScaledVector(outward, 90).addScaledVector(tangent, side * 68).add(new THREE.Vector3(0, 56, 0))
  const ctrl = start.clone().lerp(initEnd, 0.5).addScaledVector(outward, 28).addScaledVector(tangent, -side * 22)

  const tex = starburstTexture(star.colorHex || '#ffffff')
  const TRAIL = 16
  const pts = Array.from({ length: TRAIL }, (_, i) => {
    const k = 1 - i / TRAIL
    const sp = new THREE.Sprite(glowMaterial(tex, { opacity: 0 }))
    sp.scale.setScalar(i === 0 ? 9 : 5.2 * k + 0.6)
    fxGroup.add(sp)
    return { sp, k }
  })

  const evalQuad = (t, endPos, out) => {
    const inv = 1 - t
    out.copy(start).multiplyScalar(inv * inv).addScaledVector(ctrl, 2 * inv * t).addScaledVector(endPos, t * t)
  }

  addTween(
    1200,
    (p) => {
      const e = easeInOutSine(p)
      const liveEnd = sprite.position
      pts.forEach(({ sp, k }, i) => {
        const tp = Math.max(0, e - i * 0.02)
        evalQuad(tp, liveEnd, sp.position)
        sp.material.opacity = tp > 0 ? k * 0.95 : 0
      })
    },
    () => {
      pts.forEach(({ sp }) => {
        fxGroup.remove(sp)
        sp.material.dispose()
      })
      spawnRipple(sprite.position, star.colorHex, 1.45)
      if (orb) orb.mesh.visible = true
      addTween(
        700,
        (p) => (u.appear = easeOutBack(p)),
        () => (u.appear = 1),
      )
    },
  )
}

function spawnMeteor() {
  if (!meteorGroup || mapMorph > 0.35) return
  const r = 205 + Math.random() * 95
  const start = new THREE.Vector3().randomDirection().multiplyScalar(r)
  start.y = Math.abs(start.y) * 0.5 + 32
  const dir = new THREE.Vector3(Math.random() - 0.5, -0.35 - Math.random() * 0.4, Math.random() - 0.5).normalize()
  const end = start.clone().addScaledVector(dir, 120 + Math.random() * 65)

  const segs = 12
  const positions = new Float32Array((segs + 1) * 3)
  const colors = new Float32Array((segs + 1) * 3)
  const headColor = Math.random() > 0.4 ? new THREE.Color('#fff9e6') : new THREE.Color('#dceaff')

  for (let i = 0; i <= segs; i++) {
    const fade = Math.pow(1 - i / segs, 1.8)
    colors[i * 3] = headColor.r * fade
    colors[i * 3 + 1] = headColor.g * fade
    colors[i * 3 + 2] = headColor.b * fade
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  meteorGroup.add(line)
  meteors.push({ line, start, end, elapsed: 0, duration: 0.95 + Math.random() * 0.45, tailRatio: 0.24, segs })
}

function scheduleNextMeteor() {
  clearTimeout(meteorTimer)
  meteorTimer = setTimeout(() => {
    if (!document.hidden) spawnMeteor()
    scheduleNextMeteor()
  }, 4000 + Math.random() * 4000)
}

function updateMeteors(dt) {
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i]
    m.elapsed += dt
    const p = m.elapsed / m.duration
    if (p >= 1) {
      meteorGroup.remove(m.line)
      m.line.geometry.dispose()
      m.line.material.dispose()
      meteors.splice(i, 1)
      continue
    }
    const posAttr = m.line.geometry.attributes.position
    for (let s = 0; s <= m.segs; s++) {
      const tp = Math.max(0, Math.min(1, p - (s / m.segs) * m.tailRatio))
      tmpV.lerpVectors(m.start, m.end, tp)
      posAttr.setXYZ(s, tmpV.x, tmpV.y, tmpV.z)
    }
    posAttr.needsUpdate = true
    m.line.material.opacity = Math.sin(p * Math.PI) * 0.95 * (1 - smoothstep(0.2, 0.6, mapMorph))
  }
}

// ---------------- 7. 相机控制与双态转场运镜 ----------------
function cancelCameraTween() {
  if (!cameraTween) return
  cameraTween.cancelled = true
  cameraTween = null
  isIntroTween = false
  if (controls) controls.enabled = true
}

function flyToDynamic(getTarget, getCamPos, duration = 1200, onDone, easing = easeInOutCubic, intro = false) {
  cancelCameraTween()
  clearTimeout(resumeTimer)
  controls.autoRotate = false
  controls.enabled = !intro
  isIntroTween = intro

  const fromTarget = controls.target.clone()
  const fromPos = camera.position.clone()
  const toTarget = new THREE.Vector3()
  const toPos = new THREE.Vector3()

  cameraTween = addTween(
    duration,
    (p) => {
      const e = easing(p)
      getTarget(toTarget)
      getCamPos(toTarget, toPos)
      camera.position.lerpVectors(fromPos, toPos, e)
      controls.target.lerpVectors(fromTarget, toTarget, e)
    },
    () => {
      controls.enabled = true
      cameraTween = null
      isIntroTween = false
      onDone?.()
    },
  )
}

function focusStar(id) {
  const s = sprites.get(id)
  if (!s || !controls) return false

  if (props.showConstellations || mapMorph > 0.5) {
    // 星图模式下：保持正交感正面视角，仅轻柔平移靠近该星
    flyToDynamic(
      (out) => out.copy(s.position),
      (target, out) => out.set(target.x, target.y, IS_MOBILE ? 145 : 118),
      850,
    )
    return true
  }

  flyToDynamic(
    (out) => out.copy(s.position),
    (target, out) => {
      const dir = target.clone()
      if (dir.lengthSq() < 1e-4) dir.set(0, 0.3, 1)
      dir.normalize()
      out.copy(target).addScaledVector(dir, FOCUS_OFFSET).add(new THREE.Vector3(0, 10, 0))
    },
    1250,
  )
  return true
}

function focusConstellation(constellationId) {
  const entry = constellationEntries.get(constellationId)
  if (!entry || !controls) return false

  if (props.showConstellations || mapMorph > 0.5) {
    flyToDynamic(
      (out) => out.copy(entry.mapCenter),
      (target, out) => out.set(target.x, target.y, IS_MOBILE ? 175 : 138),
      900,
    )
    return true
  }

  const getCentroid = (out) => {
    out.set(0, 0, 0)
    let n = 0
    for (const id of entry.orderedIds) {
      const sp = sprites.get(id)
      if (sp) {
        out.add(sp.position)
        n++
      }
    }
    if (n) out.divideScalar(n)
    return out
  }

  flyToDynamic(
    (out) => getCentroid(out).multiplyScalar(0.55),
    (target, out) => {
      const dir = target.clone()
      if (dir.lengthSq() < 1e-4) dir.set(0, 0.4, 1)
      dir.normalize()
      out.copy(dir).multiplyScalar(158).add(new THREE.Vector3(0, 36, 0))
    },
    1300,
  )
  return true
}

function resetView() {
  if (!controls) return
  if (props.showConstellations) {
    flyToDynamic(
      (out) => out.set(0, 0, 0),
      (_, out) => out.copy(MAP_CAM_POS),
      900,
    )
    return
  }
  const dir = camera.position.clone()
  if (dir.lengthSq() < 1e-6) dir.copy(HOME_POS)
  const targetCam = dir.setLength(HOME_POS.length())
  flyToDynamic(
    (out) => out.set(0, 0, 0),
    (_, out) => out.copy(targetCam),
    1300,
    () => {
      if (props.selectedId == null && !props.showConstellations) controls.autoRotate = true
    },
  )
}

defineExpose({ focusStar, focusConstellation, resetView })

// 监听星图模式切换：按三拍节奏触发相机丝滑移向正交感星图平面 / 返回星系俯瞰视角
watch(
  () => props.showConstellations,
  (isMap) => {
    if (!controls) return
    clearTimeout(morphCamTimer)
    if (isMap) {
      // 阶段 A（0~0.28，约 420ms）先在星系中亮起香槟金连线，随后阶段 B 相机平滑正对星图平面
      morphCamTimer = setTimeout(() => {
        flyToDynamic(
          (out) => out.set(0, 0, 0),
          (_, out) => out.copy(MAP_CAM_POS),
          1050,
          () => {
            controls.enableRotate = false
            controls.enablePan = true
            controls.autoRotate = false
          },
          easeInOutCubic,
        )
      }, 320)
    } else {
      controls.enableRotate = true
      controls.enablePan = false
      // 逆向转场：铭牌淡出后，相机与星星同步丝滑回到星系黄金俯瞰视角
      morphCamTimer = setTimeout(() => {
        flyToDynamic(
          (out) => out.set(0, 0, 0),
          (_, out) => out.copy(HOME_POS),
          1150,
          () => {
            if (props.selectedId == null) controls.autoRotate = true
          },
          easeInOutCubic,
        )
      }, 180)
    }
  },
)

// ---------------- 8. 交互 ----------------
function setPointer(e) {
  const r = renderer.domElement.getBoundingClientRect()
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  lastClient.x = e.clientX
  lastClient.y = e.clientY
}

function raycastStar() {
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(starGroup.children, false)
  return hits.find((h) => !h.object.userData.removing && h.object.userData.appear > 0.5)?.object ?? null
}

function nearestStar(cx, cy, maxPx) {
  const r = renderer.domElement.getBoundingClientRect()
  let best = null
  let bestD = maxPx
  for (const s of sprites.values()) {
    tmpV.copy(s.position).project(camera)
    if (tmpV.z > 1) continue
    const d = Math.hypot(((tmpV.x + 1) / 2) * r.width + r.left - cx, ((1 - tmpV.y) / 2) * r.height + r.top - cy)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

function interruptIntro() {
  if (isIntroTween) {
    cancelCameraTween()
    controls.autoRotate = false
    onControlEnd()
  }
}

function onPointerMove(e) {
  if (e.pointerType === 'touch') return
  setPointer(e)
}

function onPointerLeave() {
  pointer.set(-10, -10)
}

function onPointerDown(e) {
  interruptIntro()
  down.x = e.clientX
  down.y = e.clientY
  down.t = performance.now()
}

function onWheel() {
  interruptIntro()
}

function onPointerUp(e) {
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 600) return
  setPointer(e)
  const hit = raycastStar() ?? nearestStar(e.clientX, e.clientY, e.pointerType === 'touch' ? 30 : 16)
  if (e.pointerType === 'touch') pointer.set(-10, -10)
  if (hit) {
    emit('select', hit.userData.id)
    focusStar(hit.userData.id)
  } else {
    emit('blank')
  }
}

function onControlStart() {
  interruptIntro()
  clearTimeout(resumeTimer)
  controls.autoRotate = false
}

function onControlEnd() {
  clearTimeout(resumeTimer)
  resumeTimer = setTimeout(() => {
    if (props.selectedId == null && !cameraTween && !props.showConstellations) controls.autoRotate = true
  }, 3200)
}

function updateHover(dt) {
  const h = pointer.x > -2 ? raycastStar() : null
  if (h !== hovered) {
    hovered = h
    renderer.domElement.style.cursor = h ? 'pointer' : ''
  }

  if (reticle) {
    const targetOp = h ? 0.9 : 0
    reticleOpacity += (targetOp - reticleOpacity) * 0.16
    reticle.visible = reticleOpacity > 0.02
    if (h) {
      reticle.position.copy(h.position)
      reticle.material.color.set(mapMorph > 0.6 ? '#ebd7a7' : h.userData.colorHex)
      reticle.scale.setScalar(h.scale.x * 1.45)
    }
    reticle.material.opacity = reticleOpacity
    reticle.material.rotation += dt * 0.9
  }

  if (!h) {
    if (tip.value) tip.value = null
    return
  }
  const id = h.userData.id
  if (tip.value?.id === id && tip.value.x === lastClient.x && tip.value.y === lastClient.y) return
  const star = props.stars.find((s) => s.id === id)
  if (!star) return
  tip.value = {
    id,
    x: lastClient.x,
    y: lastClient.y,
    text: star.content.length > 18 ? `${star.content.slice(0, 18)}…` : star.content,
    label: EMOTION_META[star.emotion]?.label,
    color: star.colorHex,
  }
}

function onResize() {
  const el = container.value
  if (!el || !renderer) return
  const w = el.clientWidth
  const h = el.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  composer?.setSize(w, h)
  bloomPass?.setSize(w, h)
}

// ---------------- 主循环（三拍状态机驱动） ----------------
function animate(now) {
  frameId = requestAnimationFrame(animate)
  const dt = Math.min(0.1, (now - lastTime) / 1000)
  lastTime = now
  const t = now / 1000

  // 1. 驱动 1.6s 三拍可逆转场进度 mapMorph ∈ [0, 1]
  const targetMorph = props.showConstellations ? 1 : 0
  if (mapMorph !== targetMorph) {
    const step = dt / MORPH_DURATION_SEC
    if (mapMorph < targetMorph) mapMorph = Math.min(1, mapMorph + step)
    else mapMorph = Math.max(0, mapMorph - step)
  }

  // 三拍子曲线：
  // Phase A (0.00 -> 0.28): 轨道淡出、公转减速静止、香槟金连线亮起
  const orbitAlpha = 1 - smoothstep(0.0, 0.26, mapMorph)
  const spinMorphFactor = 1 - smoothstep(0.0, 0.28, mapMorph)
  const lineAlpha = smoothstep(0.06, 0.28, mapMorph)
  // Phase B (0.28 -> 0.85): 星云淡隐、背景切深靛蓝、星座抽离展开至星图阵列
  const nebulaAlpha = 1 - smoothstep(0.28, 0.72, mapMorph)
  const posBlend = easeInOutCubic(THREE.MathUtils.clamp((mapMorph - 0.28) / 0.57, 0, 1))
  // Phase C (0.72 -> 1.00): 极简香槟金星座铭牌淡入
  const labelAlpha = smoothstep(0.72, 1.0, mapMorph)

  // 背景底色与雾在深空黑 (#02030a) 与星图深靛蓝 (#050a18) 间平滑过渡
  const bgBlend = smoothstep(0.28, 0.76, mapMorph)
  tmpBgColor.copy(GALAXY_BG).lerp(STARMAP_BG, bgBlend)
  scene.background.copy(tmpBgColor)
  scene.fog.color.copy(tmpBgColor)
  scene.fog.density = FOG_DENSITY * (1 - bgBlend * 0.78)
  if (bloomPass) {
    // 收紧辉光阈值，仅让银心极核与主星核泛辉光，不提亮星云底雾
    bloomPass.strength = THREE.MathUtils.lerp(0.31, 0.2, bgBlend)
    bloomPass.threshold = THREE.MathUtils.lerp(0.68, 0.75, bgBlend)
  }

  // 公转速度：聚焦或进入星图模式时平滑静止
  const targetScale = props.selectedId != null ? 0.14 : 1.0
  orbitTimeScale += (targetScale * spinMorphFactor - orbitTimeScale) * 0.1

  if (galaxyGroup) {
    galaxyGroup.rotation.y += dt * GALAXY_SPIN_SPEED * orbitTimeScale
    galaxyGroup.updateWorldMatrix(true, false)
  }

  // 更新星云盘与旋臂钻石星尘淡出/淡入
  const showNebula = nebulaAlpha > 0.005
  if (nebulaGroup) nebulaGroup.visible = showNebula
  if (stardustPoints) stardustPoints.visible = showNebula
  if (showNebula) {
    for (const mat of nebulaMaterials) {
      mat.uniforms.uTime.value = t
      mat.uniforms.uFade.value = nebulaAlpha
    }
    if (stardustMat) stardustMat.opacity = 0.58 * nebulaAlpha
  }

  // 更新 3D 轨道与陪衬背景轨道淡出/淡入
  const showOrbits = orbitAlpha > 0.005
  if (orbitGroup) orbitGroup.visible = showOrbits
  if (bgOrbitsMesh && bgOrbitsMaterial) {
    bgOrbitsMesh.visible = showOrbits
    if (showOrbits) {
      const avgCamDist = camera.position.length()
      bgOrbitsMaterial.uniforms.uHalfWidth.value = THREE.MathUtils.clamp(0.16 + (avgCamDist - 40) * 0.0024, 0.16, 0.72)
      bgOrbitsMaterial.uniforms.uOpacity.value = 0.048 * orbitAlpha
    }
  }

  // 更新每颗用户善意主星的实时位置（星系 3D 轨道世界坐标 ⇄ 星图平面坐标插值）
  for (const s of sprites.values()) {
    const u = s.userData
    u.theta = (u.theta + dt * u.orbit.angularSpeed * orbitTimeScale) % (Math.PI * 2)
    evalOrbitPoint(u.orbit, u.theta, tmpLocal)
    tmpGalaxyWorld.copy(tmpLocal).applyMatrix4(galaxyGroup.matrixWorld)

    if (posBlend <= 0.0001) {
      s.position.copy(tmpGalaxyWorld)
    } else if (posBlend >= 0.9999) {
      s.position.copy(u.mapPos)
    } else {
      s.position.lerpVectors(tmpGalaxyWorld, u.mapPos, posBlend)
    }

    const active = hovered === s || props.selectedId === u.id ? 1 : 0
    u.focus += (active - u.focus) * 0.12

    const camDist = camera.position.distanceTo(s.position)
    const depthScale = THREE.MathUtils.clamp(1.24 - (camDist - 40) / 290, 0.64, 1.32)
    const depthAlpha = THREE.MathUtils.clamp(1.18 - (camDist - 45) / 320, 0.52, 1.15)
    const breath = 1 + 0.09 * Math.sin(t * u.speed + u.phase)

    // 星图模式下：成座主星更精致克制，未成座散星柔和退居外围
    const mapScaleMul = u.inConstellation ? 0.74 : 0.46
    const mapAlphaMul = u.inConstellation ? 0.96 : 0.44
    const modeScale = THREE.MathUtils.lerp(depthScale, mapScaleMul, posBlend)
    const modeAlpha = THREE.MathUtils.lerp(depthAlpha, mapAlphaMul, posBlend)

    s.scale.setScalar(u.baseScale * modeScale * breath * (1 + 0.34 * u.focus) * Math.max(u.appear, 0.001))
    s.material.opacity =
      Math.min(1, u.baseOpacity * modeAlpha * (0.88 + 0.12 * breath) + 0.18 * u.focus) * Math.min(1, u.appear)

    const orb = starOrbits.get(u.id)
    if (orb && showOrbits && orb.mesh.visible) {
      const halfWidth = THREE.MathUtils.clamp(0.26 + (camDist - 40) * 0.0049, 0.28, 1.55) * (1 + 0.2 * u.focus)
      const distBoost = THREE.MathUtils.clamp(0.78 + (camDist - 60) * 0.0014, 0.76, 1.08)
      orb.material.uniforms.uHalfWidth.value = halfWidth
      orb.material.uniforms.uHeadAngle.value = u.theta
      orb.material.uniforms.uOpacity.value =
        Math.min(1.05, distBoost * (0.88 + 0.12 * breath) + 0.22 * u.focus) * Math.min(1, u.appear) * orbitAlpha
    }
  }

  runTweens(now)

  // 选中主星（星系模式且非飞行中）：平滑追踪其最新公转位置
  if (props.selectedId != null && !cameraTween && mapMorph < 0.1) {
    const sel = sprites.get(props.selectedId)
    if (sel) controls.target.lerp(sel.position, 0.14)
  }

  // 香槟金星座连线与游走微光脉冲
  const showLines = lineAlpha > 0.005
  if (constellationGroup) constellationGroup.visible = showLines
  if (pulseGroup) pulseGroup.visible = showLines
  if (showLines) {
    updateConstellationGeometry()
    const hasActive = props.activeConstellationId != null
    for (const [id, entry] of constellationEntries.entries()) {
      const isAct = id === props.activeConstellationId
      entry.line.material.color.copy(isAct ? CHAMPAGNE_BRIGHT : CHAMPAGNE_GOLD)
      entry.line.material.opacity = (isAct ? 0.96 : hasActive ? 0.18 : 0.56) * lineAlpha
    }
    for (const p of constellationPulses) {
      const entry = constellationEntries.get(p.cid)
      if (!entry || entry.totalLen <= 0) continue
      const isAct = p.cid === props.activeConstellationId
      p.t = (p.t + dt * p.speed) % 1
      samplePolyline(entry, p.t, tmpV2)
      p.sprite.position.copy(tmpV2)
      p.sprite.material.opacity = (isAct ? 0.95 : hasActive ? 0.18 : 0.58) * lineAlpha
      p.sprite.scale.setScalar(isAct ? 3.8 : 2.2)
    }
  }

  updateHover(dt)
  updateMeteors(dt)

  if (cameraTween) camera.lookAt(controls.target)
  else controls.update(dt)

  // 投影更新星图铭牌 HTML 浮层
  updateMapLabels(labelAlpha)

  if (composer) composer.render()
  else renderer.render(scene, camera)
}

onMounted(() => {
  const el = container.value
  const w = el.clientWidth
  const h = el.clientHeight

  renderer = new THREE.WebGLRenderer({ antialias: !IS_MOBILE, alpha: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.5 : 2))
  renderer.setSize(w, h)
  renderer.setClearColor(GALAXY_BG, 1)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.96
  el.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  scene.background = GALAXY_BG.clone()
  scene.fog = new THREE.FogExp2(GALAXY_BG.getHex(), FOG_DENSITY)

  camera = new THREE.PerspectiveCamera(54, w / h, 0.5, 2200)
  camera.position.copy(props.showConstellations ? MAP_CAM_POS : INTRO_POS)

  controls = new OrbitControls(camera, renderer.domElement)
  Object.assign(controls, {
    enableDamping: true,
    dampingFactor: 0.055,
    minDistance: 28,
    maxDistance: 360,
    enablePan: props.showConstellations,
    enableRotate: !props.showConstellations,
    autoRotate: !props.showConstellations,
    autoRotateSpeed: 0.18,
    rotateSpeed: IS_MOBILE ? 0.6 : 0.48,
    zoomSpeed: 0.85,
  })
  controls.addEventListener('start', onControlStart)
  controls.addEventListener('end', onControlEnd)

  if (USE_BLOOM) {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.31, 0.36, 0.68)
    composer.addPass(bloomPass)
    composer.addPass(new OutputPass())
  }

  raycaster = new THREE.Raycaster()

  // 星系旋转层：星云盘 + 钻石星尘 + 3D 立体轨道 + 陪衬细轨
  galaxyTilt = new THREE.Group()
  galaxyTilt.rotation.set(GALAXY_TILT_X, 0, GALAXY_TILT_Z)
  galaxyGroup = new THREE.Group()
  galaxyTilt.add(galaxyGroup)
  nebulaGroup = new THREE.Group()
  orbitGroup = new THREE.Group()
  galaxyGroup.add(nebulaGroup, orbitGroup)

  // 世界坐标层：主星、星座连线与脉冲、涟漪/准星（可在 3D 星系世界坐标与 2D 星图平面间无缝插值）
  constellationGroup = new THREE.Group()
  pulseGroup = new THREE.Group()
  starGroup = new THREE.Group()
  fxGroup = new THREE.Group()
  meteorGroup = new THREE.Group()
  scene.add(galaxyTilt, constellationGroup, pulseGroup, starGroup, fxGroup, meteorGroup)

  createNebulaDisk()
  createSpiralStardust()
  createBackgroundOrbitRings()
  createQuietBackgroundStars()

  reticle = new THREE.Sprite(glowMaterial(reticleTexture(), { opacity: 0 }))
  reticle.visible = false
  fxGroup.add(reticle)

  const dom = renderer.domElement
  dom.addEventListener('pointermove', onPointerMove)
  dom.addEventListener('pointerleave', onPointerLeave)
  dom.addEventListener('pointerdown', onPointerDown)
  dom.addEventListener('pointerup', onPointerUp)
  dom.addEventListener('wheel', onWheel, { passive: true })
  resizeObserver = new ResizeObserver(onResize)
  resizeObserver.observe(el)

  galaxyGroup.updateWorldMatrix(true, false)
  mapMorph = props.showConstellations ? 1 : 0
  syncStars(props.stars)
  syncConstellations()

  if (!props.showConstellations) {
    flyToDynamic(
      (out) => out.set(0, 0, 0),
      (_, out) => out.copy(HOME_POS),
      2200,
      () => {
        if (props.selectedId == null && !props.showConstellations) controls.autoRotate = true
      },
      easeOutCubic,
      true,
    )
  }

  scheduleNextMeteor()
  lastTime = performance.now()
  frameId = requestAnimationFrame(animate)
})

watch(() => props.stars, syncStars, { deep: true })
watch(() => props.constellations, syncConstellations, { deep: true })

onBeforeUnmount(() => {
  cancelAnimationFrame(frameId)
  clearTimeout(resumeTimer)
  clearTimeout(meteorTimer)
  clearTimeout(morphCamTimer)
  resizeObserver?.disconnect()
  if (renderer) {
    const dom = renderer.domElement
    dom.removeEventListener('pointermove', onPointerMove)
    dom.removeEventListener('pointerleave', onPointerLeave)
    dom.removeEventListener('pointerdown', onPointerDown)
    dom.removeEventListener('pointerup', onPointerUp)
    dom.removeEventListener('wheel', onWheel)
  }
  controls?.dispose()
  bloomPass?.dispose()
  composer?.dispose()
  scene?.traverse((o) => {
    o.geometry?.dispose()
    if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose())
    else o.material?.dispose()
  })
  textures.forEach((t) => t.dispose())
  textures.clear()
  sprites.clear()
  starOrbits.clear()
  nebulaMaterials.length = 0
  constellationEntries.clear()
  constellationPulses.length = 0
  meteors.length = 0
  renderer?.dispose()
  renderer?.domElement.remove()
})
</script>

<template>
  <div ref="container" class="absolute inset-0">
    <!-- 阶段 C：星图模式下的极简香槟金星座铭牌标签 -->
    <div
      v-if="labelOpacity > 0.02"
      class="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      :style="{ opacity: labelOpacity }"
    >
      <button
        v-for="lb in mapLabels"
        :key="lb.id"
        class="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-2.5 py-1 font-serif text-[11px] tracking-[0.18em] backdrop-blur-sm transition duration-300 sm:px-3 sm:text-xs sm:tracking-[0.24em]"
        :class="
          lb.active
            ? 'border-[#ebd7a7]/70 bg-[#ebd7a7]/15 text-[#fff4d4] shadow-[0_0_24px_-4px_rgba(235,215,167,0.55)]'
            : 'border-[#ebd7a7]/20 bg-[#050a18]/55 text-[#ebd7a7]/90 hover:border-[#ebd7a7]/55 hover:bg-[#ebd7a7]/10 hover:text-[#fff4d4]'
        "
        :style="{ left: `${lb.x}px`, top: `${lb.y}px` }"
        @click.stop="emit('select-constellation', lb.id)"
      >
        <span>{{ lb.name }}</span>
        <span class="ml-1.5 font-sans text-[10px] tracking-normal text-[#ebd7a7]/65">· {{ lb.count }} 颗微光</span>
      </button>

      <!-- 底部极轻《STAR MAP》装饰细字 -->
      <div
        class="pointer-events-none fixed inset-x-0 bottom-24 text-center font-serif text-[10px] tracking-[0.45em] text-[#ebd7a7]/40 sm:bottom-28"
      >
        WEIGUANG STAR MAP
      </div>
    </div>

    <!-- 悬停星星浮层提示 -->
    <Transition name="fade">
      <div
        v-if="tip"
        class="glass pointer-events-none fixed z-20 flex max-w-64 items-center gap-2 rounded-full px-3 py-1.5 text-xs text-slate-200"
        :style="{ left: `${tip.x + 14}px`, top: `${tip.y + 14}px` }"
      >
        <span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: tip.color, boxShadow: `0 0 8px ${tip.color}` }" />
        <span class="truncate">{{ tip.text }}</span>
        <span class="shrink-0 text-slate-500">点击查看</span>
      </div>
    </Transition>
  </div>
</template>
