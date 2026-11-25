/**
 * 全局统一响应格式：{ code, message, data }
 * - 成功：code = 0, message = "ok"
 * - 失败：code != 0
 */

export const ErrorCode = {
  OK: 0,
  BAD_REQUEST: 40000,
  UNAUTHORIZED: 40100,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  CONFLICT: 40900,
  INTERNAL: 50000,
  LLM_ERROR: 50200,
}

export class AppError extends Error {
  /**
   * @param {number} code 业务错误码（非 0）
   * @param {string} message 错误信息
   * @param {number} [status] HTTP 状态码
   * @param {any} [data] 附加数据
   */
  constructor(code, message, status = 400, data = null) {
    super(message)
    this.code = code
    this.status = status
    this.data = data
  }
}

export function success(res, data = null, message = 'ok') {
  return res.json({ code: ErrorCode.OK, message, data })
}

export function fail(res, code = ErrorCode.INTERNAL, message = 'error', status = 400, data = null) {
  return res.status(status).json({ code, message, data })
}
