// 历史代理回归（归档）：只检验历史夹具，不作为浏览器直连/纯静态生产验收。
// LLM-35：usage 选择端到端；DNS 和上游全部 mock，不进行任何真实外部请求。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onRequestPost } from '../../fixtures/cf-proxy/api/chat'

vi.mock('../../fixtures/cf-proxy/_lib/doh', () => ({ resolveHost: async () => ({ ips: ['93.184.216.34'] }) }))

const streamText = 'data: {"choices":[{"delta":{"content":"正文"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20,"prompt_tokens_details":{"cached_tokens":80}}}\n\ndata: [DONE]\n\n'
const upstream = vi.fn(async () => new Response(streamText, { headers: { 'content-type': 'text/event-stream' } }))
const body = { upstream: { baseUrl: 'https://api.example.com/v1', model: 'fixture' }, messages: [{ role: 'user', content: 'hi' }], stream: true }

function request(includeUsage?: unknown) {
  return new Request('https://vic.local/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vic-upstream-key': 'sk-fixture-only' },
    body: JSON.stringify({ ...body, ...(includeUsage !== undefined ? { includeUsage } : {}) }),
  })
}
beforeEach(() => { upstream.mockClear(); vi.stubGlobal('fetch', upstream) })
afterEach(() => { vi.unstubAllGlobals() })

describe('LLM-35 /api/chat 可选 usage', () => {
  it.each([undefined, false])('旧请求和显式 false 不增加 stream_options（%s）', async (enabled) => {
    const res = await onRequestPost({ request: request(enabled) })
    expect(res.status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(1)
    const [, init] = upstream.mock.calls[0] as unknown as [string, RequestInit]
    const payload = JSON.parse(String(init.body))
    expect(payload).toEqual({ model: 'fixture', messages: body.messages, stream: true })
    expect(init.redirect).toBe('manual')
  })

  it('显式 true 只添加 stream_options.include_usage，SSE 原样透传且不回传 key', async () => {
    const res = await onRequestPost({ request: request(true) })
    const [url, init] = upstream.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect(JSON.parse(String(init.body))).toEqual({ model: 'fixture', messages: body.messages, stream: true, stream_options: { include_usage: true } })
    expect(String(init.body)).not.toContain('sk-fixture-only')
    expect(await res.text()).toBe(streamText)
    expect(JSON.stringify([...res.headers])).not.toContain('sk-fixture-only')
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it.each(['true', 1, null, {}])('非法 opt-in 类型在联网前拒绝 %#', async (value) => {
    const res = await onRequestPost({ request: request(value) })
    expect(res.status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('上游拒绝参数时只分类错误，不自动重发去参数请求', async () => {
    upstream.mockResolvedValueOnce(new Response('unsupported stream_options sk-fixture-only', { status: 400 }))
    const res = await onRequestPost({ request: request(true) })
    expect(upstream).toHaveBeenCalledTimes(1)
    const text = await res.text()
    expect(text).toContain('bad-request')
    expect(text).not.toContain('sk-fixture-only')
    expect(text).not.toContain('unsupported stream_options')
  })
})
