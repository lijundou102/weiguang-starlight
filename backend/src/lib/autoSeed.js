/**
 * 生产环境首次空库安全自动初始化（幂等，绝不覆盖已有真实数据）
 * 仅当环境变量 AUTO_SEED_IF_EMPTY=true 且 Star 表为空时执行
 */
import bcrypt from 'bcryptjs'
import prisma from './prisma.js'
import { EMOTION_COLORS } from '../constants/index.js'
import { randomSpherePosition } from '../utils/sphere.js'

const CONSTELLATIONS = [
  {
    themeTag: '校园烟火',
    name: '烟火微座',
    story: '由食堂窗口多添的一勺菜、冬日清晨的热豆浆与驿站熟悉的问候连成。最朴素的校园烟火气，往往最能熨帖疲惫的心。',
  },
  {
    themeTag: '学习成长',
    name: '破晓书座',
    story: '由深夜自习室的灯光、书页间的鼓励便签与每一次终于跨过的难关汇聚而成。它提醒每个赶路的人，默默积蓄的微光终会连成星轨。',
  },
  {
    themeTag: '友人同行',
    name: '同行暖座',
    story: '这是属于并肩奔跑的星座——暴雨中递来的雨伞、跑道旁的呐喊、宿舍里的笑声，每一颗星都在轻声说着“有你在真好”。',
  },
  {
    themeTag: '自然微光',
    name: '晚风星座',
    story: '粉紫色的晚霞、落满银杏的小道与爱翻肚皮的校园橘猫，大自然每天都在校园角落写下情书，被抬头看天空的人一一收藏。',
  },
  {
    themeTag: '陌生善意',
    name: '拾光善座',
    story: '素昧平生却愿意多等两秒扶住一扇门、分出一颗薄荷糖。这些不留姓名的温柔在夜空相遇，织成了一张默默接住彼此的星网。',
  },
]

const STARS = [
  ['今天食堂阿姨看我饭卡余额不多，偷偷多给我打了一个鸡腿，说“多吃点，考试加油”。', 'touched', '校园烟火', '被世界轻轻托住的瞬间值得被记住，谢谢你把这份善意保存下来。', 23],
  ['冬天早上七点的食堂，第一口热豆浆下肚，感觉整个人都被唤醒了。', 'warm', '校园烟火', '这份暖意已经被星空稳稳接住了，愿它在你心里多停留一会儿。', 12],
  ['二食堂新出的麻辣香锅居然只要12块，和室友吃到扶墙出去哈哈哈。', 'joy', '校园烟火', '隔着屏幕都能感受到那份轻快的笑意，今晚的夜空又亮了一点点。', 9],
  ['在图书馆三楼靠窗的位置坐了一下午，阳光刚好落在书页上，安静得能听见翻书声。', 'calm', '学习成长', '慢下来的瞬间最让人安心，谢谢你把这份宁静分享给今夜的星空。', 15],
  ['准备了三个月的六级终于过了！查分那一刻在宿舍尖叫出声。', 'hope', '学习成长', '每一点向前走的脚步都算数，恭喜你迎来属于自己的好消息。', 25],
  ['毕业论文答辩结束，导师说“这是我今年听过最用心的一篇”，眼眶一下就热了。', 'hope', '学习成长', '破晓前的微光最动人，星空会记住这一刻属于你的光芒。', 19],
  ['突然下暴雨没带伞，室友冒雨跑来教学楼给我送伞，自己淋湿了一半。', 'touched', '友人同行', '人与人之间这些不经意的温柔，往往能照亮很久很久。', 27],
  ['体测八百米跑到想放弃，听到跑道边舍友在喊我名字，最后居然及格了！', 'hope', '友人同行', '有并肩同行的人在身边，再长的跑道也会变得轻快起来。', 20],
  ['社团招新那天，学长记住了我的名字，还说“欢迎回家”。', 'warm', '友人同行', '原来温柔一直藏在这些不动声色的小事里，愿你常被善待。', 8],
  ['傍晚从实验楼出来，整片天空都是粉紫色的夕阳，忍不住停下来拍了好久。', 'calm', '自然微光', '在匆忙的日常里停下来看一眼晚霞，本身就是很珍贵的温柔。', 22],
  ['宿舍楼下那只橘猫今天主动蹭了我的腿，还翻肚皮给我摸！', 'joy', '自然微光', '好明媚的小确幸，毛孩子也在用它的方式喜欢着你呀。', 34],
  ['十一月的银杏大道全黄了，踩在落叶上沙沙响，秋天真的好温柔。', 'calm', '自然微光', '把秋天的声音收进星空里，愿晚风一直这样轻柔。', 16],
  ['借的二手教材里夹着一张学姐留的便签：“这一章很难，但你一定可以的！”', 'touched', '陌生善意', '跨过时光的善意最动人，谢谢你接住了这份温柔并继续传递。', 31],
  ['期末周凌晨的自习室，旁边陌生同学默默分了我一颗薄荷糖。', 'warm', '陌生善意', '不必言说的默契与鼓励，让深夜的自习室一下子亮堂了起来。', 18],
  ['快递站的大叔每次都会帮我把重箱子搬到门口，今天还笑着说“又见面啦”。', 'warm', '陌生善意', '这些日常里反复出现的小善意，是校园最踏实的底色。', 11],
]

