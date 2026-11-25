<script setup>
import { computed } from 'vue'
import { Orbit, Share2 } from '@lucide/vue'
import BaseModal from './BaseModal.vue'
import { useUiStore } from '@/stores/ui'
import { EMOTION_META, hexAlpha } from '@/utils/format'

const props = defineProps({ star: { type: Object, default: null } })
const emit = defineEmits(['close'])
const ui = useUiStore()

const emotion = computed(() => EMOTION_META[props.star?.emotion] ?? { label: '', color: '#ffffff' })

async function share() {
  const s = props.star
  const text = `我在「微光星空」点亮了一颗${emotion.value.label}的星：「${s.content}」\n星语：${s.aiReply}`
  try {
    if (navigator.share) {
      await navigator.share({ title: '微光星空', text, url: location.origin })
    } else {
      await navigator.clipboard.writeText(`${text}\n${location.origin}`)
      ui.toast('星语已复制，去分享这份微光吧', 'success')
    }
  } catch (e) {
    if (e?.name !== 'AbortError') ui.toast('分享失败，请稍后再试', 'error')
  }
}
</script>

<template>
  <BaseModal :open="!!star" width="sm:max-w-sm" @close="emit('close')">
    <div v-if="star" class="flex flex-col items-center pt-2 text-center">
      <div class="relative mb-5 h-20 w-20">
        <div
          class="orb-pulse absolute inset-0 rounded-full"
          :style="{
            background: `radial-gradient(circle, #fff 0%, ${emotion.color} 28%, ${hexAlpha(emotion.color, 0.25)} 55%, transparent 72%)`,
            boxShadow: `0 0 60px ${hexAlpha(emotion.color, 0.55)}`,
          }"
        />
      </div>

      <p class="text-[11px] tracking-[0.3em] text-slate-400">你的星星已升起</p>
      <h3 class="mt-2 font-serif text-xl tracking-wider" :style="{ color: emotion.color }">一颗{{ emotion.label }}的星</h3>
      <p v-if="star.constellation" class="mt-2 flex items-center gap-1 text-xs text-slate-400">
        <Orbit class="h-3 w-3" /> 加入了「{{ star.constellation.name }}」
      </p>

      <div class="mt-5 w-full rounded-2xl bg-white/[0.04] px-5 py-4" :style="{ boxShadow: `inset 0 0 0 1px ${hexAlpha(emotion.color, 0.18)}` }">
        <p class="font-serif text-[15px] leading-relaxed text-slate-100">{{ star.aiReply }}</p>
        <p class="mt-3 line-clamp-2 text-xs text-slate-500">—— 关于「{{ star.content }}」</p>
      </div>

      <div class="mt-6 flex w-full gap-2">
        <button class="btn-ghost flex-1" @click="share"><Share2 class="h-4 w-4" /> 分享</button>
        <button class="btn-primary flex-1" @click="emit('close')">留念并关闭</button>
      </div>
    </div>
  </BaseModal>
</template>
