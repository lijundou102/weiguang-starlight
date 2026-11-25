import prisma from '../lib/prisma.js'
import { MICRO_ACTION_POOL } from '../constants/microActions.js'
import { AppError, ErrorCode } from '../utils/response.js'
import { createStar } from './star.service.js'

const DAILY_COUNT = 3

/** 返回本地 YYYY-MM-DD 对应的 UTC 零点 Date，用于 activeDate 精确匹配 */
function getTodayKey() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const dateStr = `${y}-${m}-${d}`
  return { dateStr, activeDate: new Date(`${dateStr}T00:00:00.000Z`) }
}

/** 按日期字符串确定性选取 3 条不重复微行动 */
function pickDailyActions(dateStr) {
  let hash = 0
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0
  }
  const n = MICRO_ACTION_POOL.length
  const picked = []
  const used = new Set()
  let idx = hash % n
  while (picked.length < DAILY_COUNT) {
    if (!used.has(idx)) {
      used.add(idx)
      picked.push(MICRO_ACTION_POOL[idx])
    }
    idx = (idx + 5) % n // 5 与 18 互质，保证均匀覆盖
  }
  return picked
}

async function ensureTodayActions() {
  const { dateStr, activeDate } = getTodayKey()
  let rows = await prisma.microAction.findMany({
    where: { activeDate },
    orderBy: { id: 'asc' },
  })
  if (rows.length < DAILY_COUNT) {
    const existingTitles = new Set(rows.map((r) => r.title))
    const toInsert = pickDailyActions(dateStr)
      .filter((a) => !existingTitles.has(a.title))
      .slice(0, DAILY_COUNT - rows.length)
    if (toInsert.length) {
      await prisma.microAction.createMany({
        data: toInsert.map(({ title, description }) => ({ title, description, activeDate })),
      })
      rows = await prisma.microAction.findMany({
        where: { activeDate },
        orderBy: { id: 'asc' },
      })
    }
  }
  return { dateStr, actions: rows.slice(0, DAILY_COUNT) }
}

export async function getTodayMicroActions(userId = null) {
  const { dateStr, actions } = await ensureTodayActions()
  const completedMap = new Map()

  if (userId && actions.length) {
    const records = await prisma.userMicroAction.findMany({
      where: { userId, actionId: { in: actions.map((a) => a.id) } },
      select: { actionId: true, completedAt: true, starId: true },
    })
    for (const r of records) completedMap.set(r.actionId, r)
  }

  const items = actions.map((a) => {
    const rec = completedMap.get(a.id)
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      activeDate: dateStr,
      completed: Boolean(rec),
      completedAt: rec?.completedAt ?? null,
      starId: rec?.starId ?? null,
    }
  })

  return {
    date: dateStr,
    completedCount: items.filter((i) => i.completed).length,
    totalCount: items.length,
    actions: items,
  }
}

export async function completeMicroAction(userId, actionId, rawNote) {
  const action = await prisma.microAction.findUnique({ where: { id: actionId } })
  if (!action) throw new AppError(ErrorCode.NOT_FOUND, '微行动不存在', 404)

  const existed = await prisma.userMicroAction.findUnique({
    where: { userId_actionId: { userId, actionId } },
    select: { id: true },
  })
  if (existed) throw new AppError(ErrorCode.CONFLICT, '你已经完成过这项微行动啦', 409)

  const poolItem = MICRO_ACTION_POOL.find((p) => p.title === action.title)
  const note = typeof rawNote === 'string' && rawNote.trim() ? rawNote.trim() : null
  const content = note || poolItem?.defaultNote || `完成了今日微行动「${action.title}」，收获了一份小小的温暖。`

  const starResult = await createStar(userId, content)
  // 若用户自定义 note 触发了高危危机拦截，直接透传守护响应，不记为完成打卡
  if (starResult.blocked) return starResult

  const completion = await prisma.userMicroAction.create({
    data: { userId, actionId, starId: starResult.id },
  })

  const today = await getTodayMicroActions(userId)
  return {
    actionId,
    completedAt: completion.completedAt,
    star: starResult,
    progress: {
      completedCount: today.completedCount,
      totalCount: today.totalCount,
    },
  }
}
