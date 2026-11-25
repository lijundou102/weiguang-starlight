import { Router } from 'express'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import { AppError, ErrorCode, success } from '../utils/response.js'
import {
  adminDeleteComment,
  adminDeleteStar,
  getAdminStats,
  listAdminComments,
  listAdminStars,
  updateCommentStatus,
  updateStarStatus,
} from '../services/admin.service.js'

const router = Router()

router.use(requireAuth, requireAdmin)

function parseId(raw, label = 'id') {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw new AppError(ErrorCode.BAD_REQUEST, `${label} 无效`, 400)
  return id
}

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  success(res, await getAdminStats())
})

// GET /api/admin/stars?status=ALL|APPROVED|FLAGGED|HIDDEN&page=1&pageSize=20
router.get('/stars', async (req, res) => {
  success(
    res,
    await listAdminStars({
      status: req.query.status,
      page: req.query.page,
      pageSize: req.query.pageSize,
    }),
  )
})

// PATCH /api/admin/stars/:id/status
router.patch('/stars/:id/status', async (req, res) => {
  success(res, await updateStarStatus(parseId(req.params.id, '星星 id'), req.body?.status))
})

// DELETE /api/admin/stars/:id
router.delete('/stars/:id', async (req, res) => {
  success(res, await adminDeleteStar(parseId(req.params.id, '星星 id')))
})

// GET /api/admin/comments?status=ALL|APPROVED|FLAGGED|HIDDEN&page=1&pageSize=20
router.get('/comments', async (req, res) => {
  success(
    res,
    await listAdminComments({
      status: req.query.status,
      page: req.query.page,
      pageSize: req.query.pageSize,
    }),
  )
})

// PATCH /api/admin/comments/:id/status
router.patch('/comments/:id/status', async (req, res) => {
  success(res, await updateCommentStatus(parseId(req.params.id, '留言 id'), req.body?.status))
})

// DELETE /api/admin/comments/:id
router.delete('/comments/:id', async (req, res) => {
  success(res, await adminDeleteComment(parseId(req.params.id, '留言 id')))
})

export default router
