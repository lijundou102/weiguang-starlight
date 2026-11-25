import jwt from 'jsonwebtoken'
import { AppError, ErrorCode } from '../utils/response.js'

const JWT_EXPIRES_IN = '7d'

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

/** 校验 Authorization: Bearer <token>，通过后挂载 req.user = { id, role } */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')
  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(ErrorCode.UNAUTHORIZED, '未登录或 token 缺失', 401))
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = { id: payload.sub, role: payload.role }
    next()
  } catch {
    next(new AppError(ErrorCode.UNAUTHORIZED, 'token 无效或已过期', 401))
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return next(new AppError(ErrorCode.FORBIDDEN, '需要管理员权限', 403))
  }
  next()
}

/** 可选鉴权：带合法 token 则挂载 req.user，否则匿名继续 */
export function optionalAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ')
  if (scheme === 'Bearer' && token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET)
      req.user = { id: payload.sub, role: payload.role }
    } catch {
      /* 忽略无效 token，按匿名处理 */
    }
  }
  next()
}
