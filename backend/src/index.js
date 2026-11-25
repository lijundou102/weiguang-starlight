import 'dotenv/config'
import app from './app.js'
import { isLLMEnabled } from './lib/llm.js'
import { autoSeedIfEmpty } from './lib/autoSeed.js'

if (!process.env.JWT_SECRET) {
  console.error('[weiguang-backend] 缺少 JWT_SECRET，请先 cp .env.example .env 并配置')
  process.exit(1)
}

const PORT = Number(process.env.PORT) || 3001
const aiMode = isLLMEnabled() ? `llm (${process.env.LLM_MODEL || 'deepseek-chat'})` : 'fallback'

autoSeedIfEmpty()
  .catch((err) => console.error('[weiguang-backend] autoSeedIfEmpty failed:', err))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`[weiguang-backend] listening on http://localhost:${PORT} (AI=${aiMode})`)
    })
  })
