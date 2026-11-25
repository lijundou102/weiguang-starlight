<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QRCode from 'qrcode'
import { ArrowLeft, Maximize2, Minimize2, Orbit, QrCode, Sparkles, UserRound, Volume2, VolumeX } from '@lucide/vue'
import StarField from '@/components/StarField.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import { useStarStore } from '@/stores/stars'
import { useUiStore } from '@/stores/ui'
import { playChime } from '@/utils/sound'
import { EMOTION_META, hexAlpha } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const starStore = useStarStore()
const ui = useUiStore()

const field = ref(null)
const isFullscreen = ref(false)
const qrDataUrl = ref('')
const spotlightStar = ref(null)
const newConstellationBanner = ref(null)

const queue = []
let processing = false
let spotlightTimer = null
let constellationTimer = null
let mounted = true

const qrTargetUrl = computed(() => {
  const custom = typeof route.query.qrUrl === 'string' && route.query.qrUrl.trim()
  return custom || window.location.origin
})

const spotlightEmotion = computed(() => EMOTION_META[spotlightStar.value?.emotion] ?? { label: '温暖', color: '#FFB86B' })

async function renderQr() {
  try {
    qrDataUrl.value = await QRCode.toDataURL(qrTargetUrl.value, {
      width: 176,
      margin: 1,
      color: { dark: '#0b1024', light: '#fff9ee' },
    })
  } catch (e) {
    console.warn('[BigScreen] QR render failed:', e)
  }
}

async function processQueue() {
  if (processing || !queue.length || !mounted) return
  processing = true

  while (queue.length && mounted) {
    const star = queue.shift()
    await nextTick()
    field.value?.focusStar(star.id)
    playChime('birth')
    spotlightStar.value = star

    await new Promise((resolve) => {
      spotlightTimer = setTimeout(resolve, 6000)
    })

    if (!mounted) break
    spotlightStar.value = null
    // 队列还有下一颗时留出 450ms 卡片淡出间隔，否则回到全景缓慢巡航
    if (queue.length) {
      await new Promise((resolve) => {
        spotlightTimer = setTimeout(resolve, 450)
      })
    } else {
      field.value?.resetView()
    }
  }

  processing = false
}

watch(
  () => starStore.lastStreamStar,
  (star) => {
    if (!star) return
    if (!queue.some((s) => s.id === star.id) && spotlightStar.value?.id !== star.id) {
      queue.push(star)
      processQueue()
    }
  },
)

watch(
  () => starStore.lastNewConstellation,
  (c) => {
    if (!c) return
    const prevShow = starStore.showConstellations
    newConstellationBanner.value = c
    starStore.setActiveConstellation(c.id)
    if (!spotlightStar.value) field.value?.focusConstellation(c.id)
    clearTimeout(constellationTimer)
    constellationTimer = setTimeout(() => {
      newConstellationBanner.value = null
      starStore.setActiveConstellation(null)
      if (!prevShow) starStore.showConstellations = false
      if (!spotlightStar.value) field.value?.resetView()
    }, 6500)
  },
)

function onFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
    else await document.exitFullscreen()
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  starStore.showConstellations = false
  starStore.clearSelection()
  starStore.connectStream()
  document.addEventListener('fullscreenchange', onFullscreenChange)
  await Promise.all([starStore.fetchStars(), starStore.fetchConstellations(), renderQr()])
})

onBeforeUnmount(() => {
  mounted = false
  clearTimeout(spotlightTimer)
  clearTimeout(constellationTimer)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  starStore.setActiveConstellation(null)
  starStore.disconnectStream()
})
</script>

