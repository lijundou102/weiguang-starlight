<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { X } from '@lucide/vue'

const props = defineProps({
  open: Boolean,
  title: { type: String, default: '' },
  width: { type: String, default: 'sm:max-w-md' },
})
const emit = defineEmits(['close'])

function onKey(e) {
  if (e.key === 'Escape' && props.open) emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-6"
        @click.self="emit('close')"
      >
        <div
          class="glass modal-panel relative max-h-[90vh] w-full overflow-y-auto rounded-t-3xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-3xl sm:pb-6"
          :class="width"
          role="dialog"
          aria-modal="true"
        >
          <button class="icon-btn absolute right-3 top-3" aria-label="关闭" @click="emit('close')">
            <X class="h-4 w-4" />
          </button>
          <h2 v-if="title" class="mb-5 pr-8 font-serif text-lg tracking-wider text-amber-50">{{ title }}</h2>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
