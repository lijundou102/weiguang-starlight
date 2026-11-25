import { Prisma } from '@prisma/client'
import { AppError, ErrorCode, fail } from '../utils/response.js'

export function notFound(req, res) {
  return fail(res, ErrorCode.NOT_FOUND, `Not Found: ${req.method} ${req.originalUrl}`, 404)
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return fail(res, err.code, err.message, err.status, err.data)
  }
  if (err?.type === 'entity.parse.failed') {
    return fail(res, ErrorCode.BAD_REQUEST, 'Invalid JSON body', 400)
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return fail(res, ErrorCode.CONFLICT, '数据已存在', 409)
    if (err.code === 'P2025') return fail(res, ErrorCode.NOT_FOUND, '数据不存在', 404)
  }
  console.error('[unhandled error]', err)
  return fail(res, ErrorCode.INTERNAL, 'Internal Server Error', 500)
}