export async function autoSeedIfEmpty() {
  if (process.env.AUTO_SEED_IF_EMPTY !== 'true') return

  const starCount = await prisma.star.count()
  if (starCount > 0) return

  const adminUsername = process.env.SEED_ADMIN_USERNAME || 'admin'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123456'

  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {},
    create: {
      username: adminUsername,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      nickname: '星空守望者',
      role: 'ADMIN',
    },
  })

  const studentPass = await bcrypt.hash('student123', 10)
  const [linfeng, ayun] = await Promise.all([
    prisma.user.upsert({
      where: { username: 'linfeng' },
      update: {},
      create: { username: 'linfeng', passwordHash: studentPass, nickname: '林间晚风', role: 'USER' },
    }),
    prisma.user.upsert({
      where: { username: 'ayun' },
      update: {},
      create: { username: 'ayun', passwordHash: studentPass, nickname: '阿云同学', role: 'USER' },
    }),
  ])

  const constellationByTag = {}
  for (const c of CONSTELLATIONS) {
    const created = await prisma.constellation.upsert({
      where: { themeTag: c.themeTag },
      update: {},
      create: c,
    })
    constellationByTag[c.themeTag] = created.id
  }

  const base = Date.now() - STARS.length * 3_600_000
  const createdStars = []
  for (let i = 0; i < STARS.length; i++) {
    const [content, emotion, themeTag, aiReply, lightCount] = STARS[i]
    const s = await prisma.star.create({
      data: {
        userId: admin.id,
        content,
        aiReply,
        emotion,
        colorHex: EMOTION_COLORS[emotion],
        themeTag,
        ...randomSpherePosition(),
        lightCount,
        status: 'APPROVED',
        constellationId: constellationByTag[themeTag] ?? null,
        createdAt: new Date(base + i * 3_600_000),
      },
    })
    createdStars.push(s)
  }

  const SEED_COMMENTS = [
    [0, linfeng.id, '我们二食堂打菜的阿姨也超温柔，每次都问我够不够吃！'],
    [0, ayun.id, '看完眼眶有点热，祝你考试顺顺利利呀 ✨'],
    [3, ayun.id, '三楼靠窗那个角落也是我的宝藏座位，下午的光真的绝美'],
    [4, linfeng.id, '恭喜上岸六级！！沾沾你的好运气！'],
    [6, linfeng.id, '这样的室友请给我来一打，太暖了呜呜'],
    [9, ayun.id, '那天傍晚我也拍到了那片粉紫色晚霞，整个朋友圈都在刷屏'],
    [10, linfeng.id, '是不是三号楼门口那只大橘？它超爱蹭人裤脚哈哈'],
    [12, ayun.id, '之前也在旧书里翻到过学长的笔记，感觉像收到一封跨时空的信'],
  ]

  await prisma.comment.createMany({
    data: SEED_COMMENTS.map(([starIdx, userId, content], idx) => ({
      starId: createdStars[starIdx].id,
      userId,
      content,
      status: 'APPROVED',
      createdAt: new Date(base + (starIdx + 1) * 3_600_000 + (idx + 1) * 600_000),
    })),
  })

  console.log(`[weiguang-backend] 首次空库自动初始化完成：管理员 ${adminUsername}，星座 5，星星 ${STARS.length}，留言 ${SEED_COMMENTS.length}`)
}
