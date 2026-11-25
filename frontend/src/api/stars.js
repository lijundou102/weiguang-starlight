import { apiUrl, http } from './request'

export const STREAM_URL = apiUrl('/stars/stream')

/** 所有 APPROVED 星星（含 commentCount） */
export const listStars = () => http.get('/stars')

/** 单星详情（含 litByMe、comments 与 commentCount） */
export const getStar = (id) => http.get(`/stars/${id}`)

/** 发布新星 */
export const createStar = (content) => http.post('/stars', { content })

/** 删除星星（作者 / ADMIN） */
export const deleteStar = (id) => http.del(`/stars/${id}`)

/** 预设鼓励语 [{ id, text }] */
export const getPresets = () => http.get('/stars/presets')

/** 点亮并发送预设鼓励语 */
export const encourageStar = (id, presetId) => http.post(`/stars/${id}/encourage`, { presetId })

/** 发表实时留言（星语回响） */
export const createComment = (starId, content) => http.post(`/stars/${starId}/comments`, { content })

/** 删除留言（评论作者 / 星主 / ADMIN） */
export const deleteComment = (starId, commentId) => http.del(`/stars/${starId}/comments/${commentId}`)
