# 微光星空（Weiguang Starlight）API 契约

> 本文档为前后端接口的唯一约定来源，接口变更需同步更新此文件。

## 1. 基本约定

- **Base URL**：`/api`（开发环境由 Vite 代理至 `http://localhost:3001`）
- **数据格式**：`Content-Type: application/json; charset=utf-8`
- **鉴权**：`Authorization: Bearer <JWT>`（需要登录的接口标注 🔒），token 有效期 7 天
- **时间格式**：ISO 8601 字符串（UTC）

## 2. 统一响应格式

```json
{ "code": 0, "message": "ok", "data": {} }
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| code | number | `0` 表示成功，非 `0` 表示失败 |
| message | string | 成功为 `"ok"`，失败为错误描述（可直接展示给用户） |
| data | any | 业务数据，失败时通常为 `null` |

## 3. 错误码

| code | HTTP | 含义 |
| --- | --- | --- |
| 0 | 200 / 201 | 成功 |
| 40000 | 400 | 参数错误 |
| 40100 | 401 | 未登录 / token 无效 / 用户名或密码错误 |
| 40300 | 403 | 无权限 |
| 40400 | 404 | 资源不存在 |
| 40900 | 409 | 资源冲突（用户名已存在、重复点亮、重复微行动打卡） |
| 50000 | 500 | 服务器内部错误 |
| 50200 | 502 | 大模型服务调用失败 |

## 4. 数据结构

### User

```ts
{ id: number, username: string, nickname: string, role: 'USER' | 'ADMIN', isGuest: boolean, createdAt: string }
```

### Star

```ts
{
  id: number
  content: string
  aiReply: string | null
  emotion: 'warm' | 'calm' | 'joy' | 'hope' | 'touched'
  colorHex: string              // 由 emotion 决定，见下表
  themeTag: '学习成长' | '友人同行' | '校园烟火' | '陌生善意' | '自我疗愈' | '自然微光'
  posX: number; posY: number; posZ: number   // 球壳坐标，半径约 42.5 ~ 57.5
  lightCount: number
  commentCount: number
  status: 'APPROVED' | 'FLAGGED' | 'HIDDEN'
  createdAt: string
  author: { id: number, nickname: string } | null
  constellation: { id: number, name: string, themeTag: string } | null
}
```

### CrisisBlockedResponse

当发布内容命中第一层本地高危词库或第二层大模型判定 `riskLevel === "CRISIS"` 时返回（`code: 0`）：

```ts
{
  blocked: true
  riskLevel: 'CRISIS'
  careMessage: string
  hotlines: { name: string, phone: string, desc: string }[]
}
```

### Constellation

```ts
{
  id: number
  name: string
  themeTag: string
  story: string
  createdAt: string
  starCount: number
  stars: { id: number, posX: number, posY: number, posZ: number, colorHex: string }[]
}
```

### MicroActionItem

```ts
{
  id: number
  title: string
  description: string
  activeDate: string            // YYYY-MM-DD
  completed: boolean
  completedAt: string | null
  starId: number | null
}
```

| emotion | colorHex | 含义 |
| --- | --- | --- |
| warm | `#FFB86B` | 温暖 |
| calm | `#7FB3FF` | 平静 |
| joy | `#FFE066` | 喜悦 |
| hope | `#8BE9A8` | 希望 |
| touched | `#FF8FB1` | 感动 |

## 5. 接口列表

### 5.1 系统

#### GET /api/health

```json
{ "code": 0, "message": "ok", "data": { "status": "up", "db": "ok", "time": "2026-11-24T14:00:00.000Z" } }
```

### 5.2 认证（Auth）

#### POST /api/auth/guest

免注册昵称快速体验。
请求：`{ nickname: string }`（2-16 字）
成功（HTTP 201）：`data = { token: string, user: User }`（`isGuest: true, role: "USER"`）
错误：40000 昵称不合法

#### POST /api/auth/register

| 字段 | 类型 | 必填 | 规则 |
| --- | --- | --- | --- |
| username | string | ✔ | 3-20 位字母 / 数字 / 下划线，唯一 |
| password | string | ✔ | 6-64 位 |
| nickname | string |  | ≤ 20 字，缺省为 username |

成功（HTTP 201）：`data = { token: string, user: User }`
错误：40000 参数不合法；40900 用户名已被注册

#### POST /api/auth/login

请求：`{ username, password }`
成功：`data = { token: string, user: User }`
错误：40100 用户名或密码错误

#### GET /api/auth/me 🔒

成功：`data = User`
错误：40100 未登录 / token 无效

### 5.3 星星（Stars）

#### GET /api/stars

返回所有 `APPROVED` 状态的星星，按 `createdAt` 升序。
成功：`data = Star[]`

