// 历史代理回归（归档）：只检验历史夹具，不作为浏览器直连/纯静态生产验收。
import { describe, it, expect } from 'vitest'
import { onRequest, ALLOWED_ORIGINS } from '../../fixtures/cf-proxy/_middleware'

// LLM-11：middleware Origin 非白名单 → 403（不进端点）；CORS 头不回 *
function makeReq(origin?: string, method = 'POST'): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (origin !== undefined) headers.origin = origin
  return new Request('https://vic.pages.dev/api/chat', { method, headers })
}

const nextOk = async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })

describe('LL-11 middleware Origin/CORS', () => {
  it('白名单源 → 放行且 CORS 回精确值（不回 *）', async () => {
    const origin = ALLOWED_ORIGINS[0]
    const res = await onRequest({ request: makeReq(origin), next: nextOk })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(origin)
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*')
    expect(res.headers.get('vary')).toBe('Origin')
  })

  it('非白名单源 → 403 且不进入端点函数', async () => {
    let entered = false
    const next = async () => {
      entered = true
      return nextOk()
    }
    const res = await onRequest({ request: makeReq('https://evil.example.com'), next })
    expect(res.status).toBe(403)
    expect(entered).toBe(false) // 不消耗上游配额（LL-11 不变量 3）
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('预检 OPTIONS：白名单 → 204 + CORS；非白名单 → 403', async () => {
    const ok = await onRequest({ request: makeReq(ALLOWED_ORIGINS[0], 'OPTIONS'), next: nextOk })
    expect(ok.status).toBe(204)
    expect(ok.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGINS[0])

    let entered = false
    const next = async () => {
      entered = true
      return nextOk()
    }
    const bad = await onRequest({ request: makeReq('https://evil.example.com', 'OPTIONS'), next })
    expect(bad.status).toBe(403)
    expect(entered).toBe(false)
  })

  it('同源请求（无 Origin 头）→ 放行且不加 CORS 头', async () => {
    const res = await onRequest({ request: makeReq(undefined), next: nextOk })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})