<template>
  <main class="night-sky relative h-full w-full overflow-hidden select-none">
    <StarField
      ref="field"
      :stars="starStore.stars"
      :selected-id="spotlightStar?.id ?? null"
      :constellations="starStore.constellations"
      :show-constellations="starStore.showConstellations"
      :active-constellation-id="starStore.activeConstellationId"
    />

    <!-- 左上角悬停热区：鼠标移入时淡入极轻控制浮条 -->
    <div class="group fixed left-0 top-0 z-40 h-24 w-80 p-5">
      <div
        class="glass flex w-fit items-center gap-1.5 rounded-full px-2 py-1.5 opacity-15 transition duration-300 group-hover:opacity-100"
      >
        <button
          class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 hover:text-white"
          @click="router.push('/')"
        >
          <ArrowLeft class="h-3.5 w-3.5" /> 返回主页
        </button>
        <button
          class="icon-btn h-8 w-8"
          :class="starStore.showConstellations && 'text-[#ebd7a7]'"
          :title="starStore.showConstellations ? '返回星系模式' : '切换星图模式'"
          @click="starStore.toggleConstellations"
        >
          <Orbit class="h-4 w-4" />
        </button>
        <button
          class="icon-btn h-8 w-8"
          :title="isFullscreen ? '退出全屏' : '浏览器全屏'"
          @click="toggleFullscreen"
        >
          <Minimize2 v-if="isFullscreen" class="h-4 w-4" />
          <Maximize2 v-else class="h-4 w-4" />
        </button>
        <button
          class="icon-btn h-8 w-8"
          :title="ui.soundOn ? '关闭音效' : '开启氛围音效'"
          @click="ui.toggleSound"
        >
          <Volume2 v-if="ui.soundOn" class="h-4 w-4 text-amber-100" />
          <VolumeX v-else class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- 顶部居中实时横幅 -->
    <header class="pointer-events-none fixed inset-x-0 top-6 z-30 flex flex-col items-center gap-3 px-4">
      <h1 class="flex items-center gap-3 font-serif text-3xl tracking-[0.35em] text-amber-50 drop-shadow-[0_0_24px_rgba(255,214,150,0.45)] sm:text-4xl">
        <BrandLogo :size="40" />
        微光星空
      </h1>
      <div class="glass flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-full px-5 py-2 text-xs text-slate-300 sm:text-sm">
        <span class="flex items-center gap-2">
          <span
            class="h-2 w-2 rounded-full"
            :class="starStore.streamStatus === 'open' ? 'bg-emerald-300 shadow-[0_0_8px_#6ee7b7]' : 'bg-slate-500'"
          />
          已汇聚 <strong class="font-serif text-base tabular-nums text-amber-100">{{ starStore.total }}</strong> 颗微光
        </span>
        <span class="text-white/15">·</span>
        <span>
          今日点亮 <strong class="font-serif text-base tabular-nums text-amber-100">{{ starStore.todayCount }}</strong> 颗
        </span>
        <span class="text-white/15">·</span>
        <span>
          <strong class="font-serif text-base tabular-nums text-amber-100">{{ starStore.constellations.length }}</strong> 座星座
        </span>
        <span class="text-white/15">·</span>
        <span>
          此刻 <strong class="font-serif text-base tabular-nums text-emerald-200">{{ starStore.onlineCount }}</strong> 人同看星空
        </span>
      </div>

      <!-- 新星座诞生柔光横幅 -->
      <Transition name="toast">
        <div
          v-if="newConstellationBanner"
          class="glass mt-1 flex items-center gap-3 rounded-2xl border-amber-200/35 px-5 py-3 text-sm text-amber-50 shadow-[0_0_40px_-8px_rgba(255,214,150,0.6)]"
        >
          <Orbit class="h-5 w-5 text-amber-200" />
          <div>
            <div class="font-serif tracking-wider">新星座「{{ newConstellationBanner.name }}」诞生</div>
            <div class="mt-0.5 max-w-lg text-xs text-slate-300">{{ newConstellationBanner.story }}</div>
          </div>
        </div>
      </Transition>
    </header>

    <!-- 左侧新星聚焦高光卡片（SSE 队列依次滑出 6 秒） -->
    <Transition name="fade">
      <section
        v-if="spotlightStar"
        :key="spotlightStar.id"
        class="glass fixed bottom-10 left-8 z-30 w-[min(460px,calc(100vw-4rem))] rounded-3xl p-7"
        :style="{
          boxShadow: `0 0 90px -24px ${hexAlpha(spotlightEmotion.color, 0.55)}, inset 0 1px 0 rgba(255,255,255,.08)`,
        }"
      >
        <div class="flex items-center gap-2.5">
          <span
            class="chip !px-3 !py-1 !text-xs"
            :style="{ borderColor: hexAlpha(spotlightEmotion.color, 0.45), color: spotlightEmotion.color }"
          >
            <span
              class="h-2.5 w-2.5 rounded-full"
              :style="{ background: spotlightEmotion.color, boxShadow: `0 0 10px ${spotlightEmotion.color}` }"
            />
            刚刚点亮 · {{ spotlightEmotion.label }}
          </span>
          <span v-if="spotlightStar.constellation" class="chip">
            <Orbit class="h-3.5 w-3.5" /> {{ spotlightStar.constellation.name }}
          </span>
        </div>

        <p class="mt-5 font-serif text-2xl leading-relaxed text-slate-50">
          「{{ spotlightStar.content }}」
        </p>

        <div
          v-if="spotlightStar.aiReply"
          class="mt-5 rounded-2xl border-l-2 bg-white/[0.05] px-5 py-4"
          :style="{ borderColor: spotlightEmotion.color }"
        >
          <div class="mb-1.5 flex items-center gap-1.5 text-xs tracking-[0.2em] text-slate-400">
            <Sparkles class="h-3.5 w-3.5" :style="{ color: spotlightEmotion.color }" /> AI 星语回应
          </div>
          <p class="text-base leading-relaxed text-slate-100">{{ spotlightStar.aiReply }}</p>
        </div>

        <div class="mt-5 flex items-center justify-between text-xs text-slate-400">
          <span class="flex items-center gap-1.5">
            <UserRound class="h-3.5 w-3.5 text-amber-200/80" />
            {{ spotlightStar.author?.nickname ?? '校园星友' }}
          </span>
          <span class="tracking-widest text-amber-100/70">WEIGUANG STARLIGHT</span>
        </div>
      </section>
    </Transition>

    <!-- 右下角扫码点亮卡片 -->
    <aside class="glass fixed bottom-7 right-7 z-30 flex items-center gap-4 rounded-3xl p-4">
      <div class="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-[#fff9ee] p-1.5 shadow-inner">
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="扫码点亮一颗星" class="h-full w-full object-contain" />
        <div v-else class="flex h-full w-full items-center justify-center text-slate-700">
          <QrCode class="h-8 w-8" />
        </div>
      </div>
      <div class="max-w-40 pr-1">
        <div class="flex items-center gap-1.5 font-serif text-base tracking-wider text-amber-50">
          <Sparkles class="h-4 w-4 text-amber-200" /> 扫码点亮
        </div>
        <p class="mt-1.5 text-xs leading-relaxed text-slate-300">
          扫码写下小善意 · 现场点亮一颗星
        </p>
        <p class="mt-2 truncate text-[10px] text-slate-500" :title="qrTargetUrl">{{ qrTargetUrl }}</p>
      </div>
    </aside>
  </main>
</template>
