<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { LoaderCircle, Sparkles } from '@lucide/vue'
import BaseModal from './BaseModal.vue'
import BrandLogo from './BrandLogo.vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const auth = useAuthStore()
const ui = useUiStore()

const form = reactive({ username: '', password: '', nickname: '', guestNickname: '' })
const error = ref('')
const loading = ref(false)
const isGuest = computed(() => ui.authMode === 'guest')
const isRegister = computed(() => ui.authMode === 'register')
const isDev = import.meta.env.DEV

watch(
  () => ui.authOpen,
  (open) => {
    if (open) {
      error.value = ''
      form.password = ''
    }
  },
)

function switchMode(mode) {
  ui.authMode = mode
  error.value = ''
}

function validate() {
  if (isGuest.value) {
    const nick = form.guestNickname.trim()
    if (nick.length < 2 || nick.length > 16) return '昵称需为 2-16 个字'
    return ''
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(form.username)) return '用户名需为 3-20 位字母、数字或下划线'
  if (form.password.length < 6 || form.password.length > 64) return '密码长度需为 6-64 位'
  if (isRegister.value && form.nickname.trim().length > 20) return '昵称最多 20 个字符'
  return ''
}

async function submit() {
  error.value = validate()
  if (error.value) return
  loading.value = true
  try {
    if (isGuest.value) {
      await auth.guestLogin(form.guestNickname.trim())
    } else if (isRegister.value) {
      await auth.register({
        username: form.username,
        password: form.password,
        nickname: form.nickname.trim() || undefined,
      })
    } else {
      await auth.login(form.username, form.password)
    }
    ui.toast(`欢迎来到微光星空，${auth.user.nickname}`, 'success')
    ui.authSucceeded()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <BaseModal :open="ui.authOpen" @close="ui.closeAuth">
    <div class="mb-5 flex items-center gap-2.5">
      <BrandLogo :size="32" />
      <div>
        <div class="font-serif text-base tracking-[0.22em] text-amber-50">微光星空</div>
        <div class="text-[10px] tracking-[0.28em] text-[#ebd7a7]/60">WEIGUANG STARLIGHT</div>
      </div>
    </div>

    <div class="mb-6 flex gap-5 font-serif text-base sm:text-lg">
      <button
        v-for="m in [
          ['guest', '快速体验'],
          ['login', '账号登录'],
          ['register', '注册'],
        ]"
        :key="m[0]"
        class="relative pb-1.5 tracking-wider transition"
        :class="ui.authMode === m[0] ? 'text-amber-50' : 'text-slate-500 hover:text-slate-300'"
        @click="switchMode(m[0])"
      >
        {{ m[1] }}
        <span
          v-if="ui.authMode === m[0]"
          class="absolute inset-x-1 -bottom-0.5 h-px bg-gradient-to-r from-transparent via-amber-200 to-transparent"
        />
      </button>
    </div>

    <form v-if="isGuest" class="space-y-3" @submit.prevent="submit">
      <p class="text-xs leading-relaxed text-slate-400">
        免注册，只需填一个昵称即可立即亮星、点亮祝福和写下星语回响 ✨
      </p>
      <input
        v-model="form.guestNickname"
        class="field"
        placeholder="取个星空昵称（2-16 字，如：晚风里的猫）"
        maxlength="16"
        autocomplete="nickname"
      />
      <p v-if="error" class="text-xs text-rose-300">{{ error }}</p>
      <button type="submit" class="btn-primary w-full !py-3" :disabled="loading">
        <LoaderCircle v-if="loading" class="h-4 w-4 animate-spin" />
        <Sparkles v-else class="h-4 w-4" />
        立即进入星空
      </button>
    </form>

    <form v-else class="space-y-3" @submit.prevent="submit">
      <input v-model.trim="form.username" class="field" placeholder="用户名（3-20 位字母/数字/下划线）" autocomplete="username" />
      <input
        v-model="form.password"
        class="field"
        type="password"
        placeholder="密码（至少 6 位）"
        :autocomplete="isRegister ? 'new-password' : 'current-password'"
      />
      <input v-if="isRegister" v-model="form.nickname" class="field" placeholder="昵称（可选，展示在你的星星上）" maxlength="20" />

      <p v-if="error" class="text-xs text-rose-300">{{ error }}</p>

      <button type="submit" class="btn-primary w-full !py-3" :disabled="loading">
        <LoaderCircle v-if="loading" class="h-4 w-4 animate-spin" />
        {{ isRegister ? '注册并进入星空' : '登录' }}
      </button>
    </form>

    <div v-if="isDev && !isGuest" class="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-3 text-xs leading-relaxed text-slate-400">
      🧪 开发环境测试体验：可直接注册一个新账号，或使用管理员账号
      <code class="text-amber-100/90">admin / admin123456</code>
    </div>
  </BaseModal>
</template>
