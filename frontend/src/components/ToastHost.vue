<script setup>
import { useUiStore } from '@/stores/ui'
const ui = useUiStore()
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-20 z-[60] flex flex-col items-center gap-2 px-4 sm:top-24">
    <TransitionGroup name="toast">
      <div
        v-for="t in ui.toasts"
        :key="t.id"
        class="glass rounded-full px-4 py-2 text-sm"
        :class="{ 'text-emerald-100': t.type === 'success', 'text-rose-200': t.type === 'error', 'text-slate-200': t.type === 'info' }"
      >
        {{ t.message }}
      </div>
    </TransitionGroup>
  </div>
</template>
