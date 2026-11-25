import prisma from '../lib/prisma.js'
import { analyzeStar, moderateComment } from './ai.service.js'
import { assignOrFormConstellation } from './constellation.service.js'
import { broadcast } from './sse.service.js'
import { randomSpherePosition } from '../utils/sphere.js'
import { AppError, ErrorCode } from '../utils/response.js'
import { CRISIS_CARE_MESSAGE, CRISIS_HOTLINES, ENCOURAGEMENT_PRESETS } from '../constants/index.js'

const starInclude = {
  user: { select: { id: true, nickname: true } },
  constellation: { select: { id: true, name: true, themeTag: true } },
  _count: { select: { comments: { where: { status: 'APPROVED' } } } },
}

export function serializeComment(c) {
  return {
    id: c.id,
    starId: c.starId,
    content: c.content,
    createdAt: c.createdAt,
    author: c.user ? { id: c.user.id, nickname: c.user.nickname } : null,
  }
}

/** 统一的星星输出结构（对外不暴露 userId 以外的用户信息） */
export function serializeStar(star) {
  return {
    id: star.id,
    content: star.content,
    aiReply: star.aiReply,
    emotion: star.emotion,
    colorHex: star.colorHex,
    themeTag: star.themeTag,
    posX: star.posX,
    posY: star.posY,
    posZ: star.posZ,
    lightCount: star.lightCount,
    commentCount: star._count?.comments ?? star.commentCount ?? 0,
    status: star.status,
    createdAt: star.createdAt,
    author: star.user ? { id: star.user.id, nickname: star.user.nickname } : null,
    constellation: star.constellation ?? null,
  }
}

export async function listApprovedStars() {
  const stars = await prisma.star.findMany({
    where: { status: 'APPROVED' },
    include: starInclude,
    orderBy: { createdAt: 'asc' },
  })
  return stars.map(serializeStar)
}

