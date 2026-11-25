/**
 * SSE 连接管理：维护所有在线客户端，提供广播与实时在线人数同步
 * 使用 res.status/set + flushHeaders 以保留 cors() 中间件注入的跨域响应头
 */
const clients = new Set()
const HEARTBEAT_MS = 25_000

function writeEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export function broadcast(event, data) {
  for (const res of clients) writeEvent(res, event, data)
}

export function addClient(req, res) {
  res.status(200)
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // 关闭代理缓冲，保障跨域 SSE 实时推送
  })
  res.flushHeaders?.()

  res.write('retry: 3000\n\n')
  clients.add(res)

  const onlineCount = clients.size
  writeEvent(res, 'connected', { clients: onlineCount, onlineCount })
  broadcast('presence:count', { onlineCount })

  // 心跳注释行，防止代理/浏览器因空闲断开
  const timer = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)

  req.on('close', () => {
    clearInterval(timer)
    if (clients.delete(res)) {
      broadcast('presence:count', { onlineCount: clients.size })
    }
  })
}

export const clientCount = () => clients.size
