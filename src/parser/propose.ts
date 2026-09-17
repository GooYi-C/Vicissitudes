// EXEMPT:LAYER-005
// src/parser/propose.ts — LL-07 提议处境规格与钳制（校验与钳制层；入池经 events 通道）
// 双重校验 = EventEffectSchema 通用校验（形状）+ 提议专用钳制（数字原样 §6.5）：
//   silver Δ|≤100（按 1920s 银元量纲初值）/ reputation Δ|≤5 / health Δ|≤10 /
//   每 option ops ≤8 / 禁 set 指令 / options 2–4 / 单轮提议 ≤1（轮限额由调用方计数）。
// 校验失败整块丢弃（LL-07 不变量 1——失败不半留），记 proposal-rejected（LL-19）。
// 幂等（LL-07）：无向量时字符串规范化路径——同规范化 title 的 key 命中在档队列即判重复。

import type { PendingSituation } from '../validation/tree'
import { PendingSituationSchema } from '../validation/tree'
import { EventEffectSchema } from '../validation/dataSchemas'

export interface ProposePayloadInput {
  title?: unknown
  desc?: unknown
  options?: unknown
  tags?: unknown
}

export type ProposeVerdict =
  | { ok: true; situation: PendingSituation }
  | { ok: false; code: 'proposal-rejected'; detail: string }

// 提议专用钳制常量（LL-07 表 原样；LLM-18 断言对象）
export const PROPOSE_CLAMP = Object.freeze({
  silverMax: 100,
  reputationMax: 5,
  healthMax: 10,
  opsPerOptionMax: 8,
  optionsMin: 2,
  optionsMax: 4,
})

// silver/reputation/health 的额度科目映射（受限指令集领域内名 —— 双表防漂移靠 LLM-18 测试锁）
const BOUNDED_FIELDS: Readonly<Record<string, number>> = Object.freeze({
  silver: PROPOSE_CLAMP.silverMax,
  reputation: PROPOSE_CLAMP.reputationMax,
  health: PROPOSE_CLAMP.healthMax,
})

export function clampProposal(payload: ProposePayloadInput, date: string, queue: Readonly<Record<string, PendingSituation>>): ProposeVerdict {
  const reject = (detail: string): ProposeVerdict => ({ ok: false, code: 'proposal-rejected', detail })
  const title = typeof payload.title === 'string' ? payload.title.trim() : ''
  const desc = typeof payload.desc === 'string' ? payload.desc.trim() : ''
  if (!title) return reject('提议缺 title')
  if (!desc) return reject('提议缺 desc')
  const optionsRaw = Array.isArray(payload.options) ? payload.options : []
  if (optionsRaw.length < PROPOSE_CLAMP.optionsMin || optionsRaw.length > PROPOSE_CLAMP.optionsMax) {
    return reject(`options 数量 ${optionsRaw.length}（须 ${PROPOSE_CLAMP.optionsMin}–${PROPOSE_CLAMP.optionsMax}）`)
  }
  const options: { text: string; effects: { op: string; args: Record<string, unknown> }[] }[] = []
  for (const [i, opt] of optionsRaw.entries()) {
    const o = opt as { text?: unknown; effects?: unknown }
    const text = typeof o?.text === 'string' ? o.text.trim() : ''
    if (!text) return reject(`选项 ${i + 1} 缺 text`)
    const effects = Array.isArray(o?.effects) ? (o.effects as unknown[]) : []
    if (effects.length > PROPOSE_CLAMP.opsPerOptionMax) return reject(`选项 ${i + 1} ops ${effects.length} > ${PROPOSE_CLAMP.opsPerOptionMax}`)
    for (const [j, fx] of effects.entries()) {
      const shaped = EventEffectSchema.safeParse(fx)
      if (!shaped.success) return reject(`选项 ${i + 1} 效果 ${j + 1} 形状非法`)
      // 禁 set 指令（LL-07：两处与 M-03 同源）
      if (String(shaped.data.op) === 'set') return reject(`选项 ${i + 1} 效果 ${j + 1} 用禁指令 set`)
      // 幅度钳制（silver/reputation/health 三科目；path 越界归 sanitize 层，不归本表）
      const field = typeof shaped.data.args?.field === 'string' ? shaped.data.args.field : String(shaped.data.op)
      const delta = typeof shaped.data.args?.delta === 'number' ? shaped.data.args.delta
        : typeof shaped.data.args?.value === 'number' ? shaped.data.args.value : undefined
      for (const [bounded, max] of Object.entries(BOUNDED_FIELDS)) {
        if (field.includes(bounded) && delta !== undefined && Math.abs(delta) > max) {
          return reject(`选项 ${i + 1} 效果 ${j + 1} 幅度 |Δ${bounded}|=${Math.abs(delta)} > ${max}`)
        }
      }
    }
    options.push({ text, effects: effects as { op: string; args: Record<string, unknown> }[] })
  }
  const tags = Array.isArray(payload.tags) && payload.tags.length > 0
    ? payload.tags.map((t) => String(t))
    : ['model-proposal'] // tags 缺省兜底（形状要求 min 1）
  // key：规范化 title（小写、去空白）——字符串规范化幂等路径（向量通道属 embedding 批次）
  const slug = title.toLowerCase().replace(/\s+/g, '')
  const key = `sit-mp-${slug}`.slice(0, 48)
  if (key in queue) return reject(`同 key 处境在档（${key}）——规范化幂等去重（LL-07；无向量回退路径）`)
  const iso = `${date}-01`
  const y = Number(date.slice(0, 4)); const m = Number(date.slice(5, 7))
  const total = y * 12 + (m - 1) + 2 // 2 月到期窗（与 crisis 适配器同口径；LL-05 到期零效果）
  const exp = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
  const situation = PendingSituationSchema.parse({
    key,
    templateId: 'model-proposal', // sentinel（B-08 快照载荷口径；LLM-2 存档往返生存断言对象）
    payload: { version: 1, title, desc, options, tags },
    arrivedAt: iso,
    expiresAt: exp,
  })
  return { ok: true, situation }
}
