import { Router } from 'express'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { AppError, ErrorCode, success } from '../utils/response.js'
import { addClient } from '../services/sse.service.js'
import {
  createComment,
  createStar,
  deleteComment,
  deleteStar,
  encourageStar,
  getStarDetail,
  listApprovedStars,
} from '../services/star.service.js'
import { ENCOURAGEMENT_PRESETS, STAR_CONTENT_MAX } from '../constants/index.js'

const router = Router()

function parseId(raw, label = 'id') {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw new AppError(ErrorCode.BAD_REQUEST, `${label} 无效`, 400)
  return id
}

// GET /api/stars/stream —— SSE（须在 /:id 类路由之前注册）
router.get('/stream', (req, res) => addClient(req, res))

// GET /api/stars/presets —— 预设鼓励语列表
router.get('/presets', (req, res) => success(res, ENCOURAGEMENT_PRESETS))

// GET /api/stars —— 所有 APPROVED 星星（含 commentCount）
router.get('/', async (req, res) => {
  success(res, await listApprovedStars())
})

// POST /api/stars —— 发布新星（含双层安全兜底）
router.post('/', requireAuth, async (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
  if (!content) throw new AppError(ErrorCode.BAD_REQUEST, '内容不能为空', 400)
  if (content.length > STAR_CONTENT_MAX) {
    throw new AppError(ErrorCode.BAD_REQUEST, `内容最多 ${STAR_CONTENT_MAX} 字`, 400)
  }
  const result = await createStar(req.user.id, content)
  success(result.blocked ? res : res.status(201), result)
})

// GET /api/stars/:id —— 单星详情（含 litByMe、comments 与 commentCount）
router.get('/:id', optionalAuth, async (req, res) => {
  success(res, await getStarDetail(parseId(req.params.id, '星星 id'), req.user))
})

// DELETE /api/stars/:id —— 删除（作者本人 / ADMIN）
router.delete('/:id', requireAuth, async (req, res) => {
  success(res, await deleteStar(parseId(req.params.id, '星星 id'), req.user))
})

// POST /api/stars/:id/encourage —— 点亮 + 预设鼓励语
router.post('/:id/encourage', requireAuth, async (req, res) => {
  success(res, await encourageStar(req.user.id, parseId(req.params.id, '星星 id'), req.body?.presetId))
})

// POST /api/stars/:id/comments —— 发表实时留言（2~120 字，双层审核）
router.post('/:id/comments', requireAuth, async (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
  if (content.length < 2 || content.length > 120) {
    throw new AppError(ErrorCode.BAD_REQUEST, '留言长度需为 2-120 字', 400)
  }
  const result = await createComment(req.user.id, parseId(req.params.id, '星星 id'), content)
  success(result.blocked ? res : res.status(201), result)
})

// DELETE /api/stars/:id/comments/:commentId —— 删除留言（评论作者 / 星主 / ADMIN）
router.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
  success(
    res,
    await deleteComment(parseId(req.params.id, '星星 id'), parseId(req.params.commentId, '留言 id'), req.user),
  )
})

export default router
