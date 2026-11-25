<script setup>
import { ref } from 'vue'
import { CheckCircle2, Circle, ListChecks, LoaderCircle, Send, Sparkles, X } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { useMicroActionStore } from '@/stores/microActions'
import { useUiStore } from '@/stores/ui'

const emit = defineEmits(['completed', 'blocked'])

const auth = useAuthStore()
const microStore = useMicroActionStore()
const ui = useUiStore()

const expandedId = ref(null)
const note = ref('')
const submittingId = ref(null)

function openAction(action) {
  if (action.completed) return
  if (!auth.isLoggedIn) {
    ui.openAuth('guest', () => microStore.fetchToday().catch(() => {}))
    return
  }
  if (expandedId.value === action.id) {
    expandedId.value = null
    return
  }
  expandedId.value = action.id
  note.value = ''
}

async function submit(action) {
  if (!auth.isLoggedIn) {
    ui.openAuth('guest', () => microStore.fetchToday().catch(() => {}))
    return
  }
  submittingId.value = action.id
  try {
    const res = await microStore.complete(action.id, note.value.trim())
    if (res.blocked) {
      ui.microActionOpen = false
      expandedId.value = null
      note.value = ''
      emit('blocked', res)
      return
    }
    expandedId.value = null
    note.value = ''
    ui.microActionOpen = false
    emit('completed', res.star)
  } catch (e) {
    ui.toast(e.message, 'error')
  } finally {
    submittingId.value = null
  }
}
</script>

<template>
  <Transition name="sheet">
    <aside
      v-if="ui.microActionOpen"
      class="glass fixed inset-x-0 bottom-0 z-40 flex max-h-[80vh] flex-col rounded-t-3xl px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 md:inset-x-auto md:bottom-6 md:left-6 md:top-24 md:max-h-none md:w-[370px] md:rounded-3xl md:p-6"
    >
      <div class="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15 md:hidden" />

      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <ListChecks class="h-4 w-4 text-amber-200" />
          <h2 class="font-serif text-base tracking-[0.2em] text-amber-50">每日微行动</h2>
        </div>
        <button class="icon-btn -mr-1" aria-label="关闭" @click="ui.microActionOpen = false">
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>1 分钟校园小善意，完成后自动点亮新星</span>
        <span class="tabular-nums text-amber-100">{{ microStore.completedCount }} / {{ microStore.totalCount }}</span>
      </div>

      <div class="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          class="h-full rounded-full bg-gradient-to-r from-amber-200 to-emerald-300 transition-all duration-500"
          :style="{ width: `${(microStore.completedCount / Math.max(1, microStore.totalCount)) * 100}%` }"
        />
      </div>

      <div class="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        <div
          v-for="action in microStore.actions"
          :key="action.id"
          class="rounded-2xl border p-4 transition"
          :class="
            action.completed
              ? 'border-emerald-300/20 bg-emerald-300/[0.05]'
              : 'border-white/10 bg-white/[0.03] hover:border-white/20'
          "
        >
          <div class="flex items-start gap-3">
            <CheckCircle2 v-if="action.completed" class="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <Circle v-else class="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium" :class="action.completed ? 'text-emerald-100' : 'text-slate-100'">
                {{ action.title }}
              </div>
              <p class="mt-1 text-xs leading-relaxed text-slate-400">{{ action.description }}</p>

              <div v-if="action.completed" class="mt-2.5 text-[11px] text-emerald-300/90">✨ 已完成并点亮星空</div>

              <div v-else class="mt-3">
                <button
                  v-if="expandedId !== action.id"
                  class="inline-flex items-center gap-1.5 rounded-full border border-amber-200/30 bg-amber-200/10 px-3 py-1 text-xs text-amber-100 transition hover:bg-amber-200/20"
                  @click="openAction(action)"
                >
                  <Sparkles class="h-3 w-3" /> 完成并点亮新星
                </button>

                <div v-else class="space-y-2.5 pt-1">
                  <textarea
                    v-model="note"
                    rows="2"
                    maxlength="200"
                    class="field !px-3 !py-2 text-xs"
                    placeholder="可选：写一句此刻的小感受（留空将使用默认温柔文案）"
                  />
                  <div class="flex items-center justify-end gap-2">
                    <button class="px-2 py-1 text-xs text-slate-400 hover:text-white" @click="expandedId = null">取消</button>
                    <button
                      class="btn-primary !px-3.5 !py-1.5 !text-xs"
                      :disabled="submittingId === action.id"
                      @click="submit(action)"
                    >
                      <LoaderCircle v-if="submittingId === action.id" class="h-3.5 w-3.5 animate-spin" />
                      <Send v-else class="h-3 w-3" />
                      一键打卡并点亮
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p v-if="!auth.isLoggedIn" class="pt-1 text-center text-[11px] text-slate-500">登录后即可打卡微行动并点亮你的专属星星</p>
      </div>
    </aside>
  </Transition>
</template>
