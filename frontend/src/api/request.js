/**
 * 统一请求封装：解析 { code, message, data }，code !== 0 时抛出 ApiError
 * - 本地开发 VITE_API_BASE 留空，走 Vite /api 代理
 * - 生产部署配置 VITE_API_BASE（如 https://xxx.onrender.com）后直连后端，避免代理截断 SSE
 */
export const API_BASE = (import.meta.env.VITE_API_BASE || '').trim().replace(/\/+$/, '')

export const apiUrl = (path) => `${API_BASE}/api${path}`

export class ApiError extends Error {
  constructor(code, message, data = null) {
    super(message)
    this.code = code
    this.data = data
  }
}

const TOKEN_KEY = 'wg_token'

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export async function request(url, { method = 'GET', body, headers = {} } = {}) {
  const token = tokenStorage.get()
  const res = await fetch(apiUrl(url), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  let payload
  try {
    payload = await res.json()
  } catch {
    throw new ApiError(-1, `网络错误（HTTP ${res.status}）`)
  }

  if (payload.code !== 0) {
    throw new ApiError(payload.code, payload.message, payload.data)
  }
  return payload.data
}

export const http = {
  get: (url, opts) => request(url, { ...opts, method: 'GET' }),
  post: (url, body, opts) => request(url, { ...opts, method: 'POST', body }),
  put: (url, body, opts) => request(url, { ...opts, method: 'PUT', body }),
  patch: (url, body, opts) => request(url, { ...opts, method: 'PATCH', body }),
  del: (url, opts) => request(url, { ...opts, method: 'DELETE' }),
}
