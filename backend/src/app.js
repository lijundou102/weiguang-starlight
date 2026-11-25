import express from 'express'
import cors from 'cors'
import routes from './routes/index.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'

const app = express()

// 解析允许的跨域来源：CORS_ORIGIN 支持逗号分隔多个域名（如 https://your-app.vercel.app,http://localhost:5173）
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean)

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i

app.use(
  cors({
    origin(origin, cb) {
      // 同源 / curl / 服务端探活无 Origin 头
      if (!origin) return cb(null, true)
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true)
      // 未配置 CORS_ORIGIN 时，默认允许 localhost / 127.0.0.1 及非生产环境调试
      if (!allowedOrigins.length && (LOCAL_ORIGIN_RE.test(origin) || process.env.NODE_ENV !== 'production')) {
        return cb(null, true)
      }
      return cb(null, false)
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)

app.use(express.json({ limit: '1mb' }))

app.use('/api', routes)

app.use(notFound)
app.use(errorHandler)

export default app
