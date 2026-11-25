<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Check, Clock, Heart, LoaderCircle, MessageCircle, Orbit, Send, Sparkles, Trash2, UserRound, X } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { useStarStore } from '@/stores/stars'
import { useUiStore } from '@/stores/ui'
import { playChime } from '@/utils/sound'
import { EMOTION_META, hexAlpha, relativeTime } from '@/utils/format'

const emit = defineEmits(['close'])

const auth = useAuthStore()
const starStore = useStarStore()
const ui = useUiStore()

const star = computed(() => starStore.selected)
const lit = computed(() => !!star.value && starStore.isLit(star.value.id))
const emotion = computed(() => EMOTION_META[star.value?.emotion] ?? { label: '', color: '#fff' })
const canDeleteStar = computed(
  () => !!auth.user && !!star.value && (auth.isAdmin || star.value.author?.id === auth.user.id),
)

const sending = ref(null)
const confirming = ref(false)
const deleting = ref(false)

const commentText = ref('')
const commentSending = ref(false)
const deletingCommentId = ref(null)
const commentListRef = ref(null)

function canDeleteComment(c) {
  if (!auth.user || !star.value) return false
  return auth.isAdmin || c.author?.id === auth.user.id || star.value.author?.id === auth.user.id
}

async function scrollCommentsToBottom() {
  await nextTick()
  if (commentListRef.value) {
    commentListRef.value.scrollTop = commentListRef.value.scrollHeight
  }
}

watch(
  () => star.value?.id,
  () => {
    confirming.value = false
    commentText.value = ''
  },
)

// 收到他人实时留言：自动滚动到底部并播放轻柔提示音
watch(
  () => starStore.lastNewComment,
  (evt) => {
    if (!evt || evt.starId !== star.value?.id) return
    scrollCommentsToBottom()
    if (evt.comment?.author?.id !== auth.user?.id) {
      playChime('comment')
    }
  },
)

async function sendPreset(preset) {
  const id = star.value.id
  if (!auth.isLoggedIn) {
    ui.openAuth('guest', () => starStore.refreshSelected().catch(() => {}))
    return
  }
  if (lit.value) {
    ui.toast('你已经点亮过这颗星星啦，心意已收到 ✨')
    return
  }
  sending.value = preset.id
  try {
    const res = await starStore.encourage(id, preset.id)
    if (res.ok) {
      playChime('encourage')
      ui.toast(`已送出「${preset.text}」`, 'success')
    } else {
      ui.toast('你之前已经为这颗星送过祝福啦，它记得你 ✨')
    }
  } catch (e) {
    ui.toast(e.message, 'error')
  } finally {
    sending.value = null
  }
}

function onCommentFocus() {
  if (!auth.isLoggedIn) {
    ui.openAuth('guest', () => starStore.refreshSelected().catch(() => {}))
  }
}

async function submitComment() {
  if (!star.value || commentSending.value) return
  if (!auth.isLoggedIn) {
    ui.openAuth('guest', () => starStore.refreshSelected().catch(() => {}))
    return
  }
  const text = commentText.value.trim()
  if (text.length < 2) {
    ui.toast('留言至少写 2 个字吧', 'info')
    return
  }
  commentSending.value = true
  try {
    const res = await starStore.addComment(star.value.id, text)
    if (res.blocked) {
      commentText.value = ''
      if (res.riskLevel === 'CRISIS') {
        ui.openCare(res)
      } else {
        ui.toast(res.message || '这片星空希望保持温柔，换一句更友善的话再发吧', 'info', 3500)
      }
      return
    }
    commentText.value = ''
    playChime('comment')
    await scrollCommentsToBottom()
  } catch (e) {
    ui.toast(e.message, 'error')
  } finally {
    commentSending.value = false
  }
}

