<script setup>
import { Eye, EyeOff, Orbit, Sparkles, X } from '@lucide/vue'
import { useStarStore } from '@/stores/stars'
import { useUiStore } from '@/stores/ui'

const emit = defineEmits(['focus'])
const starStore = useStarStore()
const ui = useUiStore()

function focus(c) {
  if (starStore.activeConstellationId === c.id) {
    starStore.setActiveConstellation(null)
    emit('focus', null)
    return
  }
  starStore.setActiveConstellation(c.id)
  emit('focus', c.id)
}

function close() {
  ui.constellationOpen = false
  if (starStore.activeConstellationId != null) {
    starStore.setActiveConstellation(null)
    emit('focus', null)
  }
}
</script>

<template>
  <Transition name="sheet">
    <aside
      v-if="ui.constellationOpen"
      class="glass fixed inset-x-0 bottom-0 z-40 flex max-h-[78vh] flex-col rounded-t-3xl px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 md:inset-x-auto md:bottom-6 md:right-6 md:top-20 md:max-h-none md:w-[370px] md:rounded-3xl md:p-6"
    >
      <div class="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15 md:hidden" />

      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <Orbit class="h-4 w-4 text-amber-200" />
          <h2 class="font-serif text-base tracking-[0.2em] text-amber-50">星座图鉴</h2>
          <span class="text-xs text-slate-400">({{ starStore.constellations.length }})</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition"
            :class="
              starStore.showConstellations
                ? 'border-[#ebd7a7]/45 bg-[#ebd7a7]/10 text-[#fff4d4]'
                : 'border-white/10 bg-white/5 text-slate-400 hover:text-slate-200'
            "
            @click="starStore.toggleConstellations"
          >
            <Eye v-if="starStore.showConstellations" class="h-3.5 w-3.5" />
            <EyeOff v-else class="h-3.5 w-3.5" />
            {{ starStore.showConstellations ? '星图模式' : '星系模式' }}
          </button>
          <button class="icon-btn -mr-1" aria-label="关闭" @click="close">
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <p class="mt-2 text-xs leading-relaxed text-slate-400">
        同一主题汇聚满 5 颗微光星，AI 会将它们连成专属星座。点击任意星座可飞往该星域并高亮连线。
      </p>

      <div class="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        <button
          v-for="c in starStore.constellations"
          :key="c.id"
          class="w-full rounded-2xl border p-4 text-left transition"
          :class="
            starStore.activeConstellationId === c.id
              ? 'border-amber-200/45 bg-amber-200/[0.09] shadow-[0_0_24px_-10px_rgba(255,214,150,0.45)]'
              : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
          "
          @click="focus(c)"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <Sparkles class="h-3.5 w-3.5 text-amber-200/90" />
              <span class="font-serif text-[15px] tracking-wider text-amber-50">{{ c.name }}</span>
            </div>
            <div class="flex items-center gap-2 text-[11px] text-slate-400">
              <span class="rounded-full border border-white/10 px-2 py-0.5 text-slate-300">{{ c.themeTag }}</span>
              <span class="tabular-nums">{{ c.starCount }} 颗星</span>
            </div>
          </div>
          <p class="mt-2.5 text-xs leading-relaxed text-slate-300/90">{{ c.story }}</p>
        </button>

        <p v-if="!starStore.constellations.length" class="py-10 text-center text-xs text-slate-500">
          暂无已成座的星群，点亮更多星星即可解锁新星座 ✨
        </p>
      </div>
    </aside>
  </Transition>
</template>
