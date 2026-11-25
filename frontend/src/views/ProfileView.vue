<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  Heart,
  ListChecks,
  LoaderCircle,
  MapPin,
  Orbit,
  Sparkles,
  Trash2,
  UserRound,
} from '@lucide/vue'
import AuthModal from '@/components/AuthModal.vue'
import ToastHost from '@/components/ToastHost.vue'
import * as profileApi from '@/api/profile'
import * as starsApi from '@/api/stars'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { EMOTION_META, hexAlpha, relativeTime } from '@/utils/format'

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

const now = new Date()
const currentMonth = ref(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
const loading = ref(false)
const overview = ref(null)
const selectedDate = ref(null)

const reviewLoading = ref(false)
const review = ref(null)
const deletingId = ref(null)
const confirmDeleteId = ref(null)

const dominantMeta = computed(() => {
  const emo = overview.value?.stats?.dominantEmotion
  return emo ? EMOTION_META[emo] : { label: '待点亮', color: '#FFB86B' }
})

async function loadOverview() {
  if (!auth.isLoggedIn) return
  loading.value = true
  try {
    overview.value = await profileApi.getProfileOverview(currentMonth.value)
  } catch (e) {
    ui.toast(e.message, 'error')
  } finally {
    loading.value = false
  }
}

function shiftMonth(delta) {
  const [y, m] = currentMonth.value.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  currentMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  selectedDate.value = null
  loadOverview()
}

const monthTitle = computed(() => {
  const [y, m] = currentMonth.value.split('-')
  return `${y} 年 ${Number(m)} 月`
})

const calendarCells = computed(() => {
  const [y, m] = currentMonth.value.split('-').map(Number)
  const firstDay = new Date(y, m - 1, 1).getDay() // 0=Sun
  const daysInMonth = new Date(y, m, 0).getDate()
  const dayMap = new Map((overview.value?.calendar?.days || []).map((d) => [d.date, d]))

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push({ empty: true, key: `e-${i}` })
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const info = dayMap.get(date)
    cells.push({ empty: false, key: date, day: d, date, info })
  }
  return cells
})

// 30 天平滑 SVG 折线 & 面积路径
const chartGeometry = computed(() => {
  const data = overview.value?.trend30Days || []
  const W = 600
  const H = 150
  const padX = 14
  const padY = 18
  if (!data.length) return { line: '', area: '', points: [], max: 1 }

  const max = Math.max(1, ...data.map((d) => d.count))
  const stepX = (W - padX * 2) / Math.max(1, data.length - 1)
  const points = data.map((d, i) => ({
    x: padX + i * stepX,
    y: H - padY - (d.count / max) * (H - padY * 2),
    ...d,
  }))

  // Catmull-Rom / midpoint 二次贝塞尔平滑折线
  let line = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const mx = ((prev.x + curr.x) / 2).toFixed(1)
    const my = ((prev.y + curr.y) / 2).toFixed(1)
    line += ` Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${mx} ${my}`
  }
  const last = points[points.length - 1]
  line += ` T ${last.x.toFixed(1)} ${last.y.toFixed(1)}`

  const area = `${line} L ${last.x.toFixed(1)} ${H - padY} L ${points[0].x.toFixed(1)} ${H - padY} Z`
  return { line, area, points, max }
})

