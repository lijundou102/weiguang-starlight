# 微光星空（Weiguang Starlight）

## 线上访问入口

- **网站首页**：https://weiguang-starlight-web.onrender.com
- **答辩大屏模式**：https://weiguang-starlight-web.onrender.com/bigscreen
- **个人星图**：https://weiguang-starlight-web.onrender.com/profile
- **管理后台**：https://weiguang-starlight-web.onrender.com/admin
- **后端健康检查**：https://weiguang-starlight.onrender.com/api/health

> 注：Render 免费后端 15 分钟无访问会自动休眠，首次唤醒约需 30–50 秒，请稍候片刻即可恢复实时连接。

---

npm workspaces Monorepo：`frontend`（Vue 3 + Vite + Three.js）与 `backend`（Express + Prisma）。

## 首次安装

```bash
npm install                      # 根目录安装全部依赖
cp backend/.env.example backend/.env
npm run db:migrate               # prisma migrate dev（建库并生成 Prisma Client）
npm run db:seed -w backend       # 写入种子数据（管理员 admin / admin123456 + 15 颗星）
```

## 测试

```bash
npm run test:api -w backend      # 需先启动后端；curl 手动清单见 docs/API_CURL_CHECKLIST.md
```

## 启动

```bash
npm run dev:backend    # http://localhost:3001
npm run dev:frontend   # http://localhost:5173（/api 代理至 3001）
```

- 统一响应格式：`{ code: 0, message: "ok", data }`，错误时 `code` 非 0
- 接口契约：[docs/API_CONTRACT.md](docs/API_CONTRACT.md)
- 部署指南：[docs/DEPLOY_GUIDE.md](docs/DEPLOY_GUIDE.md)
