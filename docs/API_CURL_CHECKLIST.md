# 接口 curl 验证清单

> 自动化版本：`npm run test:api -w backend`（25 项断言）。以下为手动验证步骤，默认后端运行在 3001。

```bash
BASE=http://localhost:3001/api

# 1. 注册
curl -s -X POST $BASE/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"xiaoming","password":"secret123","nickname":"小明"}'

# 2. 登录并保存 token（需要 jq；没有 jq 可手动复制 data.token）
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"xiaoming","password":"secret123"}' | jq -r .data.token)

# 3. 当前用户
curl -s $BASE/auth/me -H "Authorization: Bearer $TOKEN"

# 4. 另开一个终端订阅 SSE（-N 关闭缓冲），保持运行
curl -N http://localhost:3001/api/stars/stream

# 5. 发星 —— 第 4 步的终端应立即收到 event: star:new
curl -s -X POST $BASE/stars -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"content":"今天在图书馆遇到一只橘猫陪我自习，好开心！"}'

# 6. 查星（种子数据 15 颗 + 新发布的）
curl -s $BASE/stars | jq '.data | length'

# 7. 预设鼓励语 & 点亮（把 1 换成任意星星 id）—— SSE 终端收到 event: star:light
curl -s $BASE/stars/presets
curl -s -X POST $BASE/stars/1/encourage -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"presetId":"hug"}'

# 8. 错误示例
curl -s $BASE/auth/me                                   # 40100
curl -s -X POST $BASE/stars/1/encourage -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" -d '{"presetId":"hug"}'   # 再次点亮 → 40900
```

管理员账号（seed）：`admin / admin123456`
