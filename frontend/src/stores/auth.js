import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as authApi from '@/api/auth'
import { tokenStorage } from '@/api/request'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(tokenStorage.get())
  const user = ref(null)
  const ready = ref(false)

  const isLoggedIn = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'ADMIN')

  function setSession({ token: t, user: u }) {
    token.value = t
    user.value = u
    tokenStorage.set(t)
  }

  /** 刷新页面时用本地 token 恢复登录态 */
  async function init() {
    if (!token.value) {
      ready.value = true
      return
    }
    try {
      user.value = await authApi.me()
    } catch (e) {
      if (e.code === 40100) logout()
    } finally {
      ready.value = true
    }
  }

  async function guestLogin(nickname) {
    setSession(await authApi.guestLogin(nickname))
  }

  async function login(username, password) {
    setSession(await authApi.login({ username, password }))
  }

  async function register(payload) {
    setSession(await authApi.register(payload))
  }

  function logout() {
    token.value = null
    user.value = null
    tokenStorage.clear()
  }

  return { token, user, ready, isLoggedIn, isAdmin, init, guestLogin, login, register, logout }
})
