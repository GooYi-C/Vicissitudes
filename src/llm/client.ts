// EXEMPT:LAYER-008
// src/llm/client.ts — 玩家浏览器直连云 API（LL-10）；CF 不转发模型请求。
// key 只进玩家指定服务商的 Authorization；CORS/TLS 失败不探测、不转 CF、不读不透明响应。
// 字符计数不是 token/费用；usage 缺失或流未完整结束必须标未测，不能以 0 或模板哈希代替。
// 重试纪律（LL-19）：upstream 连接层至多一次；流中断不重试，保留已收文本。

import type { LlmErrorCode } from './errors'
import { LLM_ERROR_TABLE, classifyUpstreamFailure } from './errors'
import { providerEndpoint } from '../validation/apiEndpoint'
import type { ChatMessage } from './prompt'

const FIRST_BYTE_TIMEOUT_MS = 30_000
const COMPACT_TEMPERATURE = 0.3

export type ChatOutcome =
  | { ok: true; text: string }
  | { ok: false; code: LlmErrorCode; message: string; partialText?: string }

export interface ReportedUsage {
  source: 'upstream'
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedPromptTokens: number | null // null = 未报告/非法；0 = 上游明确报告未命中
}

export interface CallStat {
  at: number // 单调调用序；不进 SaveRecord
  code: 'ok' | LlmErrorCode
  promptChars: number // JS UTF-16 计数，仅作字符观测，不冒充 tokenizer
  completionChars: number
  retried: boolean
  usage: ReportedUsage | null
  usageComplete: boolean // 有合法 usage 且收到 [DONE]；流中断时只保留部分观测
}

const callLog: CallStat[] = []
let seq = 0

/** 白名单数据的独立快照；调用者不能改写计量账。 */
export function getCallStats(): readonly CallStat[] {
  return callLog.map((entry) => ({ ...entry, usage: entry.usage ? { ...entry.usage } : null }))
}
export function countRealCalls(): number { return callLog.length } // 客户端生成请求数（含重试；不含模型列表与浏览器 OPTIONS）
export function resetCallStats(): void { callLog.length = 0; seq = 0 } // 测试专用

/** 全样本覆盖才给累计实测值；部分覆盖、空样本或零分母不伪装为 0/100%。 */
export function summarizeCallStats(entries: readonly CallStat[]) {
  const measured = entries.filter((entry) => entry.usageComplete && entry.usage !== null)
  const cached = measured.filter((entry) => entry.usage?.cachedPromptTokens !== null)
  const complete = entries.length > 0 && measured.length === entries.length
  const cacheComplete = complete && cached.length === entries.length
  const sum = (values: number[]): number | null => {
    const value = values.reduce((a, b) => a + b, 0)
    return Number.isSafeInteger(value) ? value : null
  }
  const promptTokens = complete ? sum(measured.map((entry) => entry.usage!.promptTokens)) : null
  const completionTokens = complete ? sum(measured.map((entry) => entry.usage!.completionTokens)) : null
  const cachedPromptTokens = cacheComplete ? sum(cached.map((entry) => entry.usage!.cachedPromptTokens!)) : null
  return {
    calls: entries.length,
    measuredCalls: measured.length,
    cacheMeasuredCalls: cached.length,
    promptChars: entries.reduce((n, entry) => n + entry.promptChars, 0),
    completionChars: entries.reduce((n, entry) => n + entry.completionChars, 0),
    promptTokens,
    completionTokens,
    cachedPromptTokens,
    // 上游整个 prompt 的加权缓存 token 占比，不是静态头分段命中率。
    cacheTokenRatio: promptTokens !== null && promptTokens > 0 && cachedPromptTokens !== null
      ? cachedPromptTokens / promptTokens : null,
  }
}

function objectOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}
function tokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** 只投影已报告的数值，拒绝字符串/负数/越界；未知字段（含任何正文/凭据）不保留。 */
function readUsage(value: unknown): ReportedUsage | null {
  const raw = objectOf(value)
  if (!raw || !tokenCount(raw.prompt_tokens) || !tokenCount(raw.completion_tokens)) return null
  const total = raw.prompt_tokens + raw.completion_tokens
  if (!Number.isSafeInteger(total)) return null
  if (raw.total_tokens != null && (!tokenCount(raw.total_tokens) || raw.total_tokens !== total)) return null
  const nested = objectOf(raw.prompt_tokens_details)?.cached_tokens
  const flat = raw.prompt_cache_hit_tokens // 兼容已有 OpenAI-compatible 用量字段，不增代理特例
  const valueCached = nested ?? flat
  const conflicting = nested != null && flat != null && nested !== flat
  let cached = !conflicting && tokenCount(valueCached) && valueCached <= raw.prompt_tokens ? valueCached : null
  if (raw.prompt_cache_miss_tokens != null && cached !== null
    && (!tokenCount(raw.prompt_cache_miss_tokens) || cached + raw.prompt_cache_miss_tokens !== raw.prompt_tokens)) cached = null
  return { source: 'upstream', promptTokens: raw.prompt_tokens, completionTokens: raw.completion_tokens, totalTokens: total, cachedPromptTokens: cached }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
interface ChatArgs {
  baseUrl: string
  model: string
  apiKey: string
  messages: ChatMessage[]
  onDelta?: (chunk: string) => void
  includeUsage?: boolean // 默认省略；仅明确支持时请求 stream_options.include_usage，不做自动兼容重试
}
interface AttemptResult { outcome: ChatOutcome; usage: ReportedUsage | null; usageComplete: boolean; retryable: boolean }

async function requestOnce(args: ChatArgs, endpoint: string, fetchImpl: FetchLike): Promise<AttemptResult> {
  const controller = new AbortController()
  let firstByte = false
  let text = ''
  let usage: ReportedUsage | null = null
  let streamDone = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const finish = (outcome: ChatOutcome, retryable = false): AttemptResult => ({ outcome, usage, usageComplete: streamDone && usage !== null, retryable })
  const timer = setTimeout(() => controller.abort(), FIRST_BYTE_TIMEOUT_MS)
  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${args.apiKey.trim()}` },
      body: JSON.stringify({
        model: args.model.trim(),
        messages: args.messages,
        stream: true,
        temperature: COMPACT_TEMPERATURE,
        ...(args.includeUsage === true ? { stream_options: { include_usage: true } } : {}),
      }),
      signal: controller.signal,
    })
    if (res.type === 'opaque' || res.type === 'opaqueredirect' || res.status === 0) {
      return finish({ ok: false, code: 'network-or-cors', message: LLM_ERROR_TABLE['network-or-cors'].playerMessage })
    }
    if (res.redirected || (res.status >= 300 && res.status < 400)) {
      return finish({ ok: false, code: 'blocked-upstream', message: LLM_ERROR_TABLE['blocked-upstream'].playerMessage })
    }
    if (!res.ok) {
      const code = await failureCode(res)
      return finish({ ok: false, code, message: LLM_ERROR_TABLE[code].playerMessage }, code === 'upstream' && res.status >= 500)
    }
    reader = res.body?.getReader?.()
    if (!reader) return finish({ ok: false, code: 'upstream', message: '响应体不可流式读取' })
    const decoder = new TextDecoder()
    let buf = ''
    const consumeLine = (line: string) => {
      if (streamDone || !line.startsWith('data:')) return
      const data = line.slice(5).trim()
      if (data === '[DONE]') { streamDone = true; return }
      try {
        const chunk = objectOf(JSON.parse(data))
        if (!chunk) return
        if (chunk.usage != null) usage = readUsage(chunk.usage) // 累计快照取末次，不逐帧累加
        const choice = Array.isArray(chunk.choices) ? objectOf(chunk.choices[0]) : null
        const delta = objectOf(choice?.delta)?.content
        if (typeof delta === 'string' && delta) { text += delta; args.onDelta?.(delta) }
      } catch { /* 坏帧或坏观测不得中断正文 */ }
    }
    const drain = () => {
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        consumeLine(buf.slice(0, nl).trim())
        buf = buf.slice(nl + 1)
      }
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        buf += decoder.decode()
        drain()
        if (buf.trim()) consumeLine(buf.trim()) // 末行可能没有换行，不能丢掉最终 usage/[DONE]
        break
      }
      if (!firstByte) { firstByte = true; clearTimeout(timer) }
      buf += decoder.decode(value, { stream: true })
      drain()
      if (streamDone) break
    }
    // 保持既有正文/EOF兼容行为；无 [DONE] 的 usage 只能算部分观测，不充作完整账单。
    return finish(text === '' ? { ok: false, code: 'upstream', message: '空回复' } : { ok: true, text })
  } catch {
    if (controller.signal.aborted && !firstByte) return finish({ ok: false, code: 'timeout', message: LLM_ERROR_TABLE.timeout.playerMessage })
    const code = firstByte ? 'stream-broken' : 'network-or-cors'
    return finish({ ok: false, code, message: LLM_ERROR_TABLE[code].playerMessage, ...(firstByte ? { partialText: text } : {}) })
  } finally {
    clearTimeout(timer)
    try { await reader?.cancel?.() } catch { /* 释放失败不得触发额外调用 */ }
    try { reader?.releaseLock?.() } catch { /* 测试桩/已关闭流 */ }
  }
}

async function failureCode(res: Response): Promise<LlmErrorCode> {
  let bodyCode: unknown
  try { bodyCode = (await res.json() as { error?: { code?: unknown } })?.error?.code } catch { /* 原始错误体不展示 */ }
  return classifyUpstreamFailure(res.status, bodyCode)
}

function prepareRequest(baseUrl: string, apiKey: string, route: 'chat/completions' | 'models') {
  if (!baseUrl.trim() || !apiKey.trim()) return { ok: false as const, code: 'no-provider' as const }
  if (/[\r\n\u0000-\u001f\u007f]/.test(apiKey.trim())) return { ok: false as const, code: 'bad-request' as const }
  const origin = typeof location === 'undefined' ? undefined : location.origin
  return providerEndpoint(baseUrl, route, origin)
}

export type ModelsOutcome =
  | { ok: true; models: string[] }
  | { ok: false; models: []; code: LlmErrorCode; message: string }

/** 用户主动点击才读取列表；不自动探测、不生成内容、不计入生成次数。 */
export async function fetchProviderModels(args: { baseUrl: string; apiKey: string }, fetchImpl?: FetchLike): Promise<ModelsOutcome> {
  const endpoint = prepareRequest(args.baseUrl, args.apiKey, 'models')
  const failed = (code: LlmErrorCode): ModelsOutcome => ({ ok: false, models: [], code, message: LLM_ERROR_TABLE[code].playerMessage })
  if (!endpoint.ok) return failed(endpoint.code)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FIRST_BYTE_TIMEOUT_MS)
  try {
    const res = await (fetchImpl ?? fetch)(endpoint.url, {
      method: 'GET', mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
      headers: { accept: 'application/json', authorization: `Bearer ${args.apiKey.trim()}` }, signal: controller.signal,
    })
    if (res.type === 'opaque' || res.type === 'opaqueredirect' || res.status === 0) return failed('network-or-cors')
    if (res.redirected || (res.status >= 300 && res.status < 400)) return failed('blocked-upstream')
    if (!res.ok) return failed(await failureCode(res))
    const body = await res.json() as { data?: unknown }
    if (!Array.isArray(body?.data)) return failed('bad-request')
    const key = args.apiKey.trim()
    const models = body.data.slice(0, 500).map((row) => objectOf(row)?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200 && !id.includes(key))
    return { ok: true, models: [...new Set(models)] }
  } catch {
    return failed(controller.signal.aborted ? 'timeout' : 'network-or-cors')
  } finally { clearTimeout(timer) }
}

/** 主调用与计量独立：观测失败/缺失不改变 prompt、重试、状态或额外发探测请求。 */
export async function callChatCompletion(args: ChatArgs, fetchImpl?: FetchLike): Promise<ChatOutcome> {
  const endpoint = prepareRequest(args.baseUrl, args.apiKey, 'chat/completions')
  const code = !endpoint.ok ? endpoint.code : !args.model.trim() ? 'no-provider' : null
  if (code) return { ok: false, code, message: LLM_ERROR_TABLE[code].playerMessage }
  if (!endpoint.ok) return { ok: false, code: endpoint.code, message: LLM_ERROR_TABLE[endpoint.code].playerMessage }
  const fx = fetchImpl ?? ((input, init) => fetch(input, init))
  const invoke = async (retried: boolean) => {
    const result = await requestOnce(args, endpoint.url, fx)
    const outcome = result.outcome
    callLog.push({
      at: ++seq,
      code: outcome.ok ? 'ok' : outcome.code,
      promptChars: args.messages.reduce((n, message) => n + message.content.length, 0),
      completionChars: (outcome.ok ? outcome.text : outcome.partialText ?? '').length,
      retried,
      usage: result.usage,
      usageComplete: result.usageComplete,
    })
    return result
  }
  const first = await invoke(false)
  // 仅连接/HTTP 上游故障可重试；200 空正文/不支持格式可能已经计费，不重复生成。
  if (!first.retryable) return first.outcome
  return (await invoke(true)).outcome
}