#### GET /api/stars/:id

获取单颗星星详情。`APPROVED` 状态对所有人可见，其他状态仅作者本人或 `ADMIN` 可见。
附带该星所有 `APPROVED` 留言 `comments`（按时间正序）与 `commentCount`；携带合法 JWT 时额外返回 `litByMe: boolean`。
成功：`data = Star & { litByMe: boolean, commentCount: number, comments: { id, starId, content, createdAt, author: { id, nickname } }[] }`
错误：40000 id 无效；40400 星星不存在或不可见

#### POST /api/stars 🔒

请求：`{ content: string }`（去除首尾空格后 1-500 字）

服务端流程：
1. 第一层安全防线：本地毫秒级高危词检测；
2. 第二层安全防线：大模型结构化分析（8 秒超时 + markdown JSON 容错解析；未配置 `LLM_API_KEY` 或异常时无缝降级本地高质量 fallback）；
3. 若判定 `CRISIS`：以 `status="FLAGGED"` 入库留痕，不进公共星空、不发 SSE，返回 `code: 0, data: CrisisBlockedResponse`（HTTP 200）；
4. 若通过：入库 `APPROVED` → 自动归入已有星座或满 5 颗同主题星触发 AI 成座（SSE 广播 `constellation:new`）→ SSE 广播 `star:new`，返回 `code: 0, data: Star`（HTTP 201）。

#### DELETE /api/stars/:id 🔒

删除星星（仅作者本人或 `ADMIN`）。若原状态为 `APPROVED`，广播 SSE 事件 `star:remove`。
成功：`data = { id: number }`
错误：40000 id 无效；40300 无权限；40400 星星不存在

#### GET /api/stars/presets

预设鼓励语列表。
成功：`data = { id: string, text: string }[]`

#### POST /api/stars/:id/encourage 🔒

点亮星星并发送一条**预设**鼓励语（不支持自由文本）。每个用户对同一颗星只能点亮一次。
请求：`{ presetId: string }`
成功：`data = { starId, lightCount, encouragement: { id, presetText, createdAt } }`
错误：40000 presetId 无效；40400 星星不存在或不可见；40900 已点亮过

#### POST /api/stars/:id/comments 🔒

在星星下发表「星语回响」实时留言（2-120 字），经双层安全审核（本地高危/辱骂词 + AI 5 秒超时友善度判定）：
- 通过（HTTP 201）：入库 `APPROVED` 并通过 SSE 广播 `star:comment`，返回 `data = { comment, commentCount }`；
- 命中不友善/攻击内容（HTTP 200）：入库 `FLAGGED`，不广播 SSE，返回 `data = { blocked: true, riskLevel: "UNFRIENDLY", message }`；
- 命中高危自伤内容（HTTP 200）：入库 `FLAGGED`，不广播 SSE，返回 `CrisisBlockedResponse`（`blocked: true, riskLevel: "CRISIS", careMessage, hotlines`）。

#### DELETE /api/stars/:id/comments/:commentId 🔒

删除留言（仅评论作者、星星作者或 `ADMIN` 可删）。删除后广播 SSE `star:comment:remove`。
成功：`data = { id, starId, commentCount }`

#### GET /api/stars/stream （SSE）

`Content-Type: text/event-stream`，无需鉴权。服务端每 25s 发送 `: ping` 心跳注释，建议客户端 3s 重连（`retry: 3000`）。

| event | data | 触发时机 |
| --- | --- | --- |
| `connected` | `{ clients: number, onlineCount: number }` | 连接建立 |
| `presence:count` | `{ onlineCount: number }` | 有客户端连入或断开 |
| `star:new` | `Star` | 新星审核通过并发布 |
| `star:light` | `{ starId: number, lightCount: number }` | 星星被点亮 |
| `star:remove` | `{ starId: number }` | 星星被删除或隐藏 |
| `star:comment` | `{ starId: number, comment, commentCount: number }` | 新留言通过审核或恢复展示 |
| `star:comment:remove` | `{ starId: number, commentId: number, commentCount: number }` | 留言被删除或隐藏 |
| `constellation:new` | `Constellation` | 同主题满 5 颗未成座星星，AI 自动生成新星座 |

### 5.4 星座（Constellations）

#### GET /api/constellations

公开访问，返回所有星座列表（含 AI 故事、星数与该星座下所有 `APPROVED` 星星的坐标列表）。
成功：`data = Constellation[]`

### 5.5 每日微行动（MicroActions）

#### GET /api/micro-actions/today

公开访问（携带合法 JWT 时附带 `completed: boolean`）。优先读取当天日期（`YYYY-MM-DD`）的 3 条微行动；若当天库里尚无记录，自动从内置 18 条校园微行动池按日期确定性选取 3 条写入并返回。

