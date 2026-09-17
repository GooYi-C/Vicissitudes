// LLM-37/38/39：全部离线桩；测试通过不代表真实服务商已允许 CORS。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { providerEndpoint } from '../../../src/validation/apiEndpoint'
import { callChatCompletion, fetchProviderModels, getCallStats, resetCallStats } from '../../../src/llm/client'

const args = { baseUrl: 'https://api.example.com/v1', model: 'fixture-model', apiKey: 'sk-direct-fixture', messages: [{ role: 'user' as const, content: 'private-fixture-prompt' }] }
function sse(): Response {
  let sent = false
  return { ok: true, status: 200, body: { getReader: () => ({ read: async () => {
    if (sent) return { done: true, value: undefined }
    sent = true
    return { done: false, value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n') }
  } }) } } as unknown as Response
}
beforeEach(resetCallStats)
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('LLM-37 目标 URL 与零中转', () => {
  it.each([
    ['https://api.example.com/v1', 'https://api.example.com/v1/chat/completions'],
    ['https://api.example.com/v1/', 'https://api.example.com/v1/chat/completions'],
    ['https://api.example.com/openai/v1/chat/completions/', 'https://api.example.com/openai/v1/chat/completions'],
    ['https://api.example.com/v1/models', 'https://api.example.com/v1/chat/completions'],
    ['https://api.example.com', 'https://api.example.com/chat/completions'],
  ])('只拼服务商实际路径，不猜版本 %s', (input, url) => {
    expect(providerEndpoint(input, 'chat/completions')).toEqual({ ok: true, url })
  })

  it.each([
    '/api/chat', '//api.example.com/v1', 'http://api.example.com/v1',
    'https://user:secret@api.example.com/v1', 'https://api.example.com/v1?key=secret',
    'https://api.example.com/v1#secret', 'https://127.0.0.1/v1', 'https://2130706433/v1',
    'https://0x7f000001/v1', 'https://[::1]/v1', 'https://localhost/v1',
    'https://a.local/v1', 'https://a.internal/v1', 'https://a.home.arpa/v1',
    'https://10.0.0.1/v1', 'https://api.example.com/with space',
  ])('不合适的云端 URL 在携带 key 联网之前拒绝 %s', async (baseUrl) => {
    const fetcher = vi.fn(async () => sse())
    const result = await callChatCompletion({ ...args, baseUrl }, fetcher)
    expect(result.ok).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
    expect(getCallStats()).toHaveLength(0)
  })

  it('不能把本应用当成服务商，恢复隐式本站 API 回退', async () => {
    vi.stubGlobal('location', { origin: 'https://game.example.com' })
    const fetcher = vi.fn(async () => sse())
    expect(await callChatCompletion({ ...args, baseUrl: 'https://game.example.com/v1' }, fetcher)).toMatchObject({ ok: false, code: 'blocked-upstream' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('请求只到指定服务商，Bearer/CORS/omit/error 明确设置；body 不含中转元数据或 key', async () => {
    let seen: RequestInit | undefined
    let url = ''
    const result = await callChatCompletion({ ...args, includeUsage: true }, async (input, init) => { url = input; seen = init; return sse() })
    expect(result.ok).toBe(true)
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect(seen).toMatchObject({ method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' })
    expect(seen?.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer sk-direct-fixture' })
    expect(JSON.parse(String(seen?.body))).toEqual({ model: 'fixture-model', messages: args.messages, stream: true, temperature: 0.3, stream_options: { include_usage: true } })
    expect(String(seen?.body)).not.toContain(args.apiKey)
  })

  it.each([{ apiKey: '' }, { baseUrl: '' }, { model: ' ' }, { apiKey: 'bad\nheader' }])('未配置或 header 非法不发请求 %#', async (override) => {
    const fx = vi.fn(async () => sse())
    const result = await callChatCompletion({ ...args, ...override }, fx)
    expect(result.ok).toBe(false)
    expect(fx).not.toHaveBeenCalled()
    expect(getCallStats()).toHaveLength(0)
  })
})

describe('LLM-38 网络失败不得自动转 CF/重复生成/泄漏', () => {
  it('CORS/DNS/TLS 不可区分：提示 network-or-cors，只有一次用户指定目标请求', async () => {
    const fx = vi.fn(async (url: string) => {
      expect(url).toBe('https://api.example.com/v1/chat/completions')
      throw new TypeError(`failure ${args.apiKey} ${args.baseUrl}`)
    })
    const result = await callChatCompletion(args, fx)
    expect(result).toMatchObject({ ok: false, code: 'network-or-cors' })
    expect(fx).toHaveBeenCalledTimes(1)
    expect(fx.mock.calls[0][0]).toBe('https://api.example.com/v1/chat/completions')
    for (const secret of [args.apiKey, args.baseUrl, args.messages[0].content]) {
      expect(JSON.stringify({ result, stats: getCallStats() })).not.toContain(secret)
    }
  })

  it.each([
    { type: 'opaque', status: 0, ok: false },
    { type: 'opaqueredirect', status: 0, ok: false },
    { status: 302, ok: false },
    { status: 200, ok: true, redirected: true },
  ])('拒绝不可读/跳转响应，不开启 no-cors 或跟随代理 %#', async (raw) => {
    const fx = vi.fn(async () => raw as Response)
    expect((await callChatCompletion(args, fx)).ok).toBe(false)
    expect(fx).toHaveBeenCalledTimes(1)
  })

  it('上游自报 upstream 不能将 401 变成重试，更不展示原始错误体', async () => {
    const fx = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: { code: 'upstream', message: args.apiKey } }) }) as unknown as Response)
    const result = await callChatCompletion(args, fx)
    expect(result).toMatchObject({ ok: false, code: 'auth' })
    expect(fx).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result)).not.toContain(args.apiKey)
  })

  it('首字节超时按 timeout，零重试、零代理回退', async () => {
    vi.useFakeTimers()
    const fx = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    const result = callChatCompletion(args, fx)
    await vi.advanceTimersByTimeAsync(30_001)
    expect(await result).toMatchObject({ ok: false, code: 'timeout' })
    expect(fx).toHaveBeenCalledTimes(1)
  })

  it('明确的 504 是 timeout，不按 5xx 再生成', async () => {
    const fx = vi.fn(async () => ({ ok: false, status: 504, json: async () => ({}) }) as unknown as Response)
    expect(await callChatCompletion(args, fx)).toMatchObject({ ok: false, code: 'timeout' })
    expect(fx).toHaveBeenCalledTimes(1)
  })
})

describe('LLM-39 模型列表只由用户触发且直连', () => {
  it('从完整 chat URL 得出对应 models URL，仅投影 id，去重/限长/过滤 key，不记生成次数', async () => {
    let requestUrl = ''; let requestInit: RequestInit | undefined
    const result = await fetchProviderModels({ ...args, baseUrl: args.baseUrl + '/chat/completions' }, async (url, init) => {
      requestUrl = url; requestInit = init
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'model-a', key: args.apiKey }, { id: 'model-a' }, { id: 'model-b' }, { id: args.apiKey }, { id: 'x'.repeat(201) }, null] }) } as unknown as Response
    })
    expect(requestUrl).toBe('https://api.example.com/v1/models')
    expect(requestInit).toMatchObject({ method: 'GET', mode: 'cors', credentials: 'omit', redirect: 'error' })
    expect(result).toEqual({ ok: true, models: ['model-a', 'model-b'] })
    expect(getCallStats()).toHaveLength(0)
  })

  it('列表跨域失败返回空列表/分类码，不重试、不产生主调用', async () => {
    const fx = vi.fn(async () => { throw new TypeError('CORS') })
    expect(await fetchProviderModels(args, fx)).toMatchObject({ ok: false, models: [], code: 'network-or-cors' })
    expect(fx).toHaveBeenCalledTimes(1)
    expect(getCallStats()).toHaveLength(0)
  })

  it('无 key 时模型列表也不得探测网络', async () => {
    const fx = vi.fn(async () => sse())
    expect(await fetchProviderModels({ ...args, apiKey: '' }, fx)).toMatchObject({ ok: false, models: [], code: 'no-provider' })
    expect(fx).not.toHaveBeenCalled()
  })
})
