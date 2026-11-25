/**
 * AI 服务 + 双层安全兜底
 * ------------------------------------------------------------
 * 第一层（本地毫秒级）：命中高危词库直接判定 CRISIS，不调用大模型。
 * 第二层（大模型结构化分析）：8 秒超时 + markdown JSON 容错解析；
 *   当 LLM_API_KEY 未配置、超时或任何报错时，无缝降级到本地高质量 fallback，绝不抛 500。
 */
import { EMOTION_COLORS, EMOTIONS, THEME_TAGS } from '../constants/index.js'
import { chatJSON, isLLMEnabled } from '../lib/llm.js'

// ---------------- 第一层：本地高危词库 ----------------

const CRISIS_KEYWORDS = [
  '轻生',
  '自杀',
  '自残',
  '割腕',
  '跳楼',
  '跳河',
  '跳桥',
  '不想活',
  '活不下去',
  '活着没意思',
  '结束生命',
  '离开这个世界',
  '了结自己',
  '寻死',
  '吞药',
  '想死',
  '去死',
  '解脱了算了',
  '一了百了',
]

export function detectLocalCrisis(content) {
  return CRISIS_KEYWORDS.find((kw) => content.includes(kw)) || null
}

// ---------------- 本地高质量 fallback 规则 ----------------

const EMOTION_KEYWORDS = [
  ['touched', ['感动', '谢谢', '暖心', '帮我', '借我', '送我', '陌生人', '记得', '哭了', '眼眶']],
  ['joy', ['开心', '哈哈', '快乐', '惊喜', '中奖', '好吃', '笑', '耶', '尖叫']],
  ['hope', ['希望', '加油', '终于', '未来', '梦想', '通过', '上岸', '录取', '进步', 'offer', '答辩', '六级']],
  ['calm', ['安静', '夕阳', '晚霞', '晚风', '散步', '月亮', '雨', '发呆', '慢慢', '银杏', '深呼吸', '治愈']],
  ['warm', ['温暖', '暖', '阿姨', '热', '陪', '抱', '顺手', '豆浆', '奶茶']],
]

const THEME_KEYWORDS = [
  ['学习成长', ['图书馆', '自习', '借书', '考试', '考研', '通过', '论文', '答辩', '比赛', '实习', 'offer', '六级', '四级', '笔记', '小组', '教材']],
  ['友人同行', ['室友', '朋友', '同学', '学长', '学姐', '舍友', '社团', '跑道', '老朋友']],
  ['校园烟火', ['食堂', '阿姨', '饭', '奶茶', '早餐', '打菜', '鸡腿', '面', '豆浆', '香锅', '宿管', '快递']],
  ['陌生善意', ['陌生', '路人', '扶门', '借我', '让座', '雨伞', '薄荷糖', '便签', '大叔', '顺手']],
  ['自我疗愈', ['自己', '深呼吸', '放过', '慢下来', '喝茶', '温水', '失误', '独处', '散步', '早睡', '疗愈', '原谅', '安静', '歌']],
  ['自然微光', ['夕阳', '晚霞', '猫', '花', '雨', '晚风', '月亮', '樱花', '银杏', '星星', '彩虹', '天空', '树']],
]

const FALLBACK_REPLIES = {
  warm: [
    '这份暖意已经被星空稳稳接住了，愿它在你心里多停留一会儿，也悄悄照亮路过的人。',
    '原来温柔一直藏在这些不动声色的小事里，谢谢你把这份热乎乎的瞬间留在这里。',
  ],
  calm: [
    '在匆忙的日常里还能停下来感受这一刻的安静，本身就是很珍贵的能力，愿晚风一直温柔。',
    '慢下来的瞬间最让人安心，谢谢你把这份宁静分享给今夜的星空。',
  ],
  joy: [
    '隔着屏幕都能感受到那份轻快的笑意！这份快乐已经化作一颗闪闪发亮的星星啦。',
    '好明媚的小确幸，笑意是会传染的，今晚的夜空因为你又亮了一点点。',
  ],
  hope: [
    '每一点向前走的脚步都算数，你正在稳稳地靠近更好的自己，星空会记住这一刻的光。',
    '破晓前的微光最动人，恭喜你迎来属于自己的好消息，继续温柔而坚定地走下去吧。',
  ],
  touched: [
    '被世界轻轻托住的瞬间值得被记住，谢谢你把这份善意保存下来，让它继续传递下去。',
    '人与人之间那些不经意的温柔，往往能照亮很久很久，愿你也常被这样善待。',
  ],
}

