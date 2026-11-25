export const EMOTION_META = {
  warm: { label: '温暖', color: '#FFB86B' },
  calm: { label: '平静', color: '#7FB3FF' },
  joy: { label: '喜悦', color: '#FFE066' },
  hope: { label: '希望', color: '#8BE9A8' },
  touched: { label: '感动', color: '#FF8FB1' },
}

export const emotionLabel = (e) => EMOTION_META[e]?.label ?? e

export function relativeTime(iso) {
  const t = new Date(iso).getTime()
  const diff = (Date.now() - t) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** hex → rgba 字符串，用于 CSS 发光 */
export function hexAlpha(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
