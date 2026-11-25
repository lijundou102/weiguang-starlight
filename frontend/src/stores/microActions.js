import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as microApi from '@/api/microActions'
import { useStarStore } from './stars'

export const useMicroActionStore = defineStore('microActions', () => {
  const date = ref('')
  const actions = ref([])
  const completedCount = ref(0)
  const totalCount = ref(3)
  const loading = ref(false)

  async function fetchToday() {
    loading.value = true
    try {
      const res = await microApi.getTodayMicroActions()
      date.value = res.date
      actions.value = res.actions
      completedCount.value = res.completedCount
      totalCount.value = res.totalCount
    } finally {
      loading.value = false
    }
  }

  async function complete(id, note = '') {
    const res = await microApi.completeMicroAction(id, note)
    if (res.blocked) return res
    const item = actions.value.find((a) => a.id === id)
    if (item) {
      item.completed = true
      item.completedAt = res.completedAt
      item.starId = res.star?.id ?? null
    }
    completedCount.value = res.progress?.completedCount ?? actions.value.filter((a) => a.completed).length
    if (res.star) useStarStore().upsert(res.star)
    return res
  }

  return { date, actions, completedCount, totalCount, loading, fetchToday, complete }
})