成功：
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "date": "2026-11-24",
    "completedCount": 0,
    "totalCount": 3,
    "actions": []
  }
}
```

#### POST /api/micro-actions/:id/complete 🔒

完成指定微行动并自动触发发星流程（带 AI 星语、入库 `APPROVED`、SSE 广播 `star:new`），同时写入 `UserMicroAction` 关联 `starId`。
请求：`{ note?: string }`（可选，留空使用微行动默认温柔文案）

成功（HTTP 201）：
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "actionId": 1,
    "completedAt": "2026-11-24T15:00:00.000Z",
    "star": {},
    "progress": { "completedCount": 1, "totalCount": 3 }
  }
}
```

若 `note` 触发危机拦截，直接返回 `CrisisBlockedResponse`（`blocked: true`），不记为打卡完成。
错误：40000 参数无效；40400 微行动不存在；40900 已完成过该微行动

### 5.6 个人星图（Profile）

#### GET /api/profile/overview 🔒

查询参数：`?month=YYYY-MM`（可选，默认当前月）。
成功：`data` 包含：
- `stats`: `{ totalStars, totalLightsReceived, completedActions, dominantEmotion, dominantColorHex }`
- `calendar`: `{ month, days: [{ date, count, dominantEmotion, colorHex }] }`
- `trend30Days`: `[{ date, count }]`（近 30 天每日发星趋势）
- `stars`: `Star[]`（当前用户的 `APPROVED` 星星列表，按时间倒序）

#### POST /api/profile/monthly-review 🔒

请求：`{ month?: string }`（可选 `YYYY-MM`）
基于用户近期星星调用 AI 生成月度回顾（8 秒超时 + 本地高质量 fallback）。
成功：`data = { month, label, starCount, keywords: string[], summary: string, generatedAt }`

### 5.7 管理后台（Admin）

以下接口全部需 `requireAuth` + `requireAdmin`，非管理员返回 HTTP 403 / `code: 40300`。

#### GET /api/admin/stats 🔒🛡️

返回核心指标看板数据：
`{ totalUsers, totalStars, approvedStars, todayStars, flaggedStars, hiddenStars, totalConstellations, emotionDistribution: [{ emotion, colorHex, count, percent }], trend7Days: [{ date, count }] }`

#### GET /api/admin/stars 🔒🛡️

查询参数：`?status=ALL|APPROVED|FLAGGED|HIDDEN&page=1&pageSize=20`
成功：`data = { items, total, page, pageSize, totalPages }`（每条含 `author: { id, username, nickname }`、`content`、`aiReply`、`emotion`、`status`、`createdAt`）。

#### PATCH /api/admin/stars/:id/status 🔒🛡️

请求：`{ status: "APPROVED" | "HIDDEN" | "FLAGGED" }`
- 从 `APPROVED` 变为非 `APPROVED` 时，通过 SSE 广播 `star:remove`；
- 从非 `APPROVED` 恢复为 `APPROVED` 时，通过 SSE 广播 `star:new`。

#### DELETE /api/admin/stars/:id 🔒🛡️

永久删除指定星星并通过 SSE 广播 `star:remove`。
成功：`data = { id: number }`

#### GET /api/admin/comments 🔒🛡️

查询参数：`?status=ALL|APPROVED|FLAGGED|HIDDEN&page=1&pageSize=20`
成功：`data = { items, total, page, pageSize, totalPages }`（每条含 `author` 与所属 `star: { id, content }`）。

#### PATCH /api/admin/comments/:id/status 🔒🛡️

请求：`{ status: "APPROVED" | "HIDDEN" | "FLAGGED" }`，同步广播 `star:comment:remove` 或 `star:comment`。

#### DELETE /api/admin/comments/:id 🔒🛡️

永久删除指定留言并广播 `star:comment:remove`。

## 6. 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-11-24 | 初始化文档框架，新增 `GET /api/health` |
| 2026-11-24 | 阶段 1：新增认证接口、星星 CRUD、预设鼓励语、SSE 实时流 |
| 2026-11-24 | 阶段 2：补充 `GET /api/stars/:id`、`DELETE /api/stars/:id` 与 `star:remove` 事件 |
| 2026-11-24 | 阶段 3：双层安全兜底与 CRISIS 守护响应、AI 星座聚类与 `GET /api/constellations`、`constellation:new`、每日微行动接口 |
| 2026-11-25 | 阶段 4：新增个人星图（`/api/profile/*`）与管理后台（`/api/admin/*`）接口 |
| 2026-11-25 | 阶段 5：新增免注册访客登录（`/api/auth/guest`）、实时评论区（`star:comment` / `star:comment:remove`）、实时在线人数（`presence:count`）与留言审核接口 |
