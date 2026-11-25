import prisma from '../lib/prisma.js'
import { EMOTION_COLORS } from '../constants/index.js'
import { serializeStar } from './star.service.js'
import { generateMonthlyReview } from './ai.service.js'

const starInclude = {
  user: { select: { id: true, nickname: true } },
  constellation: { select: { id: true, name: true, themeTag: true } },
}

function formatDateLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizeMonth(monthParam) {
  if (typeof monthParam === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) {
    return monthParam
  }
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function pickDominantEmotion(counts) {
  const entries = Object.entries(counts)
  if (!entries.length) return null
  entries.sort((a, b) => b[1] - a[1])
  return entries[0][0]
}

export async function getProfileOverview(userId, monthParam) {
  const month = normalizeMonth(monthParam)

  const [stars, completedActions] = await Promise.all([
    prisma.star.findMany({
      where: { userId, status: 'APPROVED' },
      include: starInclude,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.userMicroAction.count({ where: { userId } }),
  ])

  const totalStars = stars.length
  let totalLightsReceived = 0
  const emotionCounts = {}
  const dayMap = new Map() // YYYY-MM-DD -> { count, emotions }
  const trendMap = new Map() // YYYY-MM-DD -> count

  for (const s of stars) {
    totalLightsReceived += s.lightCount || 0
    emotionCounts[s.emotion] = (emotionCounts[s.emotion] || 0) + 1
    const dateKey = formatDateLocal(new Date(s.createdAt))
    trendMap.set(dateKey, (trendMap.get(dateKey) || 0) + 1)

    if (dateKey.startsWith(month)) {
      if (!dayMap.has(dateKey)) dayMap.set(dateKey, { count: 0, emotions: {} })
      const bucket = dayMap.get(dateKey)
      bucket.count++
      bucket.emotions[s.emotion] = (bucket.emotions[s.emotion] || 0) + 1
    }
  }

  const dominantEmotion = pickDominantEmotion(emotionCounts)
  const dominantColorHex = dominantEmotion ? EMOTION_COLORS[dominantEmotion] : '#FFB86B'

  const calendarDays = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, bucket]) => {
      const dom = pickDominantEmotion(bucket.emotions)
      return {
        date,
        count: bucket.count,
        dominantEmotion: dom,
        colorHex: EMOTION_COLORS[dom] || '#FFB86B',
      }
    })

  // 近 30 天每日发星趋势（含今天，按日期升序）
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const trend30Days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000)
    const date = formatDateLocal(d)
    trend30Days.push({ date, count: trendMap.get(date) || 0 })
  }

  return {
    stats: {
      totalStars,
      totalLightsReceived,
      completedActions,
      dominantEmotion,
      dominantColorHex,
    },
    calendar: {
      month,
      days: calendarDays,
    },
    trend30Days,
    stars: stars.map(serializeStar),
  }
}

export async function createMonthlyReview(userId, monthParam) {
  const month = normalizeMonth(monthParam)
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 1)

  let stars = await prisma.star.findMany({
    where: { userId, status: 'APPROVED', createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  let label = `${y}年${m}月`
  if (!stars.length) {
    // 若指定月份暂无记录，则回退取近 30 天内星星，仍无则由 AI/fallback 给出温柔寄语
    const recentStart = new Date(Date.now() - 30 * 86_400_000)
    stars = await prisma.star.findMany({
      where: { userId, status: 'APPROVED', createdAt: { gte: recentStart } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    if (stars.length) label = '近 30 天'
  }

  const review = await generateMonthlyReview(stars, label)
  return {
    month,
    label,
    starCount: stars.length,
    keywords: review.keywords,
    summary: review.summary,
    generatedAt: new Date().toISOString(),
  }
}
