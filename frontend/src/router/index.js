import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/bigscreen',
      name: 'bigscreen',
      component: () => import('@/views/BigScreenView.vue'),
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
      meta: { requiresAdmin: true },
    },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAdmin) return true
  const auth = useAuthStore()
  const ui = useUiStore()
  if (!auth.ready) await auth.init()
  if (!auth.isAdmin) {
    ui.toast('该页面仅对管理员开放', 'info')
    return { path: '/' }
  }
  return true
})

export default router
