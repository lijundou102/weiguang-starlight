import prisma from '../lib/prisma.js'
import { CONSTELLATION_THRESHOLD } from '../constants/index.js'
import { generateConstellationStory } from './ai.service.js'
import { broadcast } from './sse.service.js'

const constellationInclude = {
  stars: {
    where: { status: 'APPROVED' },
    select: { id: true, posX: true, posY: true, posZ: true, colorHex: true },
    orderBy: { createdAt: 'asc' },
  },
}

export function serializeConstellation(c) {
  return {
    id: c.id,
    name: c.name,
    themeTag: c.themeTag,
    story: c.story,
    createdAt: c.createdAt,
    starCount: c.stars.length,
    stars: c.stars,
  }
}

export async function listConstellations() {
  const list = await prisma.constellation.findMany({
    include: constellationInclude,
    orderBy: { createdAt: 'asc' },
  })
  return list.map(serializeConstellation)
}

/**
 * 新星以 APPROVED 入库后调用：
 * 1. 若同 themeTag 已有星座，直接归入该星座；
 * 2. 否则统计同 themeTag 下尚未编入星座的 APPROVED 星星数，达到 5 颗即自动生成 AI 星座、批量关联并 SSE 广播 `constellation:new`。
 * @returns {Promise<{ constellation: { id, name, themeTag } | null, formed: object | null }>}
 */
export async function assignOrFormConstellation(star) {
  const existing = await prisma.constellation.findUnique({
    where: { themeTag: star.themeTag },
    select: { id: true, name: true, themeTag: true },
  })

  if (existing) {
    await prisma.star.update({
      where: { id: star.id },
      data: { constellationId: existing.id },
    })
    return { constellation: existing, formed: null }
  }

  const unclustered = await prisma.star.findMany({
    where: { status: 'APPROVED', themeTag: star.themeTag, constellationId: null },
    select: { id: true, content: true },
    orderBy: { createdAt: 'asc' },
  })

  if (unclustered.length < CONSTELLATION_THRESHOLD) {
    return { constellation: null, formed: null }
  }

  const generated = await generateConstellationStory(
    star.themeTag,
    unclustered.map((s) => s.content),
  )

  let created
  try {
    created = await prisma.constellation.create({
      data: {
        name: generated.name,
        themeTag: star.themeTag,
        story: generated.story,
      },
    })
  } catch (err) {
    // 并发建座竞争时回退读取已存在的星座
    if (err?.code === 'P2002') {
      created = await prisma.constellation.findUnique({ where: { themeTag: star.themeTag } })
    } else {
      throw err
    }
  }

  await prisma.star.updateMany({
    where: { id: { in: unclustered.map((s) => s.id) } },
    data: { constellationId: created.id },
  })

  const full = await prisma.constellation.findUnique({
    where: { id: created.id },
    include: constellationInclude,
  })
  const serialized = serializeConstellation(full)
  broadcast('constellation:new', serialized)

  return {
    constellation: { id: created.id, name: created.name, themeTag: created.themeTag },
    formed: serialized,
  }
}
