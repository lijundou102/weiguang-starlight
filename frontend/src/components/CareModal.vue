<script setup>
import { Copy, HeartHandshake, Phone } from '@lucide/vue'
import BaseModal from './BaseModal.vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

const isDialable = (phone) => /^[\d-]+$/.test(phone)

async function copyPhone(item) {
  try {
    await navigator.clipboard.writeText(item.phone)
    ui.toast(`已复制「${item.name}」联系方式`, 'info')
  } catch {
    ui.toast('复制失败，请手动记录号码', 'error')
  }
}
</script>

<template>
  <BaseModal :open="!!ui.carePayload" width="sm:max-w-md" @close="ui.closeCare">
    <div v-if="ui.carePayload" class="pt-1">
      <div class="mb-4 flex items-center gap-3">
        <div
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-200/20 bg-sky-300/10 text-sky-200"
        >
          <HeartHandshake class="h-5 w-5" />
        </div>
        <div>
          <p class="text-[11px] tracking-[0.25em] text-sky-200/70">微光守护</p>
          <h3 class="font-serif text-lg tracking-wider text-slate-100">你不必独自面对此刻</h3>
        </div>
      </div>

      <p class="rounded-2xl border border-sky-200/15 bg-sky-200/[0.06] px-4 py-3.5 font-serif text-[15px] leading-relaxed text-slate-100">
        {{ ui.carePayload.careMessage }}
      </p>

      <div class="mt-4 space-y-2.5">
        <div
          v-for="item in ui.carePayload.hotlines"
          :key="item.name"
          class="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
        >
          <div class="min-w-0">
            <div class="text-sm font-medium text-slate-100">{{ item.name }}</div>
            <div class="mt-0.5 text-xs text-slate-400">{{ item.desc }}</div>
            <div class="mt-1 font-mono text-sm text-sky-200">{{ item.phone }}</div>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <a
              v-if="isDialable(item.phone)"
              :href="`tel:${item.phone}`"
              class="inline-flex items-center gap-1 rounded-full border border-sky-200/30 bg-sky-300/15 px-3 py-1.5 text-xs text-sky-100 transition hover:bg-sky-300/25"
            >
              <Phone class="h-3.5 w-3.5" /> 拨打
            </a>
            <button
              class="icon-btn h-8 w-8 border border-white/10 bg-white/[0.04]"
              title="复制"
              @click="copyPhone(item)"
            >
              <Copy class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div class="mt-6 flex justify-end">
        <button class="btn-ghost w-full sm:w-auto" @click="ui.closeCare">我已收到，先休息一下</button>
      </div>
    </div>
  </BaseModal>
</template>