/** 单星详情：APPROVED 对所有人可见；其他状态仅作者 / ADMIN 可见。附带 litByMe 与 APPROVED comments */
export async function getStarDetail(starId, viewer) {
  const star = await prisma.star.findUnique({ where: { id: starId }, include: starInclude })
  const canSeeHidden = viewer && (viewer.role === 'ADMIN' || viewer.id === star?.userId)
  if (!star || (star.status !== 'APPROVED' && !canSeeHidden)) {
    throw new AppError(ErrorCode.NOT_FOUND, '星星不存在', 404)
  }

  const [enc, comments] = await Promise.all([
    viewer
      ? prisma.encouragement.findUnique({
          where: { starId_userId: { starId, userId: viewer.id } },
          select: { id: true },
        })
      : null,
    prisma.comment.findMany({
      where: { starId, status: 'APPROVED' },
      include: { user: { select: { id: true, nickname: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return {
    ...serializeStar(star),
    litByMe: Boolean(enc),
    commentCount: comments.length,
    comments: comments.map(serializeComment),
  }
}

/** 删除星星：仅作者本人或 ADMIN */
export async function deleteStar(starId, viewer) {
  const star = await prisma.star.findUnique({ where: { id: starId }, select: { id: true, userId: true, status: true } })
  if (!star) throw new AppError(ErrorCode.NOT_FOUND, '星星不存在', 404)
  if (viewer.role !== 'ADMIN' && viewer.id !== star.userId) {
    throw new AppError(ErrorCode.FORBIDDEN, '只能删除自己的星星', 403)
  }
  await prisma.star.delete({ where: { id: starId } })
  if (star.status === 'APPROVED') broadcast('star:remove', { starId })
  return { id: starId }
}

export async function createStar(userId, content) {
  const analysis = await analyzeStar(content)
  const pos = randomSpherePosition()

  // 危机干预分支：留痕入库为 FLAGGED，不进公共星空，不发 SSE，返回守护文案与求助热线
  if (analysis.riskLevel === 'CRISIS') {
    await prisma.star.create({
      data: {
        userId,
        content,
        aiReply: CRISIS_CARE_MESSAGE,
        emotion: analysis.emotion,
        colorHex: analysis.colorHex,
        themeTag: analysis.themeTag,
        ...pos,
        status: 'FLAGGED',
        constellationId: null,
      },
    })
    return {
      blocked: true,
      riskLevel: 'CRISIS',
      careMessage: CRISIS_CARE_MESSAGE,
      hotlines: CRISIS_HOTLINES,
    }
  }

  const created = await prisma.star.create({
    data: {
      userId,
      content,
      aiReply: analysis.aiReply,
      emotion: analysis.emotion,
      colorHex: analysis.colorHex,
      themeTag: analysis.themeTag,
      ...pos,
      status: 'APPROVED',
      constellationId: null,
    },
    include: starInclude,
  })

  // 自动归座或满 5 颗触发 AI 新建星座
  const { constellation } = await assignOrFormConstellation(created)
  const result = serializeStar({ ...created, constellation })
  broadcast('star:new', result)
  return result
}

export async function encourageStar(userId, starId, presetId) {
  const preset = ENCOURAGEMENT_PRESETS.find((p) => p.id === presetId)
  if (!preset) {
    throw new AppError(ErrorCode.BAD_REQUEST, 'presetId 无效，仅支持预设鼓励语', 400, {
      presets: ENCOURAGEMENT_PRESETS,
    })
  }

  const star = await prisma.star.findUnique({ where: { id: starId }, select: { id: true, status: true } })
  if (!star || star.status !== 'APPROVED') {
    throw new AppError(ErrorCode.NOT_FOUND, '星星不存在', 404)
  }

  const existed = await prisma.encouragement.findUnique({
    where: { starId_userId: { starId, userId } },
    select: { id: true },
  })
  if (existed) throw new AppError(ErrorCode.CONFLICT, '你已经点亮过这颗星星啦', 409)

  const [encouragement, updated] = await prisma.$transaction([
    prisma.encouragement.create({ data: { starId, userId, presetText: preset.text } }),
    prisma.star.update({ where: { id: starId }, data: { lightCount: { increment: 1 } }, select: { lightCount: true } }),
  ])

  const payload = {
    starId,
    lightCount: updated.lightCount,
    encouragement: { id: encouragement.id, presetText: encouragement.presetText, createdAt: encouragement.createdAt },
  }
  broadcast('star:light', { starId, lightCount: updated.lightCount })
  return payload
}

// ---------------- 星语回响（实时留言） ----------------

export async function createComment(userId, starId, content) {
  const star = await prisma.star.findUnique({ where: { id: starId }, select: { id: true, status: true } })
  if (!star || star.status !== 'APPROVED') {
    throw new AppError(ErrorCode.NOT_FOUND, '星星不存在', 404)
  }

  const { decision } = await moderateComment(content)

  if (decision === 'CRISIS') {
    await prisma.comment.create({ data: { starId, userId, content, status: 'FLAGGED' } })
    return {
      blocked: true,
      riskLevel: 'CRISIS',
      careMessage: CRISIS_CARE_MESSAGE,
      hotlines: CRISIS_HOTLINES,
    }
  }

  if (decision === 'UNFRIENDLY') {
    await prisma.comment.create({ data: { starId, userId, content, status: 'FLAGGED' } })
    return {
      blocked: true,
      riskLevel: 'UNFRIENDLY',
      message: '这片星空希望保持温柔，换一句更友善的话再发吧',
    }
  }

  const created = await prisma.comment.create({
    data: { starId, userId, content, status: 'APPROVED' },
    include: { user: { select: { id: true, nickname: true } } },
  })
  const commentCount = await prisma.comment.count({ where: { starId, status: 'APPROVED' } })
  const comment = serializeComment(created)

  broadcast('star:comment', { starId, comment, commentCount })
  return { comment, commentCount }
}

export async function deleteComment(starId, commentId, viewer) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { star: { select: { userId: true } } },
  })
  if (!comment || comment.starId !== starId) {
    throw new AppError(ErrorCode.NOT_FOUND, '留言不存在', 404)
  }
  const canDelete =
    viewer.role === 'ADMIN' || comment.userId === viewer.id || comment.star?.userId === viewer.id
  if (!canDelete) {
    throw new AppError(ErrorCode.FORBIDDEN, '无权删除该留言', 403)
  }

  await prisma.comment.delete({ where: { id: commentId } })
  const commentCount = await prisma.comment.count({ where: { starId, status: 'APPROVED' } })
  if (comment.status === 'APPROVED') {
    broadcast('star:comment:remove', { starId, commentId, commentCount })
  }
  return { id: commentId, starId, commentCount }
}