const filteredStars = computed(() => {
  const list = overview.value?.stars || []
  if (!selectedDate.value) return list
  return list.filter((s) => {
    const d = new Date(s.createdAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return key === selectedDate.value
  })
})

async function generateReview() {
  reviewLoading.value = true
  try {
    review.value = await profileApi.generateMonthlyReview(currentMonth.value)
  } catch (e) {
    ui.toast(e.message, 'error')
  } finally {
    reviewLoading.value = false
  }
}

async function copyReview() {
  if (!review.value) return
  const text = `【微光星空 · ${review.value.label}回顾】\n关键词：${review.value.keywords.join(' / ')}\n${review.value.summary}`
  try {
    await navigator.clipboard.writeText(text)
    ui.toast('月度微光回顾已复制', 'success')
  } catch {
    ui.toast('复制失败，请手动复制', 'error')
  }
}

async function removeStar(id) {
  deletingId.value = id
  try {
    await starsApi.deleteStar(id)
    confirmDeleteId.value = null
    ui.toast('这颗星已悄悄熄灭')
    await loadOverview()
  } catch (e) {
    ui.toast(e.message, 'error')
  } finally {
    deletingId.value = null
  }
}

function focusInSky(id) {
  router.push({ path: '/', query: { focus: String(id) } })
}

watch(
  () => auth.isLoggedIn,
  (logged) => {
    if (logged) loadOverview()
    else overview.value = null
  },
)

onMounted(async () => {
  if (!auth.ready) await auth.init()
  if (auth.isLoggedIn) await loadOverview()
})
</script>

<template>
  <div class="night-sky relative h-full w-full overflow-y-auto">
    <div class="relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <!-- 顶栏 -->
      <header class="mb-8 flex items-center justify-between">
        <button class="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm text-slate-200 transition hover:text-white" @click="router.push('/')">
          <ArrowLeft class="h-4 w-4" /> 返回星空
        </button>
        <div class="flex items-center gap-2 font-serif text-lg tracking-[0.22em] text-amber-50">
          <Sparkles class="h-4 w-4 text-amber-200" /> 个人星图
        </div>
        <div v-if="auth.user" class="flex items-center gap-1.5 text-sm text-slate-300">
          <UserRound class="h-4 w-4 text-amber-200/80" />
          <span class="hidden sm:inline">{{ auth.user.nickname }}</span>
        </div>
        <div v-else class="w-16" />
      </header>

      <!-- 未登录引导 -->
      <section v-if="auth.ready && !auth.isLoggedIn" class="glass mx-auto mt-16 max-w-md rounded-3xl p-8 text-center">
        <Sparkles class="mx-auto h-10 w-10 text-amber-200" />
        <h2 class="mt-4 font-serif text-xl tracking-wider text-amber-50">登录查看你的专属星图</h2>
        <p class="mt-2 text-sm leading-relaxed text-slate-400">
          记录每一天的情绪色彩、查看 30 天微光轨迹，并生成你的 AI 月度微光回顾。
        </p>
        <button class="btn-primary mt-6" @click="ui.openAuth('guest')">快速体验 / 登录</button>
      </section>

      <!-- 已登录内容 -->
      <template v-else-if="overview">
        <!-- 4 项概览卡片 -->
        <section class="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div class="glass rounded-2xl p-4 sm:p-5">
            <div class="flex items-center gap-1.5 text-xs text-slate-400"><Sparkles class="h-3.5 w-3.5 text-amber-200" /> 累计点亮星数</div>
            <div class="mt-2 font-serif text-3xl tabular-nums text-amber-50">{{ overview.stats.totalStars }}</div>
          </div>
          <div class="glass rounded-2xl p-4 sm:p-5">
            <div class="flex items-center gap-1.5 text-xs text-slate-400"><Heart class="h-3.5 w-3.5 text-rose-300" /> 收获他人点亮</div>
            <div class="mt-2 font-serif text-3xl tabular-nums text-amber-50">{{ overview.stats.totalLightsReceived }}</div>
          </div>
          <div class="glass rounded-2xl p-4 sm:p-5">
            <div class="flex items-center gap-1.5 text-xs text-slate-400"><ListChecks class="h-3.5 w-3.5 text-emerald-300" /> 完成微行动</div>
            <div class="mt-2 font-serif text-3xl tabular-nums text-amber-50">{{ overview.stats.completedActions }}</div>
          </div>
          <div class="glass rounded-2xl p-4 sm:p-5">
            <div class="text-xs text-slate-400">主打情绪色彩</div>
            <div class="mt-2.5 flex items-center gap-2.5">
              <span
                class="h-5 w-5 rounded-full"
                :style="{ background: dominantMeta.color, boxShadow: `0 0 14px ${dominantMeta.color}` }"
              />
              <span class="font-serif text-xl text-slate-100">{{ dominantMeta.label }}</span>
            </div>
          </div>
        </section>

        <!-- 月度情绪日历 + 30 天成长曲线 -->
        <section class="mt-6 grid gap-5 lg:grid-cols-2">
          <!-- 月度情绪日历 -->
          <div class="glass rounded-3xl p-5 sm:p-6">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="flex items-center gap-2 font-serif text-base tracking-wider text-amber-50">
                <Calendar class="h-4 w-4 text-amber-200" /> 月度情绪日历
              </h2>
              <div class="flex items-center gap-1">
                <button class="icon-btn h-8 w-8" aria-label="上个月" @click="shiftMonth(-1)">
                  <ChevronLeft class="h-4 w-4" />
                </button>
                <span class="min-w-24 text-center text-xs tabular-nums text-slate-200">{{ monthTitle }}</span>
                <button class="icon-btn h-8 w-8" aria-label="下个月" @click="shiftMonth(1)">
                  <ChevronRight class="h-4 w-4" />
                </button>
              </div>
            </div>

            <div class="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-500">
              <span v-for="w in ['日', '一', '二', '三', '四', '五', '六']" :key="w" class="py-1">{{ w }}</span>
            </div>

            <div class="mt-1 grid grid-cols-7 gap-1.5">
              <div v-for="cell in calendarCells" :key="cell.key" class="aspect-square">
                <button
                  v-if="!cell.empty"
                  class="flex h-full w-full flex-col items-center justify-center rounded-xl border text-xs transition"
                  :class="
                    selectedDate === cell.date
                      ? 'border-amber-200/60 bg-amber-200/15 text-amber-50'
                      : cell.info
                        ? 'border-white/10 bg-white/[0.05] text-slate-100 hover:border-white/25'
                        : 'border-transparent text-slate-500 hover:bg-white/[0.03]'
                  "
                  @click="selectedDate = selectedDate === cell.date ? null : cell.date"
                >
                  <span class="tabular-nums">{{ cell.day }}</span>
                  <span
                    v-if="cell.info"
                    class="mt-1 h-2 w-2 rounded-full"
                    :style="{ background: cell.info.colorHex, boxShadow: `0 0 8px ${cell.info.colorHex}` }"
                    :title="`${cell.info.count} 颗星`"
                  />
                </button>
              </div>
            </div>
          </div>

          <!-- 近 30 天成长曲线（原生 SVG） -->
          <div class="glass flex flex-col justify-between rounded-3xl p-5 sm:p-6">
            <div class="flex items-center justify-between">
              <h2 class="font-serif text-base tracking-wider text-amber-50">近 30 天微光轨迹</h2>
              <span class="text-xs text-slate-400">峰值 {{ chartGeometry.max }} 颗/日</span>
            </div>

            <div class="my-4 w-full">
              <svg viewBox="0 0 600 150" class="h-40 w-full overflow-visible">
                <defs>
                  <linearGradient id="starAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#ffd599" stop-opacity="0.45" />
                    <stop offset="100%" stop-color="#ffd599" stop-opacity="0" />
                  </linearGradient>
                </defs>
                <!-- 背景参考线 -->
                <line x1="14" y1="132" x2="586" y2="132" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 4" />
                <line x1="14" y1="75" x2="586" y2="75" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3 4" />
                <path :d="chartGeometry.area" fill="url(#starAreaGrad)" />
                <path :d="chartGeometry.line" fill="none" stroke="#ffd599" stroke-width="2.2" stroke-linecap="round" />
                <circle
                  v-for="pt in chartGeometry.points.filter((p) => p.count > 0)"
                  :key="pt.date"
                  :cx="pt.x"
                  :cy="pt.y"
                  r="3.6"
                  fill="#fff3d6"
                  stroke="#ffb86b"
                  stroke-width="1.5"
                >
                  <title>{{ pt.date }}：{{ pt.count }} 颗星</title>
                </circle>
              </svg>
              <div class="flex justify-between px-2 text-[11px] tabular-nums text-slate-500">
                <span>{{ overview.trend30Days[0]?.date }}</span>
                <span>{{ overview.trend30Days[14]?.date }}</span>
                <span>{{ overview.trend30Days[29]?.date }}</span>
              </div>
            </div>

            <!-- 一键生成月度微光回顾 -->
            <div class="border-t border-white/10 pt-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-medium text-amber-50">AI 月度微光回顾</div>
                  <div class="text-xs text-slate-400">基于近期星光生成专属关键词与温柔总结</div>
                </div>
                <button class="btn-primary shrink-0 !px-4 !py-2 !text-xs" :disabled="reviewLoading" @click="generateReview">
                  <LoaderCircle v-if="reviewLoading" class="h-3.5 w-3.5 animate-spin" />
                  <Sparkles v-else class="h-3.5 w-3.5" />
                  {{ review ? '重新生成' : '生成月度回顾' }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 月度微光回顾卡片 -->
        <Transition name="fade">
          <section
            v-if="review"
            class="glass mt-6 rounded-3xl border-amber-200/30 p-6 shadow-[0_0_60px_-24px_rgba(255,205,130,0.45)]"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <Sparkles class="h-4 w-4 text-amber-200" />
                <h3 class="font-serif text-base tracking-wider text-amber-50">{{ review.label }} · 微光回顾</h3>
              </div>
              <button class="btn-ghost !px-3 !py-1 !text-xs" @click="copyReview">
                <Copy class="h-3.5 w-3.5" /> 复制文案
              </button>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <span v-for="kw in review.keywords" :key="kw" class="chip border-amber-200/30 text-amber-100"># {{ kw }}</span>
            </div>
            <p class="mt-4 font-serif text-[15px] leading-relaxed text-slate-100">{{ review.summary }}</p>
          </section>
        </Transition>

        <!-- 我的星星列表 -->
        <section class="mt-8">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-serif text-base tracking-wider text-amber-50">
              我的星星
              <span class="ml-1 text-xs text-slate-400">({{ filteredStars.length }})</span>
            </h2>
            <button
              v-if="selectedDate"
              class="chip border-amber-200/35 text-amber-100 hover:bg-amber-200/15"
              @click="selectedDate = null"
            >
              筛选日期：{{ selectedDate }} · 清除
            </button>
          </div>

          <div v-if="!filteredStars.length" class="glass rounded-3xl py-12 text-center text-sm text-slate-400">
            {{ selectedDate ? `${selectedDate} 还没有点亮星星` : '你还没有点亮第一颗星，回星空写下今日微光吧 ✨' }}
          </div>

          <div v-else class="grid gap-4 md:grid-cols-2">
            <article v-for="s in filteredStars" :key="s.id" class="glass flex flex-col justify-between rounded-2xl p-5">
              <div>
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <span
                      class="chip"
                      :style="{ borderColor: hexAlpha(s.colorHex, 0.35), color: s.colorHex }"
                    >
                      <span class="h-2 w-2 rounded-full" :style="{ background: s.colorHex }" />
                      {{ EMOTION_META[s.emotion]?.label ?? s.emotion }}
                    </span>
                    <span v-if="s.constellation" class="chip">
                      <Orbit class="h-3 w-3" /> {{ s.constellation.name }}
                    </span>
                  </div>
                  <span class="text-xs text-slate-500">{{ relativeTime(s.createdAt) }}</span>
                </div>

                <p class="mt-3 font-serif text-[15px] leading-relaxed text-slate-100">「{{ s.content }}」</p>
                <p v-if="s.aiReply" class="mt-2.5 border-l-2 border-white/15 pl-3 text-xs leading-relaxed text-slate-300">
                  {{ s.aiReply }}
                </p>
              </div>

              <div class="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-xs text-slate-400">
                <span class="flex items-center gap-1 text-amber-100/80">
                  <Heart class="h-3.5 w-3.5" /> {{ s.lightCount }} 次点亮
                </span>

                <div class="flex items-center gap-3">
                  <button class="flex items-center gap-1 text-amber-200/90 hover:text-amber-100" @click="focusInSky(s.id)">
                    <MapPin class="h-3.5 w-3.5" /> 在星空中定位
                  </button>
                  <button
                    v-if="confirmDeleteId !== s.id"
                    class="flex items-center gap-1 text-slate-500 hover:text-rose-300"
                    @click="confirmDeleteId = s.id"
                  >
                    <Trash2 class="h-3.5 w-3.5" /> 删除
                  </button>
                  <span v-else class="flex items-center gap-1.5">
                    <button
                      class="rounded-full bg-rose-400/20 px-2.5 py-0.5 text-rose-100"
                      :disabled="deletingId === s.id"
                      @click="removeStar(s.id)"
                    >
                      确认
                    </button>
                    <button class="text-slate-400 hover:text-white" @click="confirmDeleteId = null">取消</button>
                  </span>
                </div>
              </div>
            </article>
          </div>
        </section>
      </template>

      <div v-else-if="loading" class="py-24 text-center text-sm text-slate-400">正在加载你的个人星图…</div>
    </div>

    <AuthModal />
    <ToastHost />
  </div>
</template>
