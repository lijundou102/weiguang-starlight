<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronDown, LogOut, Monitor, Orbit, ShieldCheck, Sparkles, UserRound, Volume2, VolumeX } from '@lucide/vue'
import BrandLogo from './BrandLogo.vue'
import { useAuthStore } from '@/stores/auth'
import { useStarStore } from '@/stores/stars'
import { useUiStore } from '@/stores/ui'

const router = useRouter()
const auth = useAuthStore()
const starStore = useStarStore()
const ui = useUiStore()

const menuOpen = ref(false)
const menuRef = ref(null)

function onDocClick(e) {
  if (menuOpen.value && menuRef.value && !menuRef.value.contains(e.target)) menuOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocClick))

function toggleStarMapMode() {
  const next = !starStore.showConstellations
  starStore.showConstellations = next
  starStore.clearSelection()
  if (!next) {
    ui.constellationOpen = false
    starStore.setActiveConstellation(null)
  }
}

function go(path) {
  menuOpen.value = false
  router.push(path)
}

function logout() {
  menuOpen.value = false
  auth.logout()
  ui.toast('已退出登录，星空会一直在这里')
}
</script>

<template>
  <header
    class="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.9rem)] sm:px-7 sm:pt-6"
  >
    <div class="pointer-events-auto min-w-0 select-none">
      <h1 class="flex items-center gap-2 whitespace-nowrap font-serif text-base tracking-[0.16em] text-amber-50 sm:gap-2.5 sm:text-xl sm:tracking-[0.25em]">
        <BrandLogo :size="24" />
        微光星空
      </h1>
      <p class="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-400 sm:mt-1.5 sm:text-xs">
        <span
          class="h-1.5 w-1.5 shrink-0 rounded-full"
          :class="starStore.streamStatus === 'open' ? 'bg-emerald-300 shadow-[0_0_6px_#6ee7b7]' : 'bg-slate-500'"
          :title="starStore.streamStatus === 'open' ? '实时连接中' : '正在连接…'"
        />
        <span>
          <span class="tabular-nums text-amber-100">{{ starStore.total }}</span> 颗星
          <span v-if="starStore.todayCount" class="hidden text-slate-500 sm:inline">· 今日 +{{ starStore.todayCount }}</span>
          <span class="text-slate-500">
            · <span class="tabular-nums text-emerald-200/90">{{ starStore.onlineCount }}</span> 人同看
          </span>
        </span>
      </p>
    </div>

    <div class="pointer-events-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
      <button
        class="glass flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm text-slate-200 transition hover:text-white sm:h-10 sm:px-3.5"
        title="答辩公共大屏模式"
        @click="router.push('/bigscreen')"
      >
        <Monitor class="h-4 w-4 text-amber-200/90" />
        <span class="hidden sm:inline">大屏</span>
      </button>

      <button
        class="glass flex h-9 items-center gap-1 rounded-full px-2.5 text-xs transition sm:h-10 sm:gap-1.5 sm:px-3.5 sm:text-sm"
        :class="
          starStore.showConstellations
            ? 'border-[#ebd7a7]/50 bg-[#ebd7a7]/10 text-[#fff4d4]'
            : 'text-slate-200 hover:text-white'
        "
        :title="starStore.showConstellations ? '返回 3D 旋涡星系模式' : '切换为香槟金星座星图模式'"
        @click="toggleStarMapMode"
      >
        <Orbit class="h-4 w-4 text-[#ebd7a7]" />
        <span>{{ starStore.showConstellations ? '返回星系' : '星图模式' }}</span>
      </button>

      <button
        class="glass icon-btn h-9 w-9 sm:h-10 sm:w-10"
        :title="ui.soundOn ? '关闭音效' : '开启氛围音效'"
        :aria-pressed="ui.soundOn"
        @click="ui.toggleSound"
      >
        <Volume2 v-if="ui.soundOn" class="h-4 w-4 text-amber-100" />
        <VolumeX v-else class="h-4 w-4" />
      </button>

      <button
        v-if="!auth.isLoggedIn"
        class="glass h-9 rounded-full px-3 text-xs text-slate-200 transition hover:text-white sm:h-10 sm:px-4 sm:text-sm"
        @click="ui.openAuth('guest')"
      >
        登录
      </button>

      <div v-else ref="menuRef" class="relative">
        <button
          class="glass flex h-9 items-center gap-1.5 rounded-full pl-2.5 pr-2 text-xs text-slate-200 transition hover:text-white sm:h-10 sm:gap-2 sm:pl-3 sm:pr-2.5 sm:text-sm"
          @click="menuOpen = !menuOpen"
        >
          <UserRound class="h-4 w-4 text-amber-200/80" />
          <span class="max-w-14 truncate sm:max-w-24">{{ auth.user.nickname }}</span>
          <ChevronDown class="h-3.5 w-3.5 transition" :class="menuOpen && 'rotate-180'" />
        </button>
        <Transition name="toast">
          <div v-if="menuOpen" class="glass absolute right-0 mt-2 w-48 rounded-2xl p-1.5 text-sm">
            <div class="px-3 py-2 text-xs text-slate-400">
              @{{ auth.user.username }}
              <span v-if="auth.isAdmin" class="ml-1 rounded bg-amber-200/15 px-1.5 py-0.5 text-amber-200">管理员</span>
            </div>
            <button
              class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-slate-200 transition hover:bg-white/5 hover:text-white"
              @click="go('/profile')"
            >
              <Sparkles class="h-4 w-4 text-amber-200/80" /> 个人星图
            </button>
            <button
              v-if="auth.isAdmin"
              class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-slate-200 transition hover:bg-white/5 hover:text-white"
              @click="go('/admin')"
            >
              <ShieldCheck class="h-4 w-4 text-amber-200/80" /> 管理后台
            </button>
            <div class="my-1 border-t border-white/5" />
            <button
              class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-slate-300 transition hover:bg-white/5 hover:text-white"
              @click="logout"
            >
              <LogOut class="h-4 w-4" /> 退出登录
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </header>
</template>
