import { describe, it, expect } from 'vitest'
import { onRequestPost as modelsPost } from '../../../functions/api/models'

// LL-11 不变量 4：上游不支持该端点 → 空列表 + 分类码（降级为手填模型名，不是错误态）
function makeReq(baseUrl: string, key = 'sk-SECRET-KEY'): Request {
  return new Request('https://vic.local/api/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-vic-upstream-key': key } : {}) },
    body: JSON.stringify({ upstream: { baseUrl } }),
  })
}

describe('LL-11 /api/models 代理', () => {
  it('上游 404 → 空列表 + 注记（不是错误态）', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response('not found', { status: 404 })) as typeof fetch
    try {
      const res = await modelsPost({ request: makeReq('https://api.example.com/v1') })
      expect(res.status).toBe(200)
      const json = (await res.json()) as { data: unknown[]; note: string }
      expect(json.data).toEqual([])
      expect(json.note).toBe('models-not-supported')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('上游 200 → 只透传 id/owned_by 等非敏感字段', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 'model-a', owned_by: 'org', object: 'model', api_key: 'sk-LEAK', secret: 'x' },
            { id: 'model-b' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch
    try {
      const res = await modelsPost({ request: makeReq('https://api.example.com/v1') })
      const json = (await res.json()) as { data: Record<string, unknown>[] }
      expect(json.data).toHaveLength(2)
      expect(json.data[0]).toEqual({ id: 'model-a', owned_by: 'org', object: 'model' })
      const text = JSON.stringify(json)
      expect(text).not.toContain('sk-LEAK')
      expect(text).not.toContain('secret')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('上游不可达 → 空列表 + 注记（降级）', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    try {
      const res = await modelsPost({ request: makeReq('https://api.example.com/v1') })
      expect(res.status).toBe(200)
      const json = (await res.json()) as { data: unknown[]; note: string }
      expect(json.data).toEqual([])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('SSRF 内网端点 → 403（与 chat 同一判定）', async () => {
    const res = await modelsPost({ request: makeReq('https://192.168.0.1/v1') })
    expect(res.status).toBe(403)
  })

  it('缺 upstream.baseUrl → 400', async () => {
    const req = new Request('https://vic.local/api/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    const res = await modelsPost({ request: req })
    expect(res.status).toBe(400)
  })
})
