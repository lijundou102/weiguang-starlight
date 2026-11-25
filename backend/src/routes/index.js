import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { success } from '../utils/response.js'
import authRoutes from './auth.routes.js'
import starRoutes from './star.routes.js'
import constellationRoutes from './constellation.routes.js'
import microActionRoutes from './microAction.routes.js'
import profileRoutes from './profile.routes.js'
import adminRoutes from './admin.routes.js'

const router = Router()

// GET /api/health 健康检查
router.get('/health', async (req, res) => {
  let db = 'ok'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    db = 'error'
  }
  success(res, { status: 'up', db, time: new Date().toISOString() })
})

router.use('/auth', authRoutes)
router.use('/stars', starRoutes)
router.use('/constellations', constellationRoutes)
router.use('/micro-actions', microActionRoutes)
router.use('/profile', profileRoutes)
router.use('/admin', adminRoutes)

export default router
