# 微光星空（Weiguang Starlight）生产部署指南

推荐部署架构：**Vercel（前端）+ Render（后端）+ Neon / Supabase（PostgreSQL）**。
本地开发继续使用 `backend/prisma/schema.prisma`（SQLite），不受任何影响。

---

## 一、创建 PostgreSQL 数据库（Neon 或 Supabase）

1. 在 [Neon](https://neon.tech) 或 [Supabase](https://supabase.com) 新建一个免费 PostgreSQL 项目。
2. 复制 `DATABASE_URL` 连接串（建议使用直连或支持 Prisma `db push` 的连接串，通常包含 `?sslmode=require`）。

---

## 二、部署后端（Render）

在 [Render](https://render.com) 新建 **Web Service**（或直接导入根目录 [render.yaml](../render.yaml)）：

- **Root Directory**：`backend`
- **Build Command**：`npm install && npm run build:prod`
- **Start Command**：`npm run start:prod`
- **Health Check Path**：`/api/health`

### Render 环境变量清单

| 变量名 | 必填 | 示例 / 说明 |
| --- | --- | --- |
| `NODE_ENV` | ✔ | `production` |
| `DATABASE_URL` | ✔ | `postgresql://user:pass@host/db?sslmode=require` |
| `JWT_SECRET` | ✔ | 至少 32 位高强度随机字符串 |
| `CORS_ORIGIN` | ✔ | 前端 Vercel 域名，如 `https://weiguang.vercel.app`（多个用英文逗号分隔） |
| `AUTO_SEED_IF_EMPTY` | 推荐 | `true`（仅在 Star 表为空时自动导入 15 颗种子星 + 5 座星座 + 管理员，绝不覆盖已有数据） |
| `SEED_ADMIN_USERNAME` | 可选 | `admin`（默认） |
| `SEED_ADMIN_PASSWORD` | 推荐 | 生产环境请替换为强密码 |
| `AI_PROVIDER` | 可选 | `auto`（默认：有 Key 用大模型，无 Key 自动降级本地 fallback） |
| `LLM_BASE_URL` | 可选 | `https://api.deepseek.com/v1`（兼容 OpenAI 格式接口） |
| `LLM_API_KEY` | 可选 | 大模型 API Key（未配也不影响正常启动与演示） |
| `LLM_MODEL` | 可选 | `deepseek-chat` |

部署完成后访问 `https://<your-render-service>.onrender.com/api/health`，返回 `{"code":0,"message":"ok","data":{"status":"up","db":"ok",...}}` 即成功。

---

## 三、部署前端（Vercel）

在 [Vercel](https://vercel.com) 导入 GitHub 仓库：

- **Root Directory**：`frontend`
- **Framework Preset**：`Vite`
- **Build Command**：`npm run build`
- **Output Directory**：`dist`

### Vercel 环境变量清单

| 变量名 | 必填 | 示例 / 说明 |
| --- | --- | --- |
| `VITE_API_BASE` | ✔ | Render 后端地址（不含末尾 `/` 和 `/api`），如 `https://weiguang-starlight-backend.onrender.com` |

> 说明：`frontend/vercel.json` 已内置 SPA 路由重写规则，刷新 `/bigscreen`、`/profile`、`/admin` 均不会 404；前端所有请求与 SSE（`/api/stars/stream`）将直连 `VITE_API_BASE`，避免代理截断长连接。

---

## 四、上线后联调确认

1. 回到 Render 将 `CORS_ORIGIN` 更新为最终的 Vercel 正式域名（如 `https://weiguang.vercel.app`）并重启一次。
2. 打开前端首页确认 15 颗种子星、3D 旋涡星云、实时在线人数绿灯与大屏 `/bigscreen` 扫码点亮全部正常。
3. 使用管理员账号登录 `/admin` 确认数据看板与审核台正常。
