import prisma from '../lib/prisma.js'
import { EMOTION_COLORS, EMOTIONS } from '../constants/index.js'
import { AppError, ErrorCode } from '../utils/response.js'
import { serializeComment, serializeStar } from './star.service.js'
import { broadcast } from './sse.service.js'

const VALID_STATUSES = ['APPROVED', 'FLAGGED', 'HIDDEN']

const adminStarInclude = {
  user: { select: { id: true, username: true, nickname: true } },
  constellation: { select: { id: true, name: true, themeTag: true } },
}

function formatDateLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function serializeAdminStar(s) {
  return {
    id: s.id,
    content: s.content,
    aiReply: s.aiReply,
    emotion: s.emotion,
    colorHex: s.colorHex,
    themeTag: s.themeTag,
    lightCount: s.lightCount,
    status: s.status,
    createdAt: s.createdAt,
    author: s.user ? { id: s.user.id, username: s.user.username, nickname: s.user.nickname } : null,
    constellation: s.constellation ?? null,
  }
}

export async function getAdminStats() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(todayStart.getTime() - 6 * 86_400_000)

  const [
    totalUsers,
    totalStars,
    approvedStars,
    todayStars,
    flaggedStars,
    hiddenStars,
    totalConstellations,
    emotionGroups,
    recent7Stars,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.star.count(),
    prisma.star.count({ where: { status: 'APPROVED' } }),
    prisma.star.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.star.count({ where: { status: 'FLAGGED' } }),
    prisma.star.count({ where: { status: 'HIDDEN' } }),
    prisma.constellation.count(),
    prisma.star.groupBy({ by: ['emotion'], where: { status: 'APPROVED' }, _count: { _all: true } }),
    prisma.star.findMany({ where: { createdAt: { gte: sevenDaysAgo } }, select: { createdAt: true } }),
  ])

  const emoMap = new Map(emotionGroups.map((g) => [g.emotion, g._count._all]))
  const emoTotal = [...emoMap.values()].reduce((a, b) => a + b, 0)
  const emotionDistribution = EMOTIONS.map((emotion) => {
    const count = emoMap.get(emotion) || 0
    return {
      emotion,
      colorHex: EMOTION_COLORS[emotion],
      count,
      percent: emoTotal ? Math.round((count / emoTotal) * 1000) / 10 : 0,
    }
  })

  const dayCounts = new Map()
  for (const s of recent7Stars) {
    const k = formatDateLocal(new Date(s.createdAt))
    dayCounts.set(k, (dayCounts.get(k) || 0) + 1)
  }
  const trend7Days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart.getTime() - i * 86_400_000)
    const date = formatDateLocal(d)
    trend7Days.push({ date, count: dayCounts.get(date) || 0 })
  }

  return {
    totalUsers,
    totalStars,
    approvedStars,
    todayStars,
    flaggedStars,
    hiddenStars,
    totalConstellations,
    emotionDistribution,
    trend7Days,
  }
}

export async function listAdminStars({ status = 'ALL', page = 1, pageSize = 20 }) {
  const normalizedStatus = String(status || 'ALL').toUpperCase()
  if (normalizedStatus !== 'ALL' && !VALID_STATUSES.includes(normalizedStatus)) {
    throw new AppError(ErrorCode.BAD_REQUEST, 'status 参数无效，可选 ALL/APPROVED/FLAGGED/HIDDEN', 400)
  }
  const p = Math.max(1, Number.parseInt(page, 10) || 1)
  const ps = Math.min(100, Math.max(1, Number.parseInt(pageSize, 10) || 20))
  const where = normalizedStatus === 'ALL' ? {} : { status: normalizedStatus }

  const [total, rows] = await Promise.all([
    prisma.star.count({ where }),
    prisma.star.findMany({
      where,
      include: adminStarInclude,
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * ps,
      take: ps,
    }),
  ])

  return {
    items: rows.map(serializeAdminStar),
    total,
    page: p,
    pageSize: ps,
    totalPages: Math.max(1, Math.ceil(total / ps)),
  }
}

