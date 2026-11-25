import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as starsApi from '@/api/stars'
import * as constellationsApi from '@/api/constellations'

export const useStarStore = defineStore('stars', () => {
  const stars = ref([])
  const constellations = ref([])
  const showConstellations = ref(false)
  const activeConstellationId = ref(null)
  const loading = ref(false)
  const loaded = ref(false)
  const selectedId = ref(null)
  const selectedComments = ref([])
  const presets = ref([])
  const litIds = ref(new Set())
  const streamStatus = ref('idle') // idle | connecting | open | reconnecting
  const onlineCount = ref(1)
  /** 最近一次通过 SSE 收到的「新」星（用于提示他人点亮） */
  const lastStreamStar = ref(null)
  /** 最近一次通过 SSE 诞生的新星座 */
  const lastNewConstellation = ref(null)
  /** 最近一次在当前打开的星星下收到的实时留言 */
  const lastNewComment = ref(null)

  let es = null
  let connectedOnce = false

  const total = computed(() => stars.value.length)
  const todayCount = computed(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return stars.value.filter((s) => new Date(s.createdAt) >= start).length
  })
  const selected = computed(() => stars.value.find((s) => s.id === selectedId.value) ?? null)

  const byId = (id) => stars.value.find((s) => s.id === id)
  const isLit = (id) => litIds.value.has(id)

  function upsert(star) {
    const { litByMe, comments, ...data } = star
    const i = stars.value.findIndex((s) => s.id === data.id)
    if (i >= 0) stars.value[i] = { ...stars.value[i], ...data }
    else stars.value.push(data)
    if (litByMe) markLit(data.id)
    if (Array.isArray(comments) && selectedId.value === data.id) {
      selectedComments.value = comments
    }
    if (data.constellation?.id) {
      const c = constellations.value.find((item) => item.id === data.constellation.id)
      if (c && !c.stars.some((s) => s.id === data.id)) {
        c.stars.push({ id: data.id, posX: data.posX, posY: data.posY, posZ: data.posZ, colorHex: data.colorHex })
        c.starCount = c.stars.length
      }
    }
    return i < 0
  }

  function upsertConstellation(c) {
    const i = constellations.value.findIndex((item) => item.id === c.id)
    if (i >= 0) constellations.value[i] = c
    else constellations.value.push(c)
    const ids = new Set((c.stars || []).map((s) => s.id))
    for (const s of stars.value) {
      if (ids.has(s.id)) s.constellation = { id: c.id, name: c.name, themeTag: c.themeTag }
    }
    return i < 0
  }

  function removeLocal(id) {
    stars.value = stars.value.filter((s) => s.id !== id)
    for (const c of constellations.value) {
      const before = c.stars.length
      c.stars = c.stars.filter((s) => s.id !== id)
      if (c.stars.length !== before) c.starCount = c.stars.length
    }
    if (selectedId.value === id) {
      selectedId.value = null
      selectedComments.value = []
    }
  }

  function setLight(id, count) {
    const s = byId(id)
    if (s) s.lightCount = Math.max(s.lightCount, count)
  }

  function setCommentCount(id, count) {
    const s = byId(id)
    if (s) s.commentCount = count
  }

  function appendCommentLocal(starId, comment, commentCount) {
    if (typeof commentCount === 'number') setCommentCount(starId, commentCount)
    if (selectedId.value !== starId) return false
    if (selectedComments.value.some((c) => c.id === comment.id)) return false
    selectedComments.value.push(comment)
    return true
  }

  function removeCommentLocal(starId, commentId, commentCount) {
    if (typeof commentCount === 'number') setCommentCount(starId, commentCount)
    if (selectedId.value === starId) {
      selectedComments.value = selectedComments.value.filter((c) => c.id !== commentId)
    }
  }

  function markLit(id) {
    if (litIds.value.has(id)) return
    const next = new Set(litIds.value)
    next.add(id)
    litIds.value = next
  }

  function resetLit() {
    litIds.value = new Set()
  }

  async function fetchStars() {
    loading.value = true
    try {
      stars.value = await starsApi.listStars()
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  async function fetchConstellations() {
    constellations.value = await constellationsApi.listConstellations()
  }

  async function fetchPresets() {
    if (!presets.value.length) presets.value = await starsApi.getPresets()
  }

  function toggleConstellations() {
    showConstellations.value = !showConstellations.value
    if (!showConstellations.value) activeConstellationId.value = null
  }

  function setActiveConstellation(id) {
    activeConstellationId.value = id
    if (id != null) showConstellations.value = true
  }

  /** 选中星星：先用列表数据即时展示，再拉详情补充 litByMe 与 comments */
  async function select(id) {
    selectedId.value = id
    selectedComments.value = []
    await refreshSelected()
  }

  async function refreshSelected() {
    const id = selectedId.value
    if (id == null) return
    try {
      const detail = await starsApi.getStar(id)
      if (selectedId.value === id) upsert(detail)
    } catch (e) {
      if (e.code === 40400) removeLocal(id)
      throw e
    }
  }

  function clearSelection() {
    selectedId.value = null
    selectedComments.value = []
  }

  /** @returns {{ ok: true, lightCount: number } | { ok: false, already: true }} */
  async function encourage(id, presetId) {
    try {
      const res = await starsApi.encourageStar(id, presetId)
      setLight(id, res.lightCount)
      markLit(id)
      return { ok: true, ...res }
    } catch (e) {
      if (e.code === 40900) {
        markLit(id)
        return { ok: false, already: true }
      }
      throw e
    }
  }

  async function addComment(starId, content) {
    const res = await starsApi.createComment(starId, content)
    if (!res.blocked && res.comment) {
      appendCommentLocal(starId, res.comment, res.commentCount)
    }
    return res
  }

  async function removeComment(starId, commentId) {
    const res = await starsApi.deleteComment(starId, commentId)
    removeCommentLocal(starId, commentId, res.commentCount)
    return res
  }

  async function publish(content) {
    const res = await starsApi.createStar(content)
    if (!res.blocked && res.status === 'APPROVED') upsert(res)
    return res
  }

  async function remove(id) {
    await starsApi.deleteStar(id)
    removeLocal(id)
  }

  // ---------------- SSE ----------------

  function connectStream() {
    if (es) return
    streamStatus.value = 'connecting'
    es = new EventSource(starsApi.STREAM_URL)

    es.addEventListener('connected', (e) => {
      streamStatus.value = 'open'
      try {
        const d = JSON.parse(e.data)
        if (typeof d.onlineCount === 'number') onlineCount.value = Math.max(1, d.onlineCount)
      } catch {
        /* ignore */
      }
      if (connectedOnce) {
        fetchStars().catch(() => {})
        fetchConstellations().catch(() => {})
      }
      connectedOnce = true
    })
    es.addEventListener('presence:count', (e) => {
      const { onlineCount: count } = JSON.parse(e.data)
      if (typeof count === 'number') onlineCount.value = Math.max(1, count)
    })
    es.addEventListener('star:new', (e) => {
      const star = JSON.parse(e.data)
      if (upsert(star)) lastStreamStar.value = star
    })
    es.addEventListener('star:light', (e) => {
      const { starId, lightCount } = JSON.parse(e.data)
      setLight(starId, lightCount)
    })
    es.addEventListener('star:remove', (e) => {
      const { starId } = JSON.parse(e.data)
      removeLocal(starId)
    })
    es.addEventListener('star:comment', (e) => {
      const { starId, comment, commentCount } = JSON.parse(e.data)
      if (appendCommentLocal(starId, comment, commentCount)) {
        lastNewComment.value = { starId, comment }
      }
    })
    es.addEventListener('star:comment:remove', (e) => {
      const { starId, commentId, commentCount } = JSON.parse(e.data)
      removeCommentLocal(starId, commentId, commentCount)
    })
    es.addEventListener('constellation:new', (e) => {
      const c = JSON.parse(e.data)
      if (upsertConstellation(c)) lastNewConstellation.value = c
    })
    es.onerror = () => {
      streamStatus.value = 'reconnecting'
    }
  }

  function disconnectStream() {
    es?.close()
    es = null
    connectedOnce = false
    streamStatus.value = 'idle'
  }

  return {
    stars,
    constellations,
    showConstellations,
    activeConstellationId,
    loading,
    loaded,
    selectedId,
    selected,
    selectedComments,
    presets,
    streamStatus,
    onlineCount,
    lastStreamStar,
    lastNewConstellation,
    lastNewComment,
    total,
    todayCount,
    isLit,
    resetLit,
    upsert,
    fetchStars,
    fetchConstellations,
    fetchPresets,
    toggleConstellations,
    setActiveConstellation,
    select,
    refreshSelected,
    clearSelection,
    encourage,
    addComment,
    removeComment,
    publish,
    remove,
    connectStream,
    disconnectStream,
  }
})
