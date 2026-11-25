import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { success } from '../utils/response.js'
import { createMonthlyReview, getProfileOverview } from '../services/profile.service.js'

const router = Router()

router.use(requireAuth)

// GET /api/profile/overview?month=YYYY-MM
router.get('/overview', async (req, res) => {
  success(res, await getProfileOverview(req.user.id, req.query.month))
})

// POST /api/profile/monthly-review
router.post('/monthly-review', async (req, res) => {
  success(res, await createMonthlyReview(req.user.id, req.body?.month))
})

export default router
