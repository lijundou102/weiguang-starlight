# 微光星空（Weiguang Starlight）

npm workspaces Monorepo：`frontend`（Vue 3 + Vite）与 `backend`（Express + Prisma）。

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
