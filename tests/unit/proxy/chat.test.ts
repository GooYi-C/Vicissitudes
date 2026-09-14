import { describe, it, expect } from 'vitest'
import { onRequestPost as chatPost } from '../../../functions/api/chat'

// LLM-10：流中断语义 —— 已收结构块照常处理，世界不因中断回滚（此处验代理侧：
// 中断标记透传给客户端，客户端解析器按 LL-02 不变量 1 处理已收块）。
// LLM-12：key 不进日志/响应体/错误消息。
// LL-10 不变量 5：不回传上游原始错误体。

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://vic.local/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vic-upstream-key': 'sk-SECRET-KEY', ...headers },
    body: JSON.stringify(body),
  })
}

const goodBody = {
  upstream: { baseUrl: 'https://api.example.com/v1', model: 'test-model' },
  messages: [{ role: 'user', content: 'hi' }],
  stream: true,
}

describe('LL-10 /api/chat 代理契约', () => {
  it('缺 key → 401，不含 key 字样回显', async () => {
    const req = new Request('https://vic.local/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(goodBody),
    })
    const res = await chatPost({ request: req })
    expect(res.status).toBe(401)
    const text = await res.text()
    expect(text).not.toContain('sk-SECRET-KEY')
    expect(text).toContain('bad-request')
  })

  it('SSRF 内网地址 → 403 blocked-upstream，不发请求', async () => {
    const res = await chatPost({
      request: makeReq({ ...goodBody, upstream: { ...goodBody.upstream, baseUrl: 'https://169.254.169.254/v1' } }),
    })
    expect(res.status).toBe(403)
    const json = (await res.json()) as { error: { code: string } }
    expect(json.error.code).toBe('blocked-upstream')
  })

  it('file: 协议 → 403', async () => {
    const res = await chatPost({
      request: makeReq({ ...goodBody, upstream: { ...goodBody.upstream, baseUrl: 'file:///etc/passwd' } }),
    })
    expect(res.status).toBe(403)
  })

  it('非 stream:true → 400（本代理只支持流式）', async () => {
    const res = await chatPost({
      request: makeReq({ ...goodBody, stream: false }),
    })
    expect(res.status).toBe(400)
  })

  it('畸形 JSON → 400', async () => {
    const req = new Request('https://vic.local/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-vic-upstream-key': 'sk-SECRET-KEY' },
      body: '{not json',
    })
    const res = await chatPost({ request: req })
    expect(res.status).toBe(400)
  })

  it('上游 401 → 分类码 auth（不回传上游原始错误体）', async () => {
    const upstreamBody = JSON.stringify({ error: { message: 'Invalid API key sk-SECRET-KEY provided' } })
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(upstreamBody, { status: 401, headers: { 'content-type': 'application/json' } })) as typeof fetch
    try {
      const res = await chatPost({ request: makeReq(goodBody) })
      expect(res.status).toBe(502)
      const text = await res.text()
      expect(text).toContain('"auth"')
      expect(text).not.toContain('sk-SECRET-KEY') // 不回传上游错误体（key 不泄漏）
      expect(text).not.toContain('Invalid API key')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('上游 429 → 分类码 rate', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response('rate limited', { status: 429 })) as typeof fetch
    try {
      const res = await chatPost({ request: makeReq(goodBody) })
      const json = (await res.json()) as { error: { code: string } }
      expect(json.error.code).toBe('rate')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('上游 3xx 重定向 → 按错误处理（禁跟随）', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(null, { status: 302, headers: { location: 'https://evil.example.com/v1' } })) as typeof fetch
    try {
      const res = await chatPost({ request: makeReq(goodBody) })
      expect(res.status).toBe(403)
      const json = (await res.json()) as { error: { code: string } }
      expect(json.error.code).toBe('blocked-upstream')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('上游 200 SSE → 透传流（content-type 保留，首帧不缓冲）', async () => {
    const chunks = ['data: {"delta":"你"}\n\n', 'data: {"delta":"好"}\n\n', 'data: [DONE]\n\n']
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(new ReadableStream({
        start(controller) {
          const enc = new TextEncoder()
          for (const c of chunks) controller.enqueue(enc.encode(c))
          controller.close()
        },
      }), { status: 200, headers: { 'content-type': 'text/event-stream' } })) as typeof fetch
    try {
      const res = await chatPost({ request: makeReq(goodBody) })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('text/event-stream')
      const text = await res.text()
      expect(text).toContain('data: {"delta":"你"}')
      expect(text).toContain('data: [DONE]')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('连接失败（网络层）→ 重试 ≤1 次后 upstream 分类码', async () => {
    // DoH 解析域名会走 fetch —— 先把解析缓存填上（真 DoH 或失败兜底），
    // 计数只针对上游连接调用。此处直接预热：mock fetch 全失败时 DoH 也会失败
    // 并走系统 DNS 兜底（ips: []），不阻塞流程；上游 fetch 计数 = 首次 + ≤1 重试。
    let calls = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      // 只计上游 chat 请求（POST /chat/completions）；DoH 查询不计
      if (init?.method === 'POST') calls++
      throw new TypeError('fetch failed: connection refused')
    }) as unknown as typeof fetch
    try {
      const res = await chatPost({ request: makeReq(goodBody) })
      expect(calls).toBeLessThanOrEqual(2) // 首次 + 至多一次重试（LL-10 重试纪律）
      const json = (await res.json()) as { error: { code: string } }
      expect(json.error.code).toBe('upstream')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
