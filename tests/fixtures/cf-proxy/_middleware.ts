// 历史 CF 代理测试夹具：不属于部署入口，不代表现网能力或安全验收。
// functions/_middleware.ts — 所有 /api/* 的必经前置（§二十 LL-11）
// Origin 校验 ＋ CORS 头 ＋ Vary: Origin。
// 不变量 1：端点自身不重复做 Origin 校验（防双份判定漂移）。
// 不变量 2：CORS 只回白名单源精确值，绝不回 *。
// 不变量 3：非白名单 Origin → 403，且不进入端点函数（不消耗上游配额）。

interface MiddlewareContext {
  request: Request
  next: () => Promise<Response>
  env?: Record<string, string>
}

const ALLOWED_ORIGINS: string[] = (() => {
  const configured = globalThis.VIC_ALLOWED_ORIGINS as string[] | undefined
  const origins = configured ?? ['http://localhost:5173', 'http://127.0.0.1:5173']
  return origins
})()

function corsHeaders(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-vic-upstream-key, authorization',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

export const onRequest = async (ctx: MiddlewareContext): Promise<Response> => {
  const { request, next } = ctx
  const origin = request.headers.get('origin') ?? ''

  // 同源请求（无 Origin 头或 Origin 即本站）与预检：同源 POST 不带 Origin 也能过（curl / 同源 fetch）
  if (request.method === 'OPTIONS') {
    if (!origin) return new Response(null, { status: 204 })
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response('origin not allowed', { status: 403 }) // 不进端点
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    // 非白名单跨源 → 403，不进入端点函数
    return new Response(JSON.stringify({ error: 'origin-not-allowed' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })
  }

  const res = await next()
  const headers = new Headers(res.headers)
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
  }
  return new Response(res.body, { status: res.status, headers })
}

export { ALLOWED_ORIGINS }