const FALLBACK_CONSTELLATIONS = {
  学习成长: {
    name: '破晓书座',
    story: '由深夜自习室的灯光、书页间的鼓励便签与每一次终于跨过的难关汇聚而成。它提醒每个赶路的人，默默积蓄的微光终会连成照亮前路的星轨。',
  },
  友人同行: {
    name: '同行暖座',
    story: '这是属于并肩奔跑的星座——暴雨中递来的雨伞、跑道旁的呐喊、宿舍里的笑声，每一颗星都在轻声说着“有你在真好”。',
  },
  校园烟火: {
    name: '烟火微座',
    story: '由食堂窗口多添的一勺菜、冬日清晨的热豆浆与驿站熟悉的问候连成。最朴素的校园烟火气，往往最能熨帖疲惫的心。',
  },
  陌生善意: {
    name: '拾光善座',
    story: '素昧平生却愿意多等两秒扶住一扇门、分出一颗薄荷糖。这些不留姓名的温柔在夜空相遇，织成了一张默默接住彼此的星网。',
  },
  自我疗愈: {
    name: '栖心静座',
    story: '献给所有学会温柔对待自己的时刻：一杯温水、三次深呼吸、原谅一个小小失误。在这里，不必匆忙，你可以安心停靠。',
  },
  自然微光: {
    name: '晚风星座',
    story: '粉紫色的晚霞、落满银杏的小道与爱翻肚皮的校园橘猫，大自然每天都在校园角落写下情书，被抬头看天空的人一一收藏。',
  },
}

