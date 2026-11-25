import { defineStore } from 'pinia'
import { ref } from 'vue'
import { setSoundEnabled } from '@/utils/sound'

export const useUiStore = defineStore('ui', () => {
  const authOpen = ref(false)
  const authMode = ref('guest') // guest | login | register
  const composeOpen = ref(false)
  const constellationOpen = ref(false)
  const microActionOpen = ref(false)
  const carePayload = ref(null)
  const soundOn = ref(false)
  const toasts = ref([])
  let afterAuth = null

  /** 打开登录框；after 为登录成功后的回调（如继续打开写星弹窗） */
  function openAuth(mode = 'guest', after = null) {
    authMode.value = mode
    afterAuth = after
    authOpen.value = true
  }

  function closeAuth() {
    authOpen.value = false
    afterAuth = null
  }

  function authSucceeded() {
    authOpen.value = false
    const fn = afterAuth
    afterAuth = null
    fn?.()
  }

  function openCare(payload) {
    carePayload.value = payload
  }

  function closeCare() {
    carePayload.value = null
  }

  function toast(message, type = 'info', duration = 2800) {
    const id = Date.now() + Math.random()
    toasts.value.push({ id, message, type })
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, duration)
  }

  function toggleSound() {
    soundOn.value = !soundOn.value
    setSoundEnabled(soundOn.value)
  }

  return {
    authOpen,
    authMode,
    composeOpen,
    constellationOpen,
    microActionOpen,
    carePayload,
    soundOn,
    toasts,
    openAuth,
    closeAuth,
    authSucceeded,
    openCare,
    closeCare,
    toast,
    toggleSound,
  }
})
