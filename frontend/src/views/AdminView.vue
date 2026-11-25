<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  AlertTriangle,
  ArrowLeft,
  EyeOff,
  LoaderCircle,
  MessageCircle,
  Orbit,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from '@lucide/vue'
import ToastHost from '@/components/ToastHost.vue'
import * as adminApi from '@/api/admin'
import { useUiStore } from '@/stores/ui'
import { EMOTION_META, relativeTime } from '@/utils/format'

const router = useRouter()
const ui = useUiStore()

const stats = ref(null)
const activeModule = ref('stars') // stars | comments
const statusFilter = ref('ALL')
const listData = ref({ items: [], total: 0, page: 1, pageSize: 15, totalPages: 1 })
const loading = ref(false)
const busyId = ref(null)

const STATUS_TABS = [
  { key: 'ALL', label: '全部' },
  { key: 'APPROVED', label: '已展示' },
  { key: 'FLAGGED', label: '高危/不友善拦截' },
  { key: 'HIDDEN', label: '已隐藏' },
]

const STATUS_BADGE = {
  APPROVED: { label: '已展示', cls: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200' },
  FLAGGED: { label: '已拦截', cls: 'border-rose-400/50 bg-rose-500/20 text-rose-200' },
  HIDDEN: { label: '已隐藏', cls: 'border-slate-400/30 bg-slate-400/10 text-slate-300' },
}

const trendMax = computed(() => Math.max(1, ...(stats.value?.trend7Days || []).map((d) => d.count)))

async function loadStats() {
  stats.value = await adminApi.getAdminStats()
}

async function loadList(page = 1) {
  loading.value = true
  try {
    const fn = activeModule.value === 'stars' ? adminApi.listAdminStars : adminApi.listAdminComments
    listData.value = await fn({ status: statusFilter.value, page, pageSize: 15 })
  } catch (e) {
    ui.toast(e.message, 'error')
  } finally {
    loading.value = false
  }
}

async function refreshAll(page = listData.value.page) {
  await Promise.all([loadStats(), loadList(page)])
}

function switchModule(mod) {
  activeModule.value = mod
  statusFilter.value = 'ALL'
  loadList(1)
}

function selectTab(key) {
  statusFilter.value = key
  loadList(1)
}

async function changeStatus(item, nextStatus) {
  busyId.value = item.id
  try {
    if (activeModule.value === 'stars') {
      await adminApi.updateStarStatus(item.id, nextStatus)
      ui.toast(nextStatus === 'APPROVED' ? '已恢复展示并同步到星空' : '已隐藏该星并从星空移除', 'success')
    } else {
      await adminApi.updateCommentStatus(item.id, nextStatus)
      ui.toast(nextStatus === 'APPROVED' ? '留言已恢复展示并同步' : '留言已隐藏并同步移除', 'success')
    }
    await refreshAll()
  } catch (e) {
    ui.toast(e.message, 'error')
  } finally {
    busyId.value = null
  }
}

async function removeItem(item) {
  busyId.value = item.id
  try {
    if (activeModule.value === 'stars') await adminApi.deleteAdminStar(item.id)
    else await adminApi.deleteAdminComment(item.id)
    ui.toast('已永久删除该条记录')
    await refreshAll()
  } catch (e) {
    ui.toast(e.message, 'error')
  } finally {
    busyId.value = null
  }
}

onMounted(() => {
  refreshAll(1)
})
</script>

<template>
  <div class="night-sky relative h-full w-full overflow-y-auto">
    <div class="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <!-- 顶栏 -->
      <header class="mb-8 flex items-center justify-between">
        <button
          class="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm text-slate-200 transition hover:text-white"
          @click="router.push('/')"
        >
          <ArrowLeft class="h-4 w-4" /> 返回星空
        </button>
        <div class="flex items-center gap-2 font-serif text-lg tracking-[0.22em] text-amber-50">
          <ShieldCheck class="h-5 w-5 text-amber-200" /> 微光管理后台
        </div>
        <button class="btn-ghost !px-3.5 !py-1.5 !text-xs" @click="refreshAll()">刷新数据</button>
      </header>

      <!-- 核心指标看板 -->
      <section v-if="stats" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div class="glass rounded-2xl p-4">
          <div class="flex items-center gap-1.5 text-xs text-slate-400"><Users class="h-3.5 w-3.5 text-sky-300" /> 总用户数</div>
          <div class="mt-2 font-serif text-3xl tabular-nums text-slate-50">{{ stats.totalUsers }}</div>
        </div>
        <div class="glass rounded-2xl p-4">
          <div class="flex items-center gap-1.5 text-xs text-slate-400"><Sparkles class="h-3.5 w-3.5 text-amber-200" /> 总星星数</div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="font-serif text-3xl tabular-nums text-amber-50">{{ stats.totalStars }}</span>
            <span class="text-xs text-emerald-300">今日 +{{ stats.todayStars }}</span>
          </div>
        </div>
        <div class="glass rounded-2xl border-rose-400/25 p-4">
          <div class="flex items-center gap-1.5 text-xs text-rose-200/90"><AlertTriangle class="h-3.5 w-3.5 text-rose-300" /> 高危拦截</div>
          <div class="mt-2 font-serif text-3xl tabular-nums text-rose-200">{{ stats.flaggedStars }}</div>
        </div>
        <div class="glass rounded-2xl p-4">
          <div class="flex items-center gap-1.5 text-xs text-slate-400"><EyeOff class="h-3.5 w-3.5 text-slate-300" /> 已隐藏</div>
          <div class="mt-2 font-serif text-3xl tabular-nums text-slate-200">{{ stats.hiddenStars }}</div>
        </div>
        <div class="glass rounded-2xl p-4">
          <div class="flex items-center gap-1.5 text-xs text-slate-400"><Orbit class="h-3.5 w-3.5 text-amber-200" /> 星座总数</div>
          <div class="mt-2 font-serif text-3xl tabular-nums text-amber-50">{{ stats.totalConstellations }}</div>
        </div>
      </section>

      <!-- 情绪分布 + 近 7 天趋势 -->
      <section v-if="stats" class="mt-5 grid gap-5 lg:grid-cols-2">
        <div class="glass rounded-3xl p-5">
          <h2 class="font-serif text-sm tracking-wider text-amber-50">情绪分布占比（已展示）</h2>
          <div class="mt-4 flex h-3.5 overflow-hidden rounded-full bg-white/10">
            <div
              v-for="item in stats.emotionDistribution"
              :key="item.emotion"
              :style="{ width: `${item.percent}%`, background: item.colorHex }"
              :title="`${EMOTION_META[item.emotion]?.label}: ${item.count} (${item.percent}%)`"
            />
          </div>
          <div class="mt-4 flex flex-wrap gap-3 text-xs">
            <div v-for="item in stats.emotionDistribution" :key="item.emotion" class="flex items-center gap-1.5 text-slate-300">
              <span class="h-2.5 w-2.5 rounded-full" :style="{ background: item.colorHex }" />
              <span>{{ EMOTION_META[item.emotion]?.label }}</span>
              <span class="tabular-nums text-slate-400">{{ item.count }} ({{ item.percent }}%)</span>
            </div>
          </div>
        </div>

        <div class="glass rounded-3xl p-5">
          <h2 class="font-serif text-sm tracking-wider text-amber-50">近 7 天新增星星趋势</h2>
          <div class="mt-4 flex h-28 items-end justify-between gap-2 px-1">
            <div v-for="d in stats.trend7Days" :key="d.date" class="flex flex-1 flex-col items-center gap-1.5">
              <span class="text-[11px] tabular-nums text-amber-100/80">{{ d.count }}</span>
              <div class="flex h-16 w-full items-end justify-center">
                <div
                  class="w-full max-w-8 rounded-t-lg bg-gradient-to-t from-amber-300/30 to-amber-200/85 transition-all"
                  :style="{ height: `${Math.max(8, (d.count / trendMax) * 100)}%` }"
                />
              </div>
              <span class="text-[10px] tabular-nums text-slate-500">{{ d.date.slice(5) }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 内容审核台（星星审核 / 留言审核） -->
      <section class="glass mt-6 rounded-3xl p-5 sm:p-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button
              class="flex items-center gap-1.5 rounded-full border px-4 py-1.5 font-serif text-sm transition"
              :class="
                activeModule === 'stars'
                  ? 'border-amber-200/45 bg-amber-200/15 text-amber-50'
                  : 'border-white/10 text-slate-400 hover:text-white'
              "
              @click="switchModule('stars')"
            >
              <Sparkles class="h-3.5 w-3.5" /> 星星审核
            </button>
            <button
              class="flex items-center gap-1.5 rounded-full border px-4 py-1.5 font-serif text-sm transition"
              :class="
                activeModule === 'comments'
                  ? 'border-amber-200/45 bg-amber-200/15 text-amber-50'
                  : 'border-white/10 text-slate-400 hover:text-white'
              "
              @click="switchModule('comments')"
            >
              <MessageCircle class="h-3.5 w-3.5" /> 留言审核
            </button>
          </div>

          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="tab in STATUS_TABS"
              :key="tab.key"
              class="rounded-full border px-3.5 py-1.5 text-xs transition"
              :class="
                statusFilter === tab.key
                  ? 'border-amber-200/45 bg-amber-200/15 text-amber-50'
                  : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'
              "
              @click="selectTab(tab.key)"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <div v-if="loading" class="py-14 text-center text-sm text-slate-400">正在加载审核列表…</div>
        <div v-else-if="!listData.items.length" class="py-14 text-center text-sm text-slate-500">当前筛选下暂无记录</div>

        <div v-else class="mt-4 space-y-3">
          <article
            v-for="item in listData.items"
            :key="`${activeModule}-${item.id}`"
            class="rounded-2xl border p-4 transition"
            :class="
              item.status === 'FLAGGED'
                ? 'border-rose-400/35 bg-rose-500/[0.06]'
                : 'border-white/10 bg-white/[0.03]'
            "
          >
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded-full border px-2.5 py-0.5 font-medium" :class="STATUS_BADGE[item.status]?.cls">
                  <AlertTriangle v-if="item.status === 'FLAGGED'" class="mr-1 inline h-3 w-3" />
                  {{ STATUS_BADGE[item.status]?.label ?? item.status }}
                </span>
                <span class="text-slate-200">
                  {{ item.author?.nickname ?? '未知' }}
                  <span class="text-slate-500">@{{ item.author?.username ?? '-' }}</span>
                </span>
                <span v-if="activeModule === 'stars'" class="chip !py-0.5">
                  <span class="h-1.5 w-1.5 rounded-full" :style="{ background: item.colorHex }" />
                  {{ EMOTION_META[item.emotion]?.label ?? item.emotion }}
                </span>
                <span class="text-slate-500">{{ relativeTime(item.createdAt) }}</span>
              </div>

              <div class="flex items-center gap-2">
                <button
                  v-if="item.status === 'APPROVED'"
                  class="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/15 disabled:opacity-50"
                  :disabled="busyId === item.id"
                  @click="changeStatus(item, 'HIDDEN')"
                >
                  <LoaderCircle v-if="busyId === item.id" class="h-3 w-3 animate-spin" />
                  <EyeOff v-else class="h-3 w-3" />
                  隐藏
                </button>
                <button
                  v-else
                  class="inline-flex items-center gap-1 rounded-full border border-emerald-300/35 bg-emerald-300/15 px-3 py-1 text-xs text-emerald-100 transition hover:bg-emerald-300/25 disabled:opacity-50"
                  :disabled="busyId === item.id"
                  @click="changeStatus(item, 'APPROVED')"
                >
                  <LoaderCircle v-if="busyId === item.id" class="h-3 w-3 animate-spin" />
                  <RotateCcw v-else class="h-3 w-3" />
                  恢复展示
                </button>
                <button
                  class="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1 text-xs text-rose-200 transition hover:bg-rose-400/20 disabled:opacity-50"
                  :disabled="busyId === item.id"
                  @click="removeItem(item)"
                >
                  <Trash2 class="h-3 w-3" /> 删除
                </button>
              </div>
            </div>

            <p class="mt-3 text-sm leading-relaxed text-slate-100">{{ item.content }}</p>
            <p v-if="activeModule === 'stars' && item.aiReply" class="mt-2 border-l-2 border-white/15 pl-3 text-xs text-slate-400">
              AI 回应：{{ item.aiReply }}
            </p>
            <p v-if="activeModule === 'comments' && item.star" class="mt-2 border-l-2 border-white/15 pl-3 text-xs text-slate-400">
              所属星星 #{{ item.star.id }}：{{ item.star.content }}
            </p>
          </article>
        </div>

        <!-- 分页 -->
        <div v-if="listData.totalPages > 1" class="mt-5 flex items-center justify-between text-xs text-slate-400">
          <span>共 {{ listData.total }} 条 · 第 {{ listData.page }} / {{ listData.totalPages }} 页</span>
          <div class="flex gap-2">
            <button class="btn-ghost !px-3 !py-1 !text-xs" :disabled="listData.page <= 1" @click="loadList(listData.page - 1)">
              上一页
            </button>
            <button
              class="btn-ghost !px-3 !py-1 !text-xs"
              :disabled="listData.page >= listData.totalPages"
              @click="loadList(listData.page + 1)"
            >
              下一页
            </button>
          </div>
        </div>
      </section>
    </div>

    <ToastHost />
  </div>
</template>
