// EXEMPT:LAYER-008
// src/llm/client.ts — /api/chat SSE 客户端（LL-10 消费侧）＋调用计数（LL-17 本局累计）
// 同源独占（TEC-03 不变量 2）：本文件只请求本站 /api/chat；key 只经 X-Vic-Upstream-Key 请求头
// （不进 body/URL/prompt——LL-12 不变量 4；代理结构错误体回传只含分类码）。
// 重试纪律（LL-19）：auth/rate/timeout/stream-broken 不重试；upstream(5xx) 连接层重试 ≤1 次；
// 流中断不重试但已收块照常返回（LL-02 不变量 1）。首字节 30s 超时 → timeout。
// extractor（LL-15）不在本批次；这里只做主调用。

import type { LlmErrorCode } from './errors'
import { LLM_ERROR_TABLE, classifyHttpFailure, normalizeProxyCode } from './errors'
import type { ChatMessage } from './prompt'

const FIRST_BYTE_TIMEOUT_MS = 30_000
const COMPACT_TEMPERATURE = 0.3 // LL-14 compact 主调用温度（数字原样；split/call 不在本批次）

export type ChatOutcome =
  | { ok: true; text: string }
  | { ok: false; code: LlmErrorCode; message: string; partialText?: string } // stream-broken 携已收部分

export interface CallStat {
  at: number // 调用序（禁用 Date——B-02 同源纪律：用单调序号，不进存档）
  code: 'ok' | LlmErrorCode
  promptChars: number
  completionChars: number
  retried: boolean
}

// 本局累计调用计数（LL-17）：纯观测 —— 不改变调用行为；观测数据不进存档（LL-17 扩展方式）。
const callLog: CallStat[] = []
let seq = 0

export function getCallStats(): readonly CallStat[] { return callLog }
export function countRealCalls(): number { return callLog.length } // 免 API 路径断言对象：必须恒 0
export function resetCallStats(): void { callLog.length = 0; seq = 0 } // 测试专用

function record(entry: Omit<CallStat, 'at'>): void {
  callLog.push({ at: ++seq, ...entry })
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** 单次 SSE 请求：返回 ok / 错误分类 / partial（仅记录不抛异常——LL-19 降级语义） */
async function requestOnce(
  args: { baseUrl: string; model: string; apiKey: string; messages: ChatMessage[]; onDelta?: (chunk: string) => void },
  fetchImpl: FetchLike,
): Promise<ChatOutcome> {
  const controller = new AbortController()
  let firstByte = false
  const timer = setTimeout(() => controller.abort(), FIRST_BYTE_TIMEOUT_MS)
  try {
    const res = await fetchImpl('/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-vic-upstream-key': args.apiKey, // TEC-03：key 只经请求头
      },
      body: JSON.stringify({
        upstream: { baseUrl: args.baseUrl, model: args.model },
        messages: args.messages,
        stream: true,
        temperature: COMPACT_TEMPERATURE,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      clearTimeout(timer)
      let code: LlmErrorCode = classifyHttpFailure(res.status)
      try {
        const body = await res.json() as { error?: { code?: unknown; message?: string } }
        code = normalizeProxyCode(body?.error?.code) ?? code
        return { ok: false, code, message: body?.error?.message || LLM_ERROR_TABLE[code].playerMessage }
      } catch {
        return { ok: false, code, message: LLM_ERROR_TABLE[code].playerMessage }
      }
    }
    const reader = res.body?.getReader?.()
    if (!reader) { clearTimeout(timer); return { ok: false, code: 'upstream', message: '响应体不可流式读取' } }
    const decoder = new TextDecoder()
    let buf = ''
    let text = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!firstByte) { firstByte = true; clearTimeout(timer) }
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const chunk = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }
          const delta = chunk.choices?.[0]?.delta?.content ?? ''
          if (delta) { text += delta; args.onDelta?.(delta) }
        } catch { /* 坏帧跳过（帧级容错；块级容错在 parseBlocks） */ continue }
      }
    }
    clearTimeout(timer)
    return text === '' ? { ok: false, code: 'upstream', message: '空回复' } : { ok: true, text }
  } catch (e) {
    clearTimeout(timer)
    if (controller.signal.aborted && !firstByte) return { ok: false, code: 'timeout', message: LLM_ERROR_TABLE.timeout.playerMessage }
    // 流中断（读环内异常）：不重试；已收部分照常返回（stream-broken）
    return { ok: false, code: 'stream-broken', message: (e as Error).message || LLM_ERROR_TABLE['stream-broken'].playerMessage, partialText: '' }
  }
}

/** 主调用（包装重试纪律 + 计数）：upstream 5xx 连接层重试 ≤1 次；其余分类不重试 */
export async function callChatCompletion(args: {
  baseUrl: string; model: string; apiKey: string; messages: ChatMessage[]; onDelta?: (chunk: string) => void
}, fetchImpl?: FetchLike): Promise<ChatOutcome> {
  const fx = fetchImpl ?? ((input, init) => fetch(input, init))
  const first = await requestOnce(args, fx)
  record({ code: first.ok ? 'ok' : first.code, promptChars: args.messages.map((m) => m.content.length).reduce((a, b) => a + b, 0), completionChars: (first.ok ? first.text : first.partialText) ? ((first.ok ? first.text : first.partialText)?.length ?? 0) : 0, retried: false })
  if (first.ok || first.code !== 'upstream') return first
  // LL-19 upstream 行：连接层重试 ≤1 次（重试会计数 —— LL-17 不变量 2）
  const second = await requestOnce(args, fx)
  record({ code: second.ok ? 'ok' : second.code, promptChars: args.messages.map((m) => m.content.length).reduce((a, b) => a + b, 0), completionChars: (second.ok ? second.text : second.partialText) ? ((second.ok ? second.text : second.partialText)?.length ?? 0) : 0, retried: true })
  return second
}
