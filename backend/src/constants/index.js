/** 情绪 → 星光颜色 */
export const EMOTION_COLORS = {
  warm: '#FFB86B', // 暖橙
  calm: '#7FB3FF', // 静蓝
  joy: '#FFE066', // 明黄
  hope: '#8BE9A8', // 新绿
  touched: '#FF8FB1', // 柔粉
}

export const EMOTIONS = Object.keys(EMOTION_COLORS)

/** 主题标签（与星座 themeTag 一一对应） */
export const THEME_TAGS = ['学习成长', '友人同行', '校园烟火', '陌生善意', '自我疗愈', '自然微光']

/** 预设鼓励语：前端只能提交 presetId，不支持自由文本 */
export const ENCOURAGEMENT_PRESETS = [
  { id: 'hug', text: '抱抱你，这份温暖我收到了' },
  { id: 'shine', text: '你的星星好亮，照到我了 ✨' },
  { id: 'same', text: '我也有过同样的小确幸！' },
  { id: 'cheer', text: '加油，明天也会有好事发生' },
  { id: 'thanks', text: '谢谢你分享这份美好' },
  { id: 'keep', text: '愿这份光一直陪着你' },
]

/** 危机干预安抚文案与求助热线 */
export const CRISIS_CARE_MESSAGE =
  '读到这些话，能感受到你此刻正承受着很大的重量。你不需要把一切都独自扛在肩上，也没有人会评判你的脆弱。现在请先停下来深呼吸一下，试着联系下面愿意倾听你的人，有人正在等着接住你。'

export const CRISIS_HOTLINES = [
  { name: '全国统一心理援助热线', phone: '12356', desc: '24小时免费公益心理支持' },
  { name: '希望24热线', phone: '400-161-9995', desc: '24小时生命危机干预热线' },
  { name: '校园心理支持', phone: '联系学校心理健康教育中心或身边信任的师友', desc: '你不必独自承受' },
]

export const CONSTELLATION_THRESHOLD = 5
export const STAR_SPHERE_RADIUS = 50
export const STAR_CONTENT_MAX = 500
