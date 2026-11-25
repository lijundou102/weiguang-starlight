/**
 * 接口全链路自动化测试（阶段 1 ~ 3）：
 * auth → 正常发星与 fallback 映射 → CRISIS 危机兜底（FLAGGED 留痕 / 不可见 / 不广播）
 * → 星座列表与 5 颗同主题星自动成座 + SSE constellation:new
 * → 今日微行动（3 条）+ 完成打卡自动发星 + 防重复 409
 * → 点亮鼓励语 & 详情 & 删除
 *
 * 用法：先启动后端并 seed，再运行 npm run test:api -w backend
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const BASE = process.env.API_BASE || 'http://localhost:3001/api'
const prisma = new PrismaClient()
let passed = 0
let failed = 0

function check(name, cond, extra = '') {
  if (cond) {
    passed++
    console.log(`  ✔ ${name}`)
  } else {
    failed++
    console.log(`  ✘ ${name} ${extra}`)
  }
}

async function api(method, path, { body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json() }
}

/** 订阅 SSE，返回 { events, waitFor(event, predicate), close() } */
async function openSSE() {
  const ctrl = new AbortController()
  const res = await fetch(BASE + '/stars/stream', { signal: ctrl.signal })
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const events = []
  const waiters = []
  let buf = ''

  ;(async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const event = /^event: (.+)$/m.exec(block)?.[1]
          const data = /^data: (.+)$/m.exec(block)?.[1]
          if (!event || !data) continue
          const evt = { event, data: JSON.parse(data) }
          events.push(evt)
          waiters.forEach((w) => w(evt))
        }
      }
    } catch {
      /* aborted */
    }
  })()

  return {
    contentType: res.headers.get('content-type'),
    events,
    waitFor(event, pred = () => true, timeout = 3500) {
      return new Promise((resolve, reject) => {
        const hit = events.find((e) => e.event === event && pred(e.data))
        if (hit) return resolve(hit.data)
        const t = setTimeout(() => reject(new Error(`等待 SSE ${event} 超时`)), timeout)
        waiters.push((e) => {
          if (e.event === event && pred(e.data)) {
            clearTimeout(t)
            resolve(e.data)
          }
        })
      })
    },
    close: () => ctrl.abort(),
  }
}

