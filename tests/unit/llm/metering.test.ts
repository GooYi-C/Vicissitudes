// LLM-34/35：usage 是上游数值证据，不是字符估算/静态头哈希；全部使用离线 SSE 桩。
import { beforeEach, describe, expect, it } from 'vitest'
import { callChatCompletion, getCallStats, resetCallStats, summarizeCallStats } from '../../../src/llm/client'

const args = { baseUrl: 'https://private-endpoint.example/v1', model: 'm', apiKey: 'sk-private-test-key', messages: [{ role: 'user' as const, content: '私人提示词' }] }
const enc = new TextEncoder()
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\r\n\r\n`
const delta = (content: string) => frame({ choices: [{ delta: { content } }] })
const goodUsage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_tokens_details: { cached_tokens: 80 } }

function response(chunks: Uint8Array[], failAtEnd = false): Response {
  let i = 0
  return {
    ok: true, status: 200,
    body: { getReader: () => ({ read: async () => {
      if (i < chunks.length) return { done: false, value: chunks[i++] }
      if (failAtEnd) throw new Error('read failed sk-private-test-key')
      return { done: true, value: undefined }
    } }) },
  } as unknown as Response
}
function stream(usage: unknown, suffix = 'data: [DONE]\n\n') {
  return response([enc.encode(delta('正文') + frame({ choices: [], usage }) + suffix)])
}

beforeEach(resetCallStats)

describe('LLM-34 上游实测与未测严格分离', () => {
  it('独立 usage 帧无 choices：解析真实 token 与缓存数，不混进叙事', async () => {
    const deltas: string[] = []
    const result = await callChatCompletion({ ...args, onDelta: (text) => deltas.push(text) }, async () => stream(goodUsage))
    expect(result).toEqual({ ok: true, text: '正文' })
    expect(deltas).toEqual(['正文'])
    expect(getCallStats()[0]).toMatchObject({
      usage: { source: 'upstream', promptTokens: 100, completionTokens: 20, totalTokens: 120, cachedPromptTokens: 80 },
      usageComplete: true,
    })
    expect(summarizeCallStats(getCallStats())).toMatchObject({ measuredCalls: 1, promptTokens: 100, completionTokens: 20, cacheTokenRatio: 0.8 })
  })

  it('中文 UTF-8 任意字节分片、CRLF 与无尾换行 [DONE] 均不丢帧', async () => {
    const bytes = enc.encode(delta('你好，世界') + frame({ usage: goodUsage, choices: [] }) + 'data: [DONE]')
    const chunks = [...bytes].map((b) => new Uint8Array([b]))
    const result = await callChatCompletion(args, async () => response(chunks))
    expect(result).toEqual({ ok: true, text: '你好，世界' })
    expect(getCallStats()[0].usageComplete).toBe(true)
    expect(getCallStats()[0].usage?.promptTokens).toBe(100)
  })

  it('累计 usage 重复出现只取最后快照，不能逐帧叠加', async () => {
    const text = delta('正文') + frame({ usage: { ...goodUsage, completion_tokens: 10, total_tokens: 110 } }) + frame({ usage: goodUsage }) + 'data: [DONE]\n'
    await callChatCompletion(args, async () => response([enc.encode(text)]))
    expect(getCallStats()[0].usage?.completionTokens).toBe(20)
  })

  it('没报告 usage：仅有字符数，token/缓存/费用保持未测；不发补采请求', async () => {
    let calls = 0
    await callChatCompletion(args, async () => { calls++; return stream(null) })
    expect(calls).toBe(1)
    expect(getCallStats()[0]).toMatchObject({ promptChars: 5, completionChars: 2, usage: null, usageComplete: false })
    expect(summarizeCallStats(getCallStats())).toMatchObject({ promptTokens: null, completionTokens: null, cachedPromptTokens: null, cacheTokenRatio: null })
  })

  it.each([
    { prompt_tokens: -1, completion_tokens: 20 },
    { prompt_tokens: '100', completion_tokens: 20 },
    { prompt_tokens: 1.5, completion_tokens: 20 },
    { prompt_tokens: 100, completion_tokens: null },
    { ...goodUsage, total_tokens: 999 },
    { prompt_tokens: Number.MAX_SAFE_INTEGER, completion_tokens: 1 },
    [],
  ])('非法/越界 usage 降级未测但不破坏回复 %#', async (usage) => {
    const result = await callChatCompletion(args, async () => stream(usage))
    expect(result).toEqual({ ok: true, text: '正文' })
    expect(getCallStats()).toHaveLength(1)
    expect(getCallStats()[0].usage).toBeNull()
  })

  it('缺 cached_tokens 不能当成 0；明确的 0 则保留', async () => {
    await callChatCompletion(args, async () => stream({ prompt_tokens: 100, completion_tokens: 20 }))
    expect(getCallStats()[0].usage?.cachedPromptTokens).toBeNull()
    expect(summarizeCallStats(getCallStats()).cacheTokenRatio).toBeNull()
    resetCallStats()
    await callChatCompletion(args, async () => stream({ ...goodUsage, prompt_tokens_details: { cached_tokens: 0 } }))
    expect(summarizeCallStats(getCallStats()).cacheTokenRatio).toBe(0)
  })

  it('缓存数越界或两种字段冲突时只使缓存未测，不抹掉合法 token', async () => {
    await callChatCompletion(args, async () => stream({ ...goodUsage, prompt_tokens_details: { cached_tokens: 101 } }))
    expect(getCallStats()[0].usage).toMatchObject({ promptTokens: 100, cachedPromptTokens: null })
    await callChatCompletion(args, async () => stream({ ...goodUsage, prompt_cache_hit_tokens: 20 }))
    expect(getCallStats()[1].usage?.cachedPromptTokens).toBeNull()
  })

  it('兼容平铺缓存 usage 字段；hit+miss 不闭合时不接受缓存量', async () => {
    await callChatCompletion(args, async () => stream({ prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 60, prompt_cache_miss_tokens: 40 }))
    expect(getCallStats()[0].usage?.cachedPromptTokens).toBe(60)
    await callChatCompletion(args, async () => stream({ prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 60, prompt_cache_miss_tokens: 50 }))
    expect(getCallStats()[1].usage?.cachedPromptTokens).toBeNull()
  })

  it('空样本与明确零输入均不产生 0/0 或假 100%', async () => {
    expect(summarizeCallStats([])).toMatchObject({ calls: 0, promptTokens: null, cacheTokenRatio: null })
    await callChatCompletion(args, async () => stream({ prompt_tokens: 0, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } }))
    expect(summarizeCallStats(getCallStats())).toMatchObject({ promptTokens: 0, completionTokens: 0, cacheTokenRatio: null })
  })

  it('部分样本缺 usage 时显示覆盖数，不以已知部分冒充全量', async () => {
    await callChatCompletion(args, async () => stream(goodUsage))
    await callChatCompletion(args, async () => stream(null))
    expect(summarizeCallStats(getCallStats())).toMatchObject({ calls: 2, measuredCalls: 1, promptTokens: null, cacheTokenRatio: null })
  })

  it('多请求缓存占比按 token 加权，而不是逐回合百分比平均', async () => {
    await callChatCompletion(args, async () => stream(goodUsage))
    await callChatCompletion(args, async () => stream({ prompt_tokens: 900, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 0 } }))
    expect(summarizeCallStats(getCallStats())).toMatchObject({ promptTokens: 1000, completionTokens: 30, cachedPromptTokens: 80, cacheTokenRatio: 0.08 })
  })

  it('缺 [DONE] 时保留正文兼容行为，但 usage 只能算部分观测', async () => {
    const result = await callChatCompletion(args, async () => stream(goodUsage, ''))
    expect(result.ok).toBe(true)
    expect(getCallStats()[0]).toMatchObject({ usageComplete: false, usage: { promptTokens: 100 } })
    expect(summarizeCallStats(getCallStats()).promptTokens).toBeNull()
  })

  it('流中断保留已收文本与部分 usage，不重试、不泄露异常原文', async () => {
    let calls = 0
    const result = await callChatCompletion(args, async () => {
      calls++
      return response([enc.encode(delta('已收结构块') + frame({ usage: goodUsage }))], true)
    })
    expect(calls).toBe(1)
    expect(result).toMatchObject({ ok: false, code: 'stream-broken', partialText: '已收结构块' })
    expect(JSON.stringify(result)).not.toContain('sk-private-test-key')
    expect(getCallStats()[0]).toMatchObject({ completionChars: 5, usageComplete: false })
  })

  it('观测白名单不保留 key/端点/正文/未知 usage 字段，返回值不允许反向污染账', async () => {
    await callChatCompletion(args, async () => stream({ ...goodUsage, secret: args.apiKey, text: '私人提示词' }))
    const snapshot = getCallStats()
    const json = JSON.stringify(snapshot)
    for (const secret of [args.apiKey, args.baseUrl, '私人提示词', '正文']) expect(json).not.toContain(secret)
    snapshot[0].usage!.promptTokens = 999
    expect(getCallStats()[0].usage?.promptTokens).toBe(100)
  })
})

describe('LLM-35 兼容性与零额外调用', () => {
  it('200 usage-only 响应已经可能计费，不因空正文重复生成', async () => {
    let calls = 0
    const result = await callChatCompletion(args, async () => {
      calls++
      return response([enc.encode(frame({ usage: goodUsage, choices: [] }) + 'data: [DONE]\n')])
    })
    expect(result).toMatchObject({ ok: false, code: 'upstream' })
    expect(calls).toBe(1)
    expect(getCallStats()[0]).toMatchObject({ usageComplete: true, usage: { promptTokens: 100 } })
  })

  it('原始 HTTP 400/422 参数拒绝不重试', async () => {
    for (const status of [400, 422]) {
      let calls = 0
      const result = await callChatCompletion(args, async () => {
        calls++
        return { ok: false, status, json: async () => ({}) } as unknown as Response
      })
      expect(result).toMatchObject({ ok: false, code: 'bad-request' })
      expect(calls).toBe(1)
    }
  })
  it('仅显式 opt-in 请求 includeUsage；消息与温度不变，key 仍仅走头', async () => {
    const bodies: Record<string, unknown>[] = []
    const fx = async (_input: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${args.apiKey}`)
      return stream(goodUsage)
    }
    await callChatCompletion(args, fx)
    await callChatCompletion({ ...args, includeUsage: false }, fx)
    await callChatCompletion({ ...args, includeUsage: true }, fx)
    expect(bodies[0]).toEqual(bodies[1])
    expect(bodies[0]).not.toHaveProperty('stream_options')
    expect(bodies[0]).not.toHaveProperty('upstream')
    expect(bodies[2]).toEqual({ ...bodies[0], stream_options: { include_usage: true } })
    expect(JSON.stringify(bodies)).not.toContain(args.apiKey)
  })

  it('上游不支持 usage 参数时不偷偷降档再发一次收费请求', async () => {
    let calls = 0
    const result = await callChatCompletion({ ...args, includeUsage: true }, async () => {
      calls++
      return { ok: false, status: 502, json: async () => ({ error: { code: 'bad-request', message: 'unsupported stream_options' } }) } as unknown as Response
    })
    expect(result).toMatchObject({ ok: false, code: 'bad-request' })
    expect(calls).toBe(1)
    expect(getCallStats()).toHaveLength(1)
  })
})
