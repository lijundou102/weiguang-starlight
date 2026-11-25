import { http } from './request'

/** 获取今日 3 条微行动（登录时附带 completed 状态） */
export const getTodayMicroActions = () => http.get('/micro-actions/today')

/** 完成微行动并自动点亮新星 */
export const completeMicroAction = (id, note) =>
  http.post(`/micro-actions/${id}/complete`, note ? { note } : {})
