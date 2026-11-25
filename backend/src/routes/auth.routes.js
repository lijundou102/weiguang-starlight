import crypto from 'node:crypto'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma.js'
import { requireAuth, signToken } from '../middleware/auth.js'
import { AppError, ErrorCode, success } from '../utils/response.js'

const router = Router()

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/
const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  nickname: u.nickname,
  role: u.role,
  isGuest: Boolean(u.isGuest),
  createdAt: u.createdAt,
})
const bad = (msg) => new AppError(ErrorCode.BAD_REQUEST, msg, 400)

// POST /api/auth/guest —— 免注册昵称快速体验
router.post('/guest', async (req, res) => {
  const nickname = typeof req.body?.nickname === 'string' ? req.body.nickname.trim() : ''
  if (nickname.length < 2 || nickname.length > 16) {
    throw bad('昵称长度需为 2-16 个字')
  }

  const username = `guest_${crypto.randomBytes(5).toString('hex')}`
  const randomSecret = crypto.randomBytes(16).toString('hex')
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(randomSecret, 6),
      nickname,
      role: 'USER',
      isGuest: true,
    },
  })
  success(res.status(201), { token: signToken(user), user: publicUser(user) })
})

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, password, nickname } = req.body ?? {}
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) throw bad('用户名需为 3-20 位字母、数字或下划线')
  if (typeof password !== 'string' || password.length < 6 || password.length > 64) throw bad('密码长度需为 6-64 位')
  if (nickname !== undefined && (typeof nickname !== 'string' || nickname.trim().length > 20)) throw bad('昵称最多 20 个字符')

  const exists = await prisma.user.findUnique({ where: { username }, select: { id: true } })
  if (exists) throw new AppError(ErrorCode.CONFLICT, '用户名已被注册', 409)

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 10),
      nickname: nickname?.trim() || username,
    },
  })
  success(res.status(201), { token: signToken(user), user: publicUser(user) })
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {}
  if (typeof username !== 'string' || typeof password !== 'string') throw bad('请输入用户名和密码')

  const user = await prisma.user.findUnique({ where: { username } })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(ErrorCode.UNAUTHORIZED, '用户名或密码错误', 401)
  }
  success(res, { token: signToken(user), user: publicUser(user) })
})

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } })
  if (!user) throw new AppError(ErrorCode.UNAUTHORIZED, '用户不存在', 401)
  success(res, publicUser(user))
})

export default router