async function main() {
  console.log(`API_BASE = ${BASE}\n`)
  const username = `tester_${Date.now().toString(36)}`
  const password = 'secret123'

  console.log('[1. auth]')
  let r = await api('POST', '/auth/register', { body: { username, password, nickname: '测试同学' } })
  check('注册成功 code=0', r.json.code === 0 && r.json.data?.token, JSON.stringify(r.json))
  r = await api('POST', '/auth/register', { body: { username, password } })
  check('重复注册 → 40900', r.json.code === 40900)
  r = await api('POST', '/auth/login', { body: { username, password: 'wrong-pass' } })
  check('错误密码 → 40100', r.json.code === 40100)
  r = await api('POST', '/auth/login', { body: { username, password } })
  check('登录成功拿到 token', r.json.code === 0 && r.json.data?.token)
  const token = r.json.data.token
  r = await api('GET', '/auth/me', { token })
  check('GET /auth/me 返回当前用户', r.json.code === 0 && r.json.data.username === username && r.json.data.role === 'USER')
  r = await api('GET', '/auth/me')
  check('无 token 访问 me → 40100', r.json.code === 40100 && r.status === 401)

  console.log('\n[2. stars & SSE]')
  r = await api('GET', '/stars')
  check('GET /stars 返回数组', r.json.code === 0 && Array.isArray(r.json.data))
  const before = r.json.data.length
  const sample = r.json.data[0]
  check(
    '星星含坐标/颜色/情绪/点赞数/星座字段',
    sample && ['posX', 'posY', 'posZ', 'colorHex', 'emotion', 'lightCount', 'constellation'].every((k) => k in sample),
  )

  const sse = await openSSE()
  check('SSE Content-Type 为 text/event-stream', sse.contentType?.startsWith('text/event-stream'))
  await sse.waitFor('connected')
  check('收到 connected 事件', true)

  const content = `今天在图书馆自习，室友给我带了一杯热奶茶，好开心！#${Date.now()}`
  r = await api('POST', '/stars', { token, body: { content } })
  const star = r.json.data
  check('正常发星成功 code=0', r.json.code === 0 && star?.id && !star.blocked, JSON.stringify(r.json))
  check(
    'fallback 生成 aiReply/emotion/colorHex/themeTag',
    star && star.aiReply && ['warm', 'calm', 'joy', 'hope', 'touched'].includes(star.emotion) && /^#[0-9A-F]{6}$/i.test(star.colorHex) && star.themeTag,
    JSON.stringify(star),
  )
  const radius = star ? Math.hypot(star.posX, star.posY, star.posZ) : 0
  check(`球面坐标半径合理 (r=${radius.toFixed(2)})`, radius > 40 && radius < 60)

  try {
    const pushed = await sse.waitFor('star:new', (d) => d.id === star.id)
    check('SSE 广播 star:new 且内容一致', pushed.content === content)
  } catch (e) {
    check('SSE 广播 star:new', false, e.message)
  }

  console.log('\n[3. crisis safety net]')
  const crisisText = `最近压力太大了感觉活不下去好想轻生_${Date.now()}`
  const eventsBeforeCrisis = sse.events.length
  r = await api('POST', '/stars', { token, body: { content: crisisText } })
  check(
    '高危内容返回 code=0 且 blocked=true + riskLevel=CRISIS + 3条热线',
    r.json.code === 0 &&
      r.json.data?.blocked === true &&
      r.json.data?.riskLevel === 'CRISIS' &&
      typeof r.json.data?.careMessage === 'string' &&
      Array.isArray(r.json.data?.hotlines) &&
      r.json.data.hotlines.length >= 3,
    JSON.stringify(r.json),
  )
  const flaggedRecord = await prisma.star.findFirst({ where: { content: crisisText } })
  check('数据库留痕为 status=FLAGGED', flaggedRecord?.status === 'FLAGGED')
  r = await api('GET', '/stars')
  check('公共 GET /stars 不包含高危记录', !r.json.data.some((s) => s.content === crisisText))
  await new Promise((res) => setTimeout(res, 200))
  const crisisBroadcasted = sse.events.slice(eventsBeforeCrisis).some((e) => e.data?.content === crisisText)
  check('SSE 未广播高危记录', !crisisBroadcasted)

  console.log('\n[4. constellations & 5-star auto-formation]')
  r = await api('GET', '/constellations')
  check(
    'GET /constellations 返回星座列表（含 story/starCount/stars 坐标）',
    r.json.code === 0 &&
      Array.isArray(r.json.data) &&
      r.json.data.length >= 1 &&
      r.json.data[0].story &&
      Array.isArray(r.json.data[0].stars),
    JSON.stringify(r.json.data?.[0]),
  )
  const hasSelfCareBefore = r.json.data.some((c) => c.themeTag === '自我疗愈')
  if (!hasSelfCareBefore) {
    const selfCareTexts = [
      '今天给自己泡了一杯温水慢慢喝完，学会放过自己。',
      '睡前做了三次深呼吸，感觉紧绷了一天的心放松了下来。',
      '原谅了今天的小失误，给自己一点独处和疗愈的时间。',
      '戴上耳机听了一首安静的歌，慢下来照顾自己的情绪。',
      '散步回家时告诉自己已经很努力了，今天也要早睡。',
    ]
    for (const t of selfCareTexts) {
      const pub = await api('POST', '/stars', { token, body: { content: t } })
      if (pub.json.code !== 0 || pub.json.data?.blocked) {
        check('发布自我疗愈测试星', false, JSON.stringify(pub.json))
      }
    }
    try {
      const formed = await sse.waitFor('constellation:new', (c) => c.themeTag === '自我疗愈')
      check(
        `5 颗同主题星触发 AI 成座并 SSE 广播 constellation:new（${formed.name}）`,
        formed.starCount >= 5 && formed.story.length >= 20,
      )
    } catch (e) {
      check('5 颗同主题星触发 constellation:new', false, e.message)
    }
    r = await api('GET', '/constellations')
    check('GET /constellations 已包含新生成的「自我疗愈」星座', r.json.data.some((c) => c.themeTag === '自我疗愈'))
  } else {
    check('「自我疗愈」星座已存在（跳过 5 星成座测试）', true)
  }

  console.log('\n[5. daily micro-actions]')
  r = await api('GET', '/micro-actions/today', { token })
  check(
    'GET /micro-actions/today 返回 3 条今日微行动',
    r.json.code === 0 && r.json.data?.actions?.length === 3 && r.json.data?.completedCount === 0,
    JSON.stringify(r.json),
  )
  const firstAction = r.json.data.actions[0]
  r = await api('POST', `/micro-actions/${firstAction.id}/complete`, { token, body: { note: '完成了微行动，感觉今天好温暖！' } })
  check(
    '完成微行动打卡自动生成新星并更新进度 (1/3)',
    r.json.code === 0 && r.json.data?.star?.id && r.json.data?.progress?.completedCount === 1,
    JSON.stringify(r.json),
  )
  r = await api('POST', `/micro-actions/${firstAction.id}/complete`, { token, body: {} })
  check('重复打卡返回 40900', r.json.code === 40900 && r.status === 409)

  console.log('\n[6. encourage, detail & delete]')
  r = await api('GET', '/stars/presets')
  const presetId = r.json.data[0].id
  r = await api('POST', `/stars/${star.id}/encourage`, { token, body: { presetId } })
  check('点亮成功，lightCount=1', r.json.code === 0 && r.json.data.lightCount === 1)
  r = await api('POST', `/stars/${star.id}/encourage`, { token, body: { presetId } })
  check('重复点亮 → 40900', r.json.code === 40900)
  r = await api('GET', `/stars/${star.id}`, { token })
  check('详情 litByMe=true', r.json.code === 0 && r.json.data.litByMe === true)

  console.log('\n[7. profile overview & monthly review]')
  r = await api('GET', '/profile/overview', { token })
  check(
    '普通用户 GET /profile/overview 成功（含 stats/calendar/trend30Days/stars）',
    r.json.code === 0 &&
      r.json.data?.stats?.totalStars >= 1 &&
      Array.isArray(r.json.data?.trend30Days) &&
      r.json.data.trend30Days.length === 30 &&
      Array.isArray(r.json.data?.stars),
    JSON.stringify(r.json).slice(0, 200),
  )
  r = await api('POST', '/profile/monthly-review', { token, body: {} })
  check(
    'POST /profile/monthly-review 返回 keywords + summary',
    r.json.code === 0 && Array.isArray(r.json.data?.keywords) && r.json.data.keywords.length >= 2 && r.json.data?.summary?.length >= 30,
    JSON.stringify(r.json),
  )

  console.log('\n[8. admin auth, stats, moderation & SSE sync]')
  r = await api('GET', '/admin/stats', { token })
  check('普通用户访问 /admin/stats → 40300 (HTTP 403)', r.status === 403 && r.json.code === 40300)
  r = await api('GET', '/admin/stars', { token })
  check('普通用户访问 /admin/stars → 40300 (HTTP 403)', r.status === 403 && r.json.code === 40300)

  const adminLogin = await api('POST', '/auth/login', {
    body: {
      username: process.env.SEED_ADMIN_USERNAME || 'admin',
      password: process.env.SEED_ADMIN_PASSWORD || 'admin123456',
    },
  })
  const adminToken = adminLogin.json.data?.token
  check('管理员登录成功', adminLogin.json.code === 0 && Boolean(adminToken))

  r = await api('GET', '/admin/stats', { token: adminToken })
  check(
    '管理员 GET /admin/stats 返回看板指标与情绪分布/7日趋势',
    r.json.code === 0 &&
      r.json.data?.totalUsers >= 2 &&
      r.json.data?.flaggedStars >= 1 &&
      r.json.data?.trend7Days?.length === 7,
    JSON.stringify(r.json),
  )
  r = await api('GET', '/admin/stars?status=FLAGGED&page=1&pageSize=10', { token: adminToken })
  check('管理员筛选 FLAGGED 审核列表成功', r.json.code === 0 && r.json.data?.items?.length >= 1)

  r = await api('PATCH', `/admin/stars/${star.id}/status`, { token: adminToken, body: { status: 'HIDDEN' } })
  check('管理员隐藏星星成功', r.json.code === 0 && r.json.data?.status === 'HIDDEN')
  try {
    await sse.waitFor('star:remove', (d) => d.starId === star.id)
    check('隐藏星星触发 SSE star:remove', true)
  } catch (e) {
    check('隐藏星星触发 SSE star:remove', false, e.message)
  }

  r = await api('PATCH', `/admin/stars/${star.id}/status`, { token: adminToken, body: { status: 'APPROVED' } })
  check('管理员恢复展示成功', r.json.code === 0 && r.json.data?.status === 'APPROVED')
  try {
    await sse.waitFor('star:new', (d) => d.id === star.id)
    check('恢复展示触发 SSE star:new', true)
  } catch (e) {
    check('恢复展示触发 SSE star:new', false, e.message)
  }

  r = await api('DELETE', `/admin/stars/${star.id}`, { token: adminToken })
  check('管理员永久删除成功', r.json.code === 0 && r.json.data?.id === star.id)
  try {
    await sse.waitFor('star:remove', (d) => d.starId === star.id)
    check('管理员删除触发 SSE star:remove', true)
  } catch (e) {
    check('管理员删除触发 SSE star:remove', false, e.message)
  }

  console.log('\n[9. guest login, live comments, moderation & presence]')
  const guestRes = await api('POST', '/auth/guest', { body: { nickname: '仰望星空的猫' } })
  const guestToken = guestRes.json.data?.token
  check(
    '免注册昵称快登 POST /auth/guest 成功',
    guestRes.json.code === 0 && guestRes.json.data?.user?.isGuest === true && Boolean(guestToken),
    JSON.stringify(guestRes.json),
  )

  const listStars = await api('GET', '/stars')
  const targetStar = listStars.json.data[0]
  check('GET /stars 包含 commentCount 字段', typeof targetStar?.commentCount === 'number')

  const commentText = `太暖心啦，愿你每天都被温柔以待_${Date.now()}`
  r = await api('POST', `/stars/${targetStar.id}/comments`, { token: guestToken, body: { content: commentText } })
  const newComment = r.json.data?.comment
  check('访客发表留言成功', r.json.code === 0 && Boolean(newComment?.id), JSON.stringify(r.json))
  try {
    const pushed = await sse.waitFor('star:comment', (d) => d.comment?.id === newComment.id)
    check('SSE 实时广播 star:comment 且内容一致', pushed.comment.content === commentText)
  } catch (e) {
    check('SSE 实时广播 star:comment', false, e.message)
  }

  r = await api('POST', `/stars/${targetStar.id}/comments`, { token: guestToken, body: { content: '你这个傻逼滚蛋吧' } })
  check(
    '不友善留言拦截 → blocked=true, riskLevel=UNFRIENDLY',
    r.json.code === 0 && r.json.data?.blocked === true && r.json.data?.riskLevel === 'UNFRIENDLY',
    JSON.stringify(r.json),
  )

  r = await api('POST', `/stars/${targetStar.id}/comments`, { token: guestToken, body: { content: '我也感觉活不下去想轻生' } })
  check(
    '高危留言拦截 → blocked=true, riskLevel=CRISIS + hotlines',
    r.json.code === 0 && r.json.data?.blocked === true && r.json.data?.riskLevel === 'CRISIS' && r.json.data?.hotlines?.length >= 3,
    JSON.stringify(r.json),
  )

  r = await api('GET', '/admin/comments?status=FLAGGED', { token: adminToken })
  check('管理员查询被拦截留言列表成功', r.json.code === 0 && r.json.data?.items?.length >= 2)

  r = await api('PATCH', `/admin/comments/${newComment.id}/status`, { token: adminToken, body: { status: 'HIDDEN' } })
  check('管理员隐藏留言成功', r.json.code === 0 && r.json.data?.status === 'HIDDEN')
  try {
    await sse.waitFor('star:comment:remove', (d) => d.commentId === newComment.id)
    check('隐藏留言触发 SSE star:comment:remove', true)
  } catch (e) {
    check('隐藏留言触发 SSE star:comment:remove', false, e.message)
  }

  r = await api('PATCH', `/admin/comments/${newComment.id}/status`, { token: adminToken, body: { status: 'APPROVED' } })
  check('管理员恢复留言成功', r.json.code === 0 && r.json.data?.status === 'APPROVED')

  r = await api('DELETE', `/stars/${targetStar.id}/comments/${newComment.id}`, { token: guestToken })
  check('留言作者删除留言成功', r.json.code === 0 && r.json.data?.id === newComment.id)
  try {
    await sse.waitFor('star:comment:remove', (d) => d.commentId === newComment.id)
    check('删除留言触发 SSE star:comment:remove', true)
  } catch (e) {
    check('删除留言触发 SSE star:comment:remove', false, e.message)
  }

  const presenceSeen = sse.events.some((e) => e.event === 'presence:count' && typeof e.data?.onlineCount === 'number')
  check('SSE 广播 presence:count 实时在线人数', presenceSeen)

  sse.close()
  await prisma.$disconnect()
  console.log(`\n结果：${passed} 通过，${failed} 失败`)
  process.exit(failed ? 1 : 0)
}

main().catch(async (e) => {
  console.error('测试异常：', e)
  await prisma.$disconnect()
  process.exit(1)
})