function matchFirst(table, text, fallback) {
  for (const [key, words] of table) {
    if (words.some((w) => text.includes(w))) return key
  }
  return fallback
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

function fallbackAnalyze(content) {
  const emotion = matchFirst(EMOTION_KEYWORDS, content, 'warm')
  const themeTag = matchFirst(THEME_KEYWORDS, content, '自我疗愈')
  return {
    riskLevel: 'SAFE',
    emotion,
    colorHex: EMOTION_COLORS[emotion],
    themeTag,
    aiReply: pick(FALLBACK_REPLIES[emotion]),
    source: 'fallback',
  }
}

// ---------------- 第二层：大模型结构化分析 ----------------

const STAR_SYSTEM_PROMPT = `你是「微光星空」的守夜人，负责倾听高校学生记录的校园小善意与日常微光，并给出温暖、克制、不说教、不敷衍的简短回应。

请严格只输出一个 JSON 对象，不要包含任何额外解释，字段必须完全符合以下格式：
{
  "riskLevel": "SAFE" | "CAUTION" | "CRISIS",
  "emotion": "warm" | "calm" | "joy" | "hope" | "touched",
  "themeTag": "学习成长" | "友人同行" | "校园烟火" | "陌生善意" | "自我疗愈" | "自然微光",
  "aiReply": "30-60字温暖、克制、有共情力的中文回应，不说教、不用感叹号堆砌"
}

安全分级规则：
- CRISIS：表达轻生、自杀、自残、极端绝望或明确伤害自己的念头。
- CAUTION：有明显低落、焦虑、压力大或委屈，但无自伤/轻生倾向（此时仍给予温和共情的 aiReply）。
- SAFE：正常的日常善意、小确幸、感谢、感动或平静记录。`

/**
 * 分析星星内容（双层安全防线 + 8s 超时 + 自动 fallback）
 */
export async function analyzeStar(content) {
  // 第一层：本地毫秒级高危词拦截
  if (detectLocalCrisis(content)) {
    return {
      riskLevel: 'CRISIS',
      emotion: 'calm',
      colorHex: EMOTION_COLORS.calm,
      themeTag: '自我疗愈',
      aiReply: null,
      source: 'local-crisis',
    }
  }

  // 未启用 LLM 时直接使用本地高质量 fallback
  if (!isLLMEnabled()) {
    return fallbackAnalyze(content)
  }

  // 第二层：大模型结构化分析
  try {
    const parsed = await chatJSON([
      { role: 'system', content: STAR_SYSTEM_PROMPT },
      { role: 'user', content },
    ])

    const riskLevel = ['SAFE', 'CAUTION', 'CRISIS'].includes(parsed?.riskLevel) ? parsed.riskLevel : 'SAFE'
    const emotion = EMOTIONS.includes(parsed?.emotion) ? parsed.emotion : matchFirst(EMOTION_KEYWORDS, content, 'warm')
    const themeTag = THEME_TAGS.includes(parsed?.themeTag) ? parsed.themeTag : matchFirst(THEME_KEYWORDS, content, '自我疗愈')
    const aiReply =
      typeof parsed?.aiReply === 'string' && parsed.aiReply.trim().length >= 8
        ? parsed.aiReply.trim().slice(0, 140)
        : pick(FALLBACK_REPLIES[emotion])

    return {
      riskLevel,
      emotion,
      colorHex: EMOTION_COLORS[emotion],
      themeTag,
      aiReply,
      source: 'llm',
    }
  } catch (err) {
    console.warn('[ai.service] LLM analyzeStar failed, degrading to fallback:', err.message)
    return fallbackAnalyze(content)
  }
}

// ---------------- AI 星座命名与故事生成 ----------------

const CONSTELLATION_SYSTEM_PROMPT = `你是「微光星空」的星图诗人。根据同一主题下多条校园微光记录，为这片新诞生的星座起一个浪漫的名字并写一段简短的星座故事。

严格只输出一个 JSON 对象：
{
  "name": "3-5个中文字的浪漫星座名，建议以「座」结尾",
  "story": "60-80个中文字的温柔星座小故事，克制、有画面感、不说教"
}`

export async function generateConstellationStory(themeTag, starContents = []) {
  const fb = FALLBACK_CONSTELLATIONS[themeTag] || {
    name: `${themeTag.slice(0, 2)}微光座`,
    story: `由校园里围绕「${themeTag}」的点滴善意汇聚而成的星座。每一颗星都是一次被记住的温柔，当它们在夜空相连，便成了照亮彼此的星轨。`,
  }

  if (!isLLMEnabled()) return fb

  try {
    const sample = starContents.slice(0, 8).map((c, i) => `${i + 1}. ${c}`).join('\n')
    const parsed = await chatJSON([
      { role: 'system', content: CONSTELLATION_SYSTEM_PROMPT },
      { role: 'user', content: `主题：${themeTag}\n星星记录：\n${sample}` },
    ])
    const name = typeof parsed?.name === 'string' && parsed.name.trim().length >= 2 ? parsed.name.trim().slice(0, 8) : fb.name
    const story =
      typeof parsed?.story === 'string' && parsed.story.trim().length >= 20 ? parsed.story.trim().slice(0, 160) : fb.story
    return { name, story }
  } catch (err) {
    console.warn('[ai.service] LLM generateConstellationStory failed, using fallback:', err.message)
    return fb
  }
}

// ---------------- 月度微光回顾生成 ----------------

const EMOTION_ZH = {
  warm: '温暖',
  calm: '平静',
  joy: '喜悦',
  hope: '希望',
  touched: '感动',
}

const MONTHLY_REVIEW_PROMPT = `你是「微光星空」的记忆记录者。请根据这位同学近期记录的校园小善意与日常微光，为 TA 写一份温柔、克制、有画面感的「月度微光回顾」，不说教、不空洞。

严格只输出一个 JSON 对象：
{
  "keywords": ["3到4个精炼的中文关键词，每个2-4字"],
  "summary": "80-120个中文字的温暖回顾总结，结合 TA 的具体经历给予温柔肯定"
}`

function fallbackMonthlyReview(stars, monthLabel) {
  if (!stars.length) {
    return {
      keywords: ['蓄力待光', '温柔启程', '静候微光'],
      summary: `${monthLabel} 的夜空还在安静地等待你的第一缕微光。不必急着寻找宏大的快乐，哪怕是食堂多添的一勺菜、傍晚抬头撞见的晚霞，或是对自己说的一句辛苦了，都值得被轻轻放进这片星空里。`,
    }
  }

  const emoCount = {}
  const tagCount = {}
  let lights = 0
  for (const s of stars) {
    emoCount[s.emotion] = (emoCount[s.emotion] || 0) + 1
    tagCount[s.themeTag] = (tagCount[s.themeTag] || 0) + 1
    lights += s.lightCount || 0
  }
  const topEmotion = Object.entries(emoCount).sort((a, b) => b[1] - a[1])[0][0]
  const topTags = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([t]) => t)

  const emoName = EMOTION_ZH[topEmotion] || '温暖'
  const keywords = [...new Set([`${emoName}底色`, ...topTags, '微光同行'])].slice(0, 4)
  const tagPhrase = topTags.join('与')

  return {
    keywords,
    summary: `在 ${monthLabel} 里，你一共点亮了 ${stars.length} 颗微光星，收获了 ${lights} 次来自星空的温柔回应。你的星轨以「${emoName}」为主调，记录了许多关于${tagPhrase}的闪光瞬间。谢谢你把这些不动声色的善意珍藏下来，愿下个月的晚风依然轻柔，继续陪你慢慢发光。`,
  }
}

