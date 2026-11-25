<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Lightbulb, LoaderCircle, Send, Shuffle } from '@lucide/vue'
import BaseModal from './BaseModal.vue'
import { useStarStore } from '@/stores/stars'
import { useUiStore } from '@/stores/ui'

const emit = defineEmits(['published', 'blocked'])
const starStore = useStarStore()
const ui = useUiStore()

const MIN = 5
const MAX = 200
const PROMPTS = [
  '今天有谁对你笑了一下吗？',
  '食堂、图书馆或路上，有没有一个让你心头一暖的瞬间？',
  '最近有人帮了你一个小忙吗？',
  '今天的天空是什么颜色的？',
  '你今天为别人做了什么小小的好事？',
  '有没有一件小事，让你觉得"今天真不错"？',
  '最近有什么让你偷偷开心了很久？',
]

const content = ref('')
const loading = ref(false)
const error = ref('')
const promptIdx = ref(0)
const textarea = ref(null)

const len = computed(() => content.value.trim().length)
const valid = computed(() => len.value >= MIN && len.value <= MAX)

watch(
  () => ui.composeOpen,
  async (open) => {
    if (!open) return
    error.value = ''
    promptIdx.value = Math.floor(Math.random() * PROMPTS.length)
    await nextTick()
    textarea.value?.focus()
  },
)

function nextPrompt() {
  promptIdx.value = (promptIdx.value + 1) % PROMPTS.length
}

async function submit() {
  if (!valid.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const res = await starStore.publish(content.value.trim())
    if (res.blocked) {
      content.value = ''
      ui.composeOpen = false
      emit('blocked', res)
      return
    }
    if (res.status !== 'APPROVED') {
      error.value = '这颗星还需要再温柔一点点，换个说法试试吧'
      return
    }
    content.value = ''
    emit('published', res)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function onKeydown(e) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
}
</script>

<template>
  <BaseModal :open="ui.composeOpen" title="写下今日微光" @close="ui.composeOpen = false">
    <div class="mb-3 flex items-start gap-2 rounded-xl bg-amber-200/[0.06] px-3 py-2.5 text-xs text-amber-100/80">
      <Lightbulb class="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span class="flex-1">{{ PROMPTS[promptIdx] }}</span>
      <button class="shrink-0 text-amber-100/60 transition hover:text-amber-50" title="换一个" @click="nextPrompt">
        <Shuffle class="h-3.5 w-3.5" />
      </button>
    </div>

    <div class="relative">
      <textarea
        ref="textarea"
        v-model="content"
        :maxlength="MAX"
        rows="5"
        class="field resize-none font-serif text-[15px] leading-relaxed"
        placeholder="把今天遇到的小确幸、小善意写下来，它会变成星空里的一颗星…"
        @keydown="onKeydown"
      />
      <span
        class="absolute bottom-3 right-3 text-[11px] tabular-nums"
        :class="len > 0 && len < MIN ? 'text-amber-300/80' : len >= MAX ? 'text-rose-300' : 'text-slate-500'"
      >
        {{ len }} / {{ MAX }}
      </span>
    </div>

    <p class="mt-2 min-h-4 text-xs" :class="error ? 'text-rose-300' : 'text-slate-500'">
      {{ error || (len > 0 && len < MIN ? `再多写 ${MIN - len} 个字吧` : '⌘/Ctrl + Enter 快速发布') }}
    </p>

    <div class="mt-4 flex justify-end gap-2">
      <button class="btn-ghost" @click="ui.composeOpen = false">再想想</button>
      <button class="btn-primary" :disabled="!valid || loading" @click="submit">
        <LoaderCircle v-if="loading" class="h-4 w-4 animate-spin" />
        <Send v-else class="h-4 w-4" />
        {{ loading ? '星星正在诞生…' : '点亮它' }}
      </button>
    </div>
  </BaseModal>
</template>