async function removeComment(c) {
  if (!star.value) return
  deletingCommentId.value = c.id
  try {
    await starStore.removeComment(star.value.id, c.id)
    ui.toast('留言已删除')
  } catch (e) {
    ui.toast(e.message, 'error')
  } finally {
    deletingCommentId.value = null
  }
}

async function confirmDelete() {
  deleting.value = true
  try {
    await starStore.remove(star.value.id)
    ui.toast('这颗星已悄悄熄灭')
  } catch (e) {
    ui.toast(e.message, 'error')
  } finally {
    deleting.value = false
    confirming.value = false
  }
}
</script>

<template>
  <Transition name="sheet">
    <aside
      v-if="star"
      :key="star.id"
      class="glass fixed inset-x-0 bottom-0 z-40 flex max-h-[84vh] flex-col rounded-t-3xl px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 md:inset-x-auto md:bottom-6 md:right-6 md:top-20 md:max-h-none md:w-[400px] md:rounded-3xl md:p-5"
      :style="{ boxShadow: `0 0 80px -30px ${hexAlpha(emotion.color, 0.45)}, inset 0 1px 0 rgba(255,255,255,.06)` }"
    >
      <div class="mx-auto mb-2.5 h-1 w-10 shrink-0 rounded-full bg-white/15 md:hidden" />

      <!-- 头部：情绪 + 星座 -->
      <div class="flex shrink-0 items-center gap-2">
        <span class="chip" :style="{ borderColor: hexAlpha(emotion.color, 0.35), color: emotion.color }">
          <span class="h-2 w-2 rounded-full" :style="{ background: emotion.color, boxShadow: `0 0 8px ${emotion.color}` }" />
          {{ emotion.label }}
        </span>
        <span v-if="star.constellation" class="chip">
          <Orbit class="h-3 w-3" /> {{ star.constellation.name }}
        </span>
        <button class="icon-btn -mr-2 ml-auto" aria-label="关闭" @click="emit('close')">
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- 中部可滚动主体 -->
      <div class="mt-3 flex-1 overflow-y-auto pr-1">
        <!-- 小善意 -->
        <p class="font-serif text-[16px] leading-relaxed text-slate-50">「{{ star.content }}」</p>

        <!-- AI 星语 -->
        <div
          v-if="star.aiReply"
          class="mt-3.5 rounded-2xl border-l-2 bg-white/[0.04] px-3.5 py-2.5"
          :style="{ borderColor: emotion.color }"
        >
          <div class="mb-1 flex items-center gap-1.5 text-[11px] tracking-widest text-slate-400">
            <Sparkles class="h-3 w-3" :style="{ color: emotion.color }" /> AI 星语
          </div>
          <p class="text-xs leading-relaxed text-slate-200 sm:text-sm">{{ star.aiReply }}</p>
        </div>

        <!-- 元信息 -->
        <div class="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-400">
          <span class="flex items-center gap-1"><UserRound class="h-3.5 w-3.5" /> {{ star.author?.nickname ?? '匿名星友' }}</span>
          <span class="flex items-center gap-1"><Clock class="h-3.5 w-3.5" /> {{ relativeTime(star.createdAt) }}</span>
          <span class="flex items-center gap-1 text-amber-100/90">
            <Heart class="h-3.5 w-3.5" :class="lit && 'fill-current'" /> 被点亮
            <span class="tabular-nums">{{ star.lightCount }}</span> 次
          </span>
        </div>

        <!-- 预设鼓励语 -->
        <div class="mt-4 border-t border-white/5 pt-3.5">
          <div class="mb-2 flex items-center justify-between text-xs">
            <span class="text-slate-400">送一句鼓励，点亮这颗星</span>
            <span v-if="lit" class="flex items-center gap-1 text-emerald-300/90"><Check class="h-3.5 w-3.5" /> 你已点亮</span>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="p in starStore.presets"
              :key="p.id"
              class="rounded-full border px-2.5 py-1 text-xs transition active:scale-95 disabled:cursor-not-allowed"
              :class="
                lit
                  ? 'border-white/5 text-slate-500'
                  : 'border-white/10 bg-white/[0.04] text-slate-200 hover:border-amber-200/40 hover:bg-amber-200/10 hover:text-amber-50'
              "
              :disabled="!!sending"
              @click="sendPreset(p)"
            >
              <LoaderCircle v-if="sending === p.id" class="mr-1 inline h-3 w-3 animate-spin" />{{ p.text }}
            </button>
          </div>
        </div>

        <!-- 星语回响（实时留言区） -->
        <div class="mt-4 border-t border-white/5 pt-3.5">
          <div class="mb-2.5 flex items-center justify-between text-xs">
            <span class="flex items-center gap-1.5 text-slate-300">
              <MessageCircle class="h-3.5 w-3.5 text-amber-200/80" />
              星语回响
              <span class="tabular-nums text-slate-500">({{ starStore.selectedComments.length }} 条留言)</span>
            </span>
          </div>

          <div ref="commentListRef" class="max-h-48 space-y-2 overflow-y-auto pr-0.5">
            <div
              v-for="c in starStore.selectedComments"
              :key="c.id"
              class="group rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs"
            >
              <div class="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                <span class="font-medium text-amber-100/90">{{ c.author?.nickname ?? '星友' }}</span>
                <div class="flex items-center gap-2">
                  <span>{{ relativeTime(c.createdAt) }}</span>
                  <button
                    v-if="canDeleteComment(c)"
                    class="text-slate-500 transition hover:text-rose-300"
                    title="删除留言"
                    :disabled="deletingCommentId === c.id"
                    @click="removeComment(c)"
                  >
                    <Trash2 class="h-3 w-3" />
                  </button>
                </div>
              </div>
              <p class="mt-1 leading-relaxed text-slate-200">{{ c.content }}</p>
            </div>

            <p v-if="!starStore.selectedComments.length" class="py-3 text-center text-xs text-slate-500">
              还没有回响，留下一句温柔的回应吧 ✨
            </p>
          </div>
        </div>

        <!-- 删除星星 -->
        <div v-if="canDeleteStar" class="mt-4 border-t border-white/5 pt-3">
          <button
            v-if="!confirming"
            class="flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-rose-300"
            @click="confirming = true"
          >
            <Trash2 class="h-3.5 w-3.5" /> 删除这颗星
          </button>
          <div v-else class="flex items-center gap-2 text-xs">
            <span class="text-rose-200/90">确定让这颗星熄灭吗？</span>
            <button
              class="rounded-full bg-rose-400/20 px-3 py-1 text-rose-100 transition hover:bg-rose-400/30"
              :disabled="deleting"
              @click="confirmDelete"
            >
              <LoaderCircle v-if="deleting" class="mr-1 inline h-3 w-3 animate-spin" />确认删除
            </button>
            <button class="px-2 py-1 text-slate-400 hover:text-white" @click="confirming = false">取消</button>
          </div>
        </div>
      </div>

      <!-- 底部固定留言输入框 -->
      <form class="mt-3 flex shrink-0 items-center gap-2 border-t border-white/10 pt-3" @submit.prevent="submitComment">
        <input
          v-model="commentText"
          maxlength="120"
          class="field !rounded-full !px-3.5 !py-2 !text-xs"
          :placeholder="auth.isLoggedIn ? '写一句星语回响（2-120 字）…' : '点击输入昵称，快速写下星语回响…'"
          @focus="onCommentFocus"
        />
        <button
          type="submit"
          class="btn-primary shrink-0 !px-3.5 !py-2 !text-xs"
          :disabled="commentSending || (auth.isLoggedIn && commentText.trim().length < 2)"
          aria-label="发送留言"
        >
          <LoaderCircle v-if="commentSending" class="h-3.5 w-3.5 animate-spin" />
          <Send v-else class="h-3.5 w-3.5" />
        </button>
      </form>
    </aside>
  </Transition>
</template>