export async function generateMonthlyReview(stars = [], monthLabel = '近期') {
  const fb = fallbackMonthlyReview(stars, monthLabel)
  if (!stars.length || !isLLMEnabled()) return fb

  try {
    const sample = stars
      .slice(0, 15)
      .map((s, i) => `${i + 1}. [${EMOTION_ZH[s.emotion] || s.emotion}/${s.themeTag}] ${s.content}`)
      .join('\n')
    const parsed = await chatJSON([
      { role: 'system', content: MONTHLY_REVIEW_PROMPT },
      { role: 'user', content: `时间范围：${monthLabel}（共 ${stars.length} 颗星）\n记录列表：\n${sample}` },
    ])
    const keywords =
      Array.isArray(parsed?.keywords) && parsed.keywords.length >= 2
        ? parsed.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 5)
        : fb.keywords
    const summary =
      typeof parsed?.summary === 'string' && parsed.summary.trim().length >= 30
        ? parsed.summary.trim().slice(0, 220)
        : fb.summary
    return { keywords, summary }
  } catch (err) {
    console.warn('[ai.service] LLM generateMonthlyReview failed, using fallback:', err.message)
    return fb
  }
}

// ---------------- 星语回响：留言双层安全审核 ----------------

const ABUSE_KEYWORDS = [
  '傻逼',
  '煞笔',
  '草泥马',
  '妈的',
  '滚蛋',
  '废物',
  '垃圾人',
  '脑残',
  '智障',
  '装逼',
  '恶心死',
  '丑八怪',
  '贱人',
  '闭嘴吧你',
  '有病吧',
  '真下头',
  '滚出去',
]

const COMMENT_MODERATION_PROMPT = `你是「微光星空」校园匿名善意社区的友善度审核员。请快速判断以下留言是否友善。

严格只输出一个 JSON 对象：
{ "verdict": "SAFE" | "UNFRIENDLY" | "CRISIS" }

判定规则：
- CRISIS：表达轻生、自杀、自残或极端绝望念头。
- UNFRIENDLY：包含人身攻击、辱骂、恶意嘲讽、阴阳怪气引战、或严重负能量打击他人。
- SAFE：正常鼓励、共鸣、玩笑、温暖互动或中性交流。`

/**
 * 留言双层安全审核：
 * - 第一层（本地毫秒级）：高危自伤词 → CRISIS；辱骂/攻击词 → UNFRIENDLY
 * - 第二层（AI 友善度快速判定，5 秒超时）：超时或异常自动放行 SAFE，绝不卡顿
 * @returns {Promise<{ decision: 'SAFE' | 'UNFRIENDLY' | 'CRISIS' }>}
 */
export async function moderateComment(content) {
  if (detectLocalCrisis(content)) {
    return { decision: 'CRISIS' }
  }
  if (ABUSE_KEYWORDS.some((kw) => content.includes(kw))) {
    return { decision: 'UNFRIENDLY' }
  }
  if (!isLLMEnabled()) {
    return { decision: 'SAFE' }
  }

  try {
    const parsed = await chatJSON(
      [
        { role: 'system', content: COMMENT_MODERATION_PROMPT },
        { role: 'user', content },
      ],
      { temperature: 0.1 },
      5000,
    )
    const verdict = parsed?.verdict
    if (verdict === 'CRISIS' || verdict === 'UNFRIENDLY') {
      return { decision: verdict }
    }
    return { decision: 'SAFE' }
  } catch (err) {
    console.warn('[ai.service] LLM moderateComment degraded to SAFE:', err.message)
    return { decision: 'SAFE' }
  }
}
