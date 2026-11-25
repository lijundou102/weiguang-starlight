import { STAR_SPHERE_RADIUS } from '../constants/index.js'

/**
 * 在球壳上均匀随机取点（半径带 ±15% 抖动，让星空有层次感）
 * 使用 cosθ 均匀分布，避免两极聚集
 */
export function randomSpherePosition(radius = STAR_SPHERE_RADIUS) {
  const theta = Math.random() * Math.PI * 2
  const cosPhi = Math.random() * 2 - 1
  const sinPhi = Math.sqrt(1 - cosPhi * cosPhi)
  const r = radius * (0.85 + Math.random() * 0.3)
  const round = (n) => Math.round(n * 1000) / 1000
  return {
    posX: round(r * sinPhi * Math.cos(theta)),
    posY: round(r * cosPhi),
    posZ: round(r * sinPhi * Math.sin(theta)),
  }
}
