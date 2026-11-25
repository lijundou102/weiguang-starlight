import { Router } from 'express'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { AppError, ErrorCode, success } from '../utils/response.js'
import { completeMicroAction, getTodayMicroActions } from '../services/microAction.service.js'
import { STAR_CONTENT_MAX } from '../constants/index.js'

const router = Router()

// GET /api/micro-actions/today —— 公开访问（登录时附带 completed 状态）
router.get('/today', optionalAuth, async (req, res) => {
  success(res, await getTodayMicroActions(req.user?.id ?? null))
})

// POST /api/micro-actions/:id/complete —— 完成微行动并自动点亮新星
router.post('/:id/complete', requireAuth, async (req, res) => {
  const actionId = Number(req.params.id)
  if (!Number.isInteger(actionId) || actionId <= 0) {
    throw new AppError(ErrorCode.BAD_REQUEST, '微行动 id 无效', 400)
  }
  const note = req.body?.note
  if (note !== undefined && (typeof note !== 'string' || note.trim().length > STAR_CONTENT_MAX)) {
    throw new AppError(ErrorCode.BAD_REQUEST, `感受最多 ${STAR_CONTENT_MAX} 字`, 400)
  }
  const result = await completeMicroAction(req.user.id, actionId, note)
  success(result.blocked ? res : res.status(201), result)
})

export default router
