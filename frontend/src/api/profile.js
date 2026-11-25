import { http } from './request'

/** 个人星图总览（统计 + 情绪日历 + 近 30 天趋势 + 我的星星） */
export const getProfileOverview = (month) =>
  http.get(month ? `/profile/overview?month=${encodeURIComponent(month)}` : '/profile/overview')

/** 生成月度微光回顾 */
export const generateMonthlyReview = (month) => http.post('/profile/monthly-review', month ? { month } : {})
