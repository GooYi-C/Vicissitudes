// functions/api/chat.ts — POST /api/chat（§二十 LL-10）
// OpenAI 兼容代理：SSRF 防护 ＋ SSE 流式透传 ＋ key 服务端零留存。
// 本函数不含任何游戏逻辑（TEC-03 不变量 2）；不回传上游原始错误体（LL-10 不变量 5）。

import { checkUrl, checkResolvedIp } from '../_lib/ssrf'
import { resolveHost } from '../_lib/doh'

// LL-19 错误分类码（封闭枚举，无 other 桶；客户端侧统一表在 src/llm/errors.ts 落地）
const ErrorCode = {
  blockedUpstream: 'blocked-upstream',
  auth: 'auth',
  rate: 'rate',
  upstream: 'upstream',
  timeout: 'timeout',
  badRequest: 'bad-request',
} as const

function jsonError(code: string, message: string, status: number): Response {
  // 结构化错误码 + 可展示消息；绝不包含上游原始错误体与 key
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const FIRST_BYTE_TIMEOUT_MS = 30_000
const CONNECT_RETRY_MAX = 1 // 连接失败重试 ≤ 1 次；流中断不重试（LL-10 超时与重试表）

interface ChatRequest {
  upstream: { baseUrl: string; model: string }
  messages: { role: string; content: string }[]
  stream: true
  temperature?: number
  maxTokens?: number
}

interface Env {
  VIC_ALLOWED_ORIGINS?: string[]
}

async function buildUpstreamRequest(body: ChatRequest, apiKey: string): Promise<{ url: URL; init: RequestInit } | Response> {
  const verdict = checkUrl(body.upstream.baseUrl)
  if (!verdict.ok) {
    return jsonError(ErrorCode.blockedUpstream, '端点不被允许', 403)
  }
  let url: URL
  try {
    url = new URL(body.upstream.baseUrl)
    if (!url.pathname.endsWith('/chat/completions')) {
      url = new URL(url.pathname.replace(/\/$/, '') + '/chat/completions', url)
    }
  } catch {
    return jsonError(ErrorCode.badRequest, '上游端点无效', 400)
  }

  // 规则 5：域名经 DoH 解析后按 IP 判定（DNS rebinding 防护：判定与连接同源）
  const host = url.hostname
  if (!host.includes(':')) {
    const resolved = await resolveHost(host)
    for (const ip of resolved.ips) {
      const ipVerdict = checkResolvedIp(ip)
      if (!ipVerdict.ok) {
        return jsonError(ErrorCode.blockedUpstream, '端点不被允许', 403)
      }
    }
  }

  const payload: Record<string, unknown> = {
    model: body.upstream.model,
    messages: body.messages,
    stream: true, // 本代理只支持流式（LL-10）
  }
  if (body.temperature !== undefined) payload.temperature = body.temperature
  if (body.maxTokens !== undefined) payload.max_tokens = body.maxTokens

  return {
    url,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      redirect: 'manual', // 规则 3：禁重定向跟随，3xx 一律按错误处理
    },
  }
}

export const onRequestPost = async (ctx: { request: Request; env?: Env }): Promise<Response> => {
  const { request } = ctx
  // key 只经请求头（TEC-03）：不放 URL、不放 query、不放 body
  const apiKey = request.headers.get('x-vic-upstream-key') ?? ''
  if (!apiKey) return jsonError(ErrorCode.badRequest, '缺少 X-Vic-Upstream-Key 请求头', 401)

  let body: ChatRequest
  try {
    body = (await request.json()) as ChatRequest
  } catch {
    return jsonError(ErrorCode.badRequest, '请求体不是合法 JSON', 400)
  }
  if (!body?.upstream?.baseUrl || !body?.upstream?.model || !Array.isArray(body.messages)) {
    return jsonError(ErrorCode.badRequest, '请求体缺少必要字段（upstream/messages）', 400)
  }
  if (body.stream !== true) {
    return jsonError(ErrorCode.badRequest, '本代理只支持 stream: true', 400)
  }

  const built = await buildUpstreamRequest(body, apiKey)
  if (built instanceof Response) return built

  // 连接层（DNS/TLS/连接拒绝）重试 ≤ 1 次；首字节超时 30s；流中断不重试
  let upstreamRes: Response
  for (let attempt = 0; ; attempt++) {
    try {
      upstreamRes = await fetch(built.url.toString(), {
        ...built.init,
        signal: AbortSignal.timeout(FIRST_BYTE_TIMEOUT_MS),
      })
      break
    } catch (e) {
      const isTimeout = e instanceof Error && e.name === 'TimeoutError'
      if (isTimeout) return jsonError(ErrorCode.timeout, '回复超时', 504)
      if (attempt >= CONNECT_RETRY_MAX) return jsonError(ErrorCode.upstream, '上游故障', 502)
      // 连接层失败 → 重试一次（纯网络层，不涉及状态）
    }
  }

  // 3xx：禁重定向（规则 3）——一律按错误处理
  if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
    return jsonError(ErrorCode.blockedUpstream, '端点不被允许', 403)
  }
  if (upstreamRes.status === 401 || upstreamRes.status === 403) {
    return jsonError(ErrorCode.auth, '密钥无效或被拒', 502)
  }
  if (upstreamRes.status === 429) {
    return jsonError(ErrorCode.rate, '限流，请稍后再试', 502)
  }
  if (upstreamRes.status >= 500) {
    return jsonError(ErrorCode.upstream, '上游故障', 502)
  }
  if (upstreamRes.status >= 400) {
    return jsonError(ErrorCode.badRequest, '请求被上游拒绝', 502)
  }

  // SSE 逐帧透传：Content-Type 透传上游；首帧前不缓冲（首个 token 直出）
  const headers = new Headers()
  headers.set('content-type', upstreamRes.headers.get('content-type') ?? 'text/event-stream')
  headers.set('cache-control', 'no-cache')
  // key 零留存：响应头不透传上游全部头（避免 set-cookie/鉴权泄漏），只透传类型与编码
  const enc = upstreamRes.headers.get('content-encoding')
  if (enc && enc !== 'identity') {
    // 流已按原样转发；Cloudflare Workers 已解码 fetch 响应体，不再声明上游编码
  }
  return new Response(upstreamRes.body, { status: 200, headers })
}

export const onRequestGet = async (): Promise<Response> =>
  new Response(JSON.stringify({ error: { code: 'bad-request', message: '只支持 POST' } }), {
    status: 405,
    headers: { 'content-type': 'application/json' },
  })
