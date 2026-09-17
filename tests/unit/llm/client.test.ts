// tests/unit/llm/client.test.ts — VS-01 SSE 客户端（LL-10 消费侧/LL-19 分类码/LL-17 计数）
import { describe, it, expect, beforeEach } from 'vitest'
import { callChatCompletion, getCallStats, resetCallStats } from '../../../src/llm/client'

// 简易流桩（避免 Response 类在不同 vitest 环境的 getReader 差异）：仅提供 ok/status/body.getReader/json
function frameBytes(deltas: string[], done = true): Uint8Array[] {
  const enc = new TextEncoder()
  const chunks = deltas.map((d) => enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`))
  if (done) chunks.push(enc.encode('data: [DONE]\n\n'))
  return chunks
}

function sseResponse(deltas: string[], done = true): Response {
  let i = 0
  const chunks = frameBytes(deltas, done)
  return {
    ok: true, status: 200,
    body: {
      getReader: () => ({
        read: async () => i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined },
      }),
    },
  } as unknown as Response
}

function jsonError(code: string, message: string, status: number): Response {
  return {
    ok: false, status,
    json: async () => ({ error: { code, message } }),
  } as unknown as Response
}

type FetchAs = (input: string, init?: RequestInit) => Promise<Response>

const args = { baseUrl: 'https://api.example.com', model: 'm1', apiKey: 'sk-secret', messages: [{ role: 'user' as const, content: 'hi' }] }

describe('VS-01 client：SSE 组装与请求形状', () => {
  beforeEach(() => resetCallStats())

  it('SSE 逐帧拼接成完整文本；onDelta 收到全部增量', async () => {
    const got: string[] = []
    const r = await callChatCompletion({ ...args, onDelta: (d) => got.push(d) }, async () => sseResponse(['你好，', '同学', '。']))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.text).toBe('你好，同学。')
    expect(got.join('')).toBe('你好，同学。')
  })

  it('key 只经服务商 Authorization 请求头；body 无 key（TEC-03/LL-10）', async () => {
    let seen: RequestInit | undefined
    const fx: FetchAs = async (_i, init) => { seen = init; return sseResponse(['ok']) }
    await callChatCompletion(args, fx)
    const headers = seen?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-secret')
    expect(headers).not.toHaveProperty('x-vic-upstream-key')
    expect(String(seen?.body)).not.toContain('sk-secret')
  })

  it('请求直连性：只请求玩家配置的云服务商（LLM-37）', async () => {
    let url = ''
    const fx: FetchAs = async (input) => { url = String(input); return sseResponse(['x']) }
    await callChatCompletion(args, fx)
    expect(url).toBe('https://api.example.com/chat/completions')
  })
})

describe('VS-01 client：LL-19 错误分类与重试纪律', () => {
  beforeEach(() => resetCallStats())

  it('401/403 → auth（不重试）', async () => {
    let n = 0
    const fx: FetchAs = async () => { n++; return jsonError('auth', '密钥无效', 401) }
    const r = await callChatCompletion(args, fx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('auth')
    expect(n).toBe(1)
  })

  it('upstream 5xx → 连接层重试 ≤1 次（重试会计数 LL-17 不变量 2）', async () => {
    let n = 0
    const fx: FetchAs = async () => { n++; return n === 1 ? jsonError('upstream', '故障', 502) : sseResponse(['恢复']) }
    const r = await callChatCompletion(args, fx)
    expect(n).toBe(2)
    expect(r.ok).toBe(true)
    expect(getCallStats().map((s) => s.retried)).toEqual([false, true])
  })

  it('重试仍败 → upstream 分类（不无限重试）', async () => {
    let n = 0
    const fx: FetchAs = async () => { n++; return jsonError('upstream', '仍故障', 503) }
    const r = await callChatCompletion(args, fx)
    expect(n).toBe(2)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('upstream')
    expect(getCallStats()).toHaveLength(2)
  })

  it('不能让服务商自报代理码改变 HTTP 鉴权语义', async () => {
    const fx: FetchAs = async () => jsonError('blocked-upstream', '端点不被允许', 403)
    const r = await callChatCompletion(args, fx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('auth')
  })

  it('调用计数：每次请求一笔（本局累计，纯观测）', async () => {
    await callChatCompletion(args, async () => sseResponse(['a']))
    await callChatCompletion(args, async () => sseResponse(['b']))
    expect(getCallStats()).toHaveLength(2)
    expect(getCallStats()[0].code).toBe('ok')
    expect(getCallStats()[1].at).toBe(2)
  })

  it('免 API 路径断言对象：不调用时计数恒 0（BIL-3 零调用地板）', () => {
    expect(getCallStats()).toHaveLength(0)
  })
})
