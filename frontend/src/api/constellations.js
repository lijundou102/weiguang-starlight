import { http } from './request'

/** 获取所有星座（含 AI 故事、星数与旗下 APPROVED 星星坐标） */
export const listConstellations = () => http.get('/constellations')
