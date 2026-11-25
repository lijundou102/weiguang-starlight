import OpenAI from 'openai'

const LLM_TIMEOUT_MS = 8000
let client = null

/**
 * 判断是否启用真实大模型：
 * - AI_PROVIDER=mock：强制使用本地 mock
 * - AI_PROVIDER=llm 或未设置（auto）：检测到 LLM_API_KEY 即启用，无 key 自动回退 mock
 */
export function isLLMEnabled() {
  const mode = (process.env.AI_PROVIDER || 'auto').toLowerCase()
  if (mode === 'mock') return false
  return Boolean(process.env.LLM_API_KEY?.trim())
}

/** 懒加载 OpenAI 兼容客户端（未配置 LLM_API_KEY 时不影响服务启动） */
export function getLLM() {
  if (!client) {
    client = new OpenAI({
      baseURL: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.LLM_API_KEY,
      timeout: LLM_TIMEOUT_MS,
      maxRetries: 0,
    })
  }
  return client
}

/** 兼容 markdown 代码块与前后多余文字的 JSON 容错解析 */
export function parseLooseJSON(raw) {
  if (typeof raw !== 'string') throw new Error('Empty LLM response')
  const trimmed = raw.trim()
  // 1. 直接解析
  try {
    return JSON.parse(trimmed)
  } catch {
    /* continue */
  }
  // 2. 提取 ```json ... ``` 或 ``` ... ``` 代码块
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      /* continue */
    }
  }
  // 3. 提取首个 {...} 对象片段
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1))
  }
  throw new Error('Failed to parse JSON from LLM output')
}

/**
 * 调用兼容 OpenAI 格式的大模型并解析严格 JSON（默认 8 秒超时，支持自定义 timeoutMs）
 */
export async function chatJSON(messages, options = {}, timeoutMs = LLM_TIMEOUT_MS) {
  const res = await getLLM().chat.completions.create(
    {
      model: process.env.LLM_MODEL || 'deepseek-chat',
      messages,
      temperature: 0.7,
      ...options,
    },
    { signal: AbortSignal.timeout(timeoutMs) },
  )
  const text = res.choices?.[0]?.message?.content ?? ''
  return parseLooseJSON(text)
}
