<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ListChecks, Sparkles } from '@lucide/vue'
import StarField from '@/components/StarField.vue'
import TopBar from '@/components/TopBar.vue'
import StarCard from '@/components/StarCard.vue'
import AuthModal from '@/components/AuthModal.vue'
import ComposeModal from '@/components/ComposeModal.vue'
import ReceiptCard from '@/components/ReceiptCard.vue'
import CareModal from '@/components/CareModal.vue'
import ConstellationDrawer from '@/components/ConstellationDrawer.vue'
import MicroActionDrawer from '@/components/MicroActionDrawer.vue'
import ToastHost from '@/components/ToastHost.vue'
import { useAuthStore } from '@/stores/auth'
import { useStarStore } from '@/stores/stars'
import { useMicroActionStore } from '@/stores/microActions'
import { useUiStore } from '@/stores/ui'
import { playChime } from '@/utils/sound'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const starStore = useStarStore()
const microStore = useMicroActionStore()
const ui = useUiStore()

const field = ref(null)
const receipt = ref(null)
let receiptTimer = null

async function applyFocusQuery() {
  const focusId = Number(route.query.focus)
  if (!Number.isInteger(focusId) || focusId <= 0) return
  if (!starStore.stars.some((s) => s.id === focusId)) return
  await nextTick()
  field.value?.focusStar(focusId)
  starStore.select(focusId).catch(() => {})
  router.replace({ path: '/', query: {} })
}

onMounted(async () => {
  await auth.init()
  starStore.connectStream()
  try {
    await Promise.all([
      starStore.fetchStars(),
      starStore.fetchConstellations(),
      starStore.fetchPresets(),
      microStore.fetchToday(),
    ])
    await applyFocusQuery()
  } catch (e) {
    ui.toast(`星空加载失败：${e.message}`, 'error', 5000)
  }
})

onBeforeUnmount(() => {
  starStore.disconnectStream()
  clearTimeout(receiptTimer)
})

// 账号切换：重置「已点亮」记录，刷新当前选中星与今日微行动完成态
watch(
  () => auth.user?.id,
  () => {
    starStore.resetLit()
    if (starStore.selectedId != null) starStore.refreshSelected().catch(() => {})
    microStore.fetchToday().catch(() => {})
  },
)

// 取消选中（关闭卡片 / 星星被删除）时相机回到全景
watch(
  () => starStore.selectedId,
  (id, old) => {
    if (id == null && old != null && !receipt.value) field.value?.resetView()
  },
)

// 他人发布的新星：轻提示
watch(
  () => starStore.lastStreamStar,
  (star) => {
    if (star && star.author?.id !== auth.user?.id) ui.toast(`✨ ${star.author?.nickname ?? '有人'} 点亮了一颗新星`)
  },
)

// SSE 收到新星座诞生
watch(
  () => starStore.lastNewConstellation,
  (c) => {
    if (c) ui.toast(`🌌 新星座「${c.name}」在夜空中诞生了！`, 'success', 4000)
  },
)

function onSelect(id) {
  ui.constellationOpen = false
  playChime('select')
  starStore.select(id).catch((e) => ui.toast(e.message, 'error'))
}

function onBlank() {
  if (starStore.selectedId != null) starStore.clearSelection()
}

function openCompose() {
  if (auth.isLoggedIn) ui.composeOpen = true
  else ui.openAuth('guest', () => (ui.composeOpen = true))
}

async function onPublished(star) {
  ui.composeOpen = false
  starStore.clearSelection()
  await nextTick()
  field.value?.focusStar(star.id)
  playChime('birth')
  clearTimeout(receiptTimer)
  receiptTimer = setTimeout(() => (receipt.value = star), 1700)
}

function onBlocked(payload) {
  // 高危危机拦截：不播放欢快星铃、不触发飞入动画，弹出沉静的微光守护卡片
  ui.openCare(payload)
}

function onFocusConstellation(id) {
  if (id == null) field.value?.resetView()
  else field.value?.focusConstellation(id)
}

function onSelectConstellationLabel(id) {
  starStore.clearSelection()
  starStore.setActiveConstellation(id)
  ui.constellationOpen = true
  field.value?.focusConstellation(id)
}

function closeReceipt() {
  receipt.value = null
  field.value?.resetView()
}
</script>

<template>
  <main class="night-sky relative h-full w-full overflow-hidden">
    <StarField
      ref="field"
      :stars="starStore.stars"
      :selected-id="starStore.selectedId"
      :constellations="starStore.constellations"
      :show-constellations="starStore.showConstellations"
      :active-constellation-id="starStore.activeConstellationId"
      @select="onSelect"
      @blank="onBlank"
      @select-constellation="onSelectConstellationLabel"
    />

    <TopBar />

    <!-- 左侧轻巧悬浮入口：每日微行动 -->
    <button
      v-if="!ui.microActionOpen"
      class="glass fixed left-4 top-28 z-30 flex items-center gap-2 rounded-full px-3.5 py-2 text-xs text-slate-200 transition hover:border-amber-200/40 hover:text-amber-50 sm:left-7 sm:top-28"
      @click="ui.microActionOpen = true"
    >
      <ListChecks class="h-3.5 w-3.5 text-amber-200" />
      <span>每日微行动</span>
      <span class="rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] tabular-nums text-amber-100">
        {{ microStore.completedCount }}/{{ microStore.totalCount }}
      </span>
    </button>

    <Transition name="fade">
      <p
        v-if="!starStore.loaded"
        class="pointer-events-none absolute inset-x-0 top-1/2 text-center font-serif text-sm tracking-[0.3em] text-slate-400"
      >
        正在点亮星空…
      </p>
    </Transition>

    <!-- 底部操作区 -->
    <div
      class="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:pb-8"
      :class="(starStore.selectedId != null || ui.constellationOpen || ui.microActionOpen) && 'max-md:hidden'"
    >
      <button
        class="light-btn pointer-events-auto flex items-center gap-2 rounded-full px-7 py-3.5 font-serif text-[15px] tracking-[0.2em] text-slate-900 transition active:scale-95"
        @click="openCompose"
      >
        <Sparkles class="h-4 w-4" />
        点亮一颗星
      </button>
      <p class="select-none text-[11px] tracking-wider text-slate-500/80">
        <span class="hidden sm:inline">拖动旋转 · 滚轮缩放 · 点击星星聆听善意</span>
        <span class="sm:hidden">单指旋转 · 双指缩放 · 轻触星星</span>
      </p>
    </div>

    <StarCard @close="starStore.clearSelection()" />
    <ConstellationDrawer @focus="onFocusConstellation" />
    <MicroActionDrawer @completed="onPublished" @blocked="onBlocked" />
    <ComposeModal @published="onPublished" @blocked="onBlocked" />
    <ReceiptCard :star="receipt" @close="closeReceipt" />
    <CareModal />
    <AuthModal />
    <ToastHost />
  </main>
</template>
