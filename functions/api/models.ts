// functions/api/models.ts — GET /api/models（§二十 LL-11）
// 上游 /v1/models 代理：只透传 id / owned_by 等非敏感字段；不回传任何 key 相关字段。
// 上游不支持该端点 → 空列表 ＋ 分类码（前端降级为手填模型名，不是错误态）。
// key 经请求头转发，服务端零留存（TEC-03 不变量 3）。

import { checkUrl, checkResolvedIp } from '../_lib/ssrf'
import { resolveHost } from '../_lib/doh'

interface ModelsRequest {
  upstream: { baseUrl: string }
}

function jsonError(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export const onRequestPost = async (ctx: { request: Request }): Promise<Response> => {
  const { request } = ctx
  const apiKey = request.headers.get('x-vic-upstream-key') ?? ''

  let body: ModelsRequest
  try {
    body = (await request.json()) as ModelsRequest
  } catch {
    return jsonError('bad-request', '请求体不是合法 JSON', 400)
  }
  const baseUrl = body?.upstream?.baseUrl
  if (!baseUrl) return jsonError('bad-request', '缺少 upstream.baseUrl', 400)

  const verdict = checkUrl(baseUrl)
  if (!verdict.ok) return jsonError('blocked-upstream', '端点不被允许', 403)

  let url: URL
  try {
    url = new URL(baseUrl)
    if (!url.pathname.endsWith('/models')) {
      url = new URL(url.pathname.replace(/\/$/, '') + '/models', url)
    }
  } catch {
    return jsonError('bad-request', '上游端点无效', 400)
  }

  const host = url.hostname
  if (!host.includes(':')) {
    const resolved = await resolveHost(host)
    for (const ip of resolved.ips) {
      if (!checkResolvedIp(ip).ok) return jsonError('blocked-upstream', '端点不被允许', 403)
    }
  }

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(url.toString(), {
      headers: apiKey ? { authorization: `Bearer ${apiKey}`, accept: 'application/json' } : { accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    // 上游不可达：空列表 ＋ 分类码（降级，不是错误态 —— 前端手填模型名）
    return new Response(
      JSON.stringify({ data: [], note: 'upstream-unreachable' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  if (upstreamRes.status === 404 || upstreamRes.status === 405) {
    // 上游不支持该端点 → 空列表（LL-11 不变量 4）
    return new Response(
      JSON.stringify({ data: [], note: 'models-not-supported' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
  if (!upstreamRes.ok) {
    return jsonError('upstream', '上游故障', 502)
  }

  // 只透传非敏感字段（id / owned_by / object）；任何 key 相关字段不回传
  let models: { id: string; owned_by?: string; object?: string }[] = []
  try {
    const json = (await upstreamRes.json()) as { data?: { id: string; owned_by?: string; object?: string }[] }
    models = (json.data ?? [])
      .filter((m) => typeof m?.id === 'string')
      .map((m) => ({ id: m.id, ...(m.owned_by ? { owned_by: m.owned_by } : {}), ...(m.object ? { object: m.object } : {}) }))
  } catch {
    return new Response(
      JSON.stringify({ data: [], note: 'models-unparseable' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
  return new Response(JSON.stringify({ data: models }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export const onRequestGet = async (): Promise<Response> =>
  new Response(JSON.stringify({ error: { code: 'bad-request', message: '只支持 POST' } }), {
    status: 405,
    headers: { 'content-type': 'application/json' },
  })
