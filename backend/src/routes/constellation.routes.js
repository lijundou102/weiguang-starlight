import { Router } from 'express'
import { success } from '../utils/response.js'
import { listConstellations } from '../services/constellation.service.js'

const router = Router()

// GET /api/constellations —— 公开访问，返回所有星座及旗下 APPROVED 星星坐标
router.get('/', async (req, res) => {
  success(res, await listConstellations())
})

export default router