export async function updateStarStatus(starId, nextStatus) {
  if (!VALID_STATUSES.includes(nextStatus)) {
    throw new AppError(ErrorCode.BAD_REQUEST, 'status 无效，仅支持 APPROVED / HIDDEN / FLAGGED', 400)
  }
  const existing = await prisma.star.findUnique({ where: { id: starId }, select: { id: true, status: true } })
  if (!existing) throw new AppError(ErrorCode.NOT_FOUND, '星星不存在', 404)

  const updated = await prisma.star.update({
    where: { id: starId },
    data: { status: nextStatus },
    include: adminStarInclude,
  })

  if (existing.status === 'APPROVED' && nextStatus !== 'APPROVED') {
    broadcast('star:remove', { starId })
  } else if (existing.status !== 'APPROVED' && nextStatus === 'APPROVED') {
    broadcast('star:new', serializeStar(updated))
  }

  return serializeAdminStar(updated)
}

export async function adminDeleteStar(starId) {
  const existing = await prisma.star.findUnique({ where: { id: starId }, select: { id: true, status: true } })
  if (!existing) throw new AppError(ErrorCode.NOT_FOUND, '星星不存在', 404)

  await prisma.star.delete({ where: { id: starId } })
  broadcast('star:remove', { starId })
  return { id: starId }
}

// ---------------- 留言审核 ----------------

const adminCommentInclude = {
  user: { select: { id: true, username: true, nickname: true } },
  star: { select: { id: true, content: true } },
}

function serializeAdminComment(c) {
  return {
    id: c.id,
    starId: c.starId,
    content: c.content,
    status: c.status,
    createdAt: c.createdAt,
    author: c.user ? { id: c.user.id, username: c.user.username, nickname: c.user.nickname } : null,
    star: c.star ? { id: c.star.id, content: c.star.content } : null,
  }
}

export async function listAdminComments({ status = 'ALL', page = 1, pageSize = 20 }) {
  const normalizedStatus = String(status || 'ALL').toUpperCase()
  if (normalizedStatus !== 'ALL' && !VALID_STATUSES.includes(normalizedStatus)) {
    throw new AppError(ErrorCode.BAD_REQUEST, 'status 参数无效，可选 ALL/APPROVED/FLAGGED/HIDDEN', 400)
  }
  const p = Math.max(1, Number.parseInt(page, 10) || 1)
  const ps = Math.min(100, Math.max(1, Number.parseInt(pageSize, 10) || 20))
  const where = normalizedStatus === 'ALL' ? {} : { status: normalizedStatus }

  const [total, rows] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      include: adminCommentInclude,
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * ps,
      take: ps,
    }),
  ])

  return {
    items: rows.map(serializeAdminComment),
    total,
    page: p,
    pageSize: ps,
    totalPages: Math.max(1, Math.ceil(total / ps)),
  }
}

export async function updateCommentStatus(commentId, nextStatus) {
  if (!VALID_STATUSES.includes(nextStatus)) {
    throw new AppError(ErrorCode.BAD_REQUEST, 'status 无效，仅支持 APPROVED / HIDDEN / FLAGGED', 400)
  }
  const existing = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true, starId: true, status: true } })
  if (!existing) throw new AppError(ErrorCode.NOT_FOUND, '留言不存在', 404)

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { status: nextStatus },
    include: adminCommentInclude,
  })
  const commentCount = await prisma.comment.count({ where: { starId: existing.starId, status: 'APPROVED' } })

  if (existing.status === 'APPROVED' && nextStatus !== 'APPROVED') {
    broadcast('star:comment:remove', { starId: existing.starId, commentId, commentCount })
  } else if (existing.status !== 'APPROVED' && nextStatus === 'APPROVED') {
    broadcast('star:comment', { starId: existing.starId, comment: serializeComment(updated), commentCount })
  }

  return serializeAdminComment(updated)
}

export async function adminDeleteComment(commentId) {
  const existing = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true, starId: true, status: true } })
  if (!existing) throw new AppError(ErrorCode.NOT_FOUND, '留言不存在', 404)

  await prisma.comment.delete({ where: { id: commentId } })
  const commentCount = await prisma.comment.count({ where: { starId: existing.starId, status: 'APPROVED' } })
  broadcast('star:comment:remove', { starId: existing.starId, commentId, commentCount })
  return { id: commentId, starId: existing.starId, commentCount }
}
