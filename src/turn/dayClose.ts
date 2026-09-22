// src/turn/dayClose.ts — S-07/S-08 日结（L4：引擎侧 facts 确定性导出 + S-08 五行边界规则 + 规则日叙）
//
// 住 L4 的理由：事实来源 = 本回合「提交的效果批」（L2 产出 → L4 compiler 编译 → L4 TurnRunner 单次提交），
// 日结是提交编排的一部分（S-08 不变量 1 的顺序锁死住编排点）。
//
// 层向纪律（本批留痕）：本文件**自包含**（零同层 import）。dayClose.ts 不在 graph-check.mjs /
// eslint.config.js 的 LAYER_EXEMPT 双端点名单内（两处判定均为 from∧to 同时豁免），
// 引 monthClose/monthRunner 会被 L-02 同层拦下 —— 故两者互不引用，编排由组合根 App.vue 承担。
// dayLogs/DayLog 形状属 L7（src/stores/saveSchema.ts），L4→L7 是越层非法（L-01，含 import type）；
// 故此处**本地同构声明**（先例：acceptance-vs01.md §2 prompt.ts「本地同构声明」），
// 结构等值由调用点的 TS 结构类型承担（App.vue 传入 SaveRecord.dayLogs 即编译期校验）。
//
// S-08 五行边界规则（逐条落在这里）：
//   ① 一回合跨多日（旅行）→ 在途日不生成独立 DayLog：整段一条，date 记起始日，kind:'transit'，facts 记 move
//   ② 回合跨月 → 日结先于月关账（顺序锁死；违反即月关账侧报错 —— 见 monthClose.closeMonth 前置断言）
//   ③ 日叙回合边界：同日多回合 → 一条 DayLog，turnRange 覆盖 [首回合, 末回合]（本文件合并语义）
//   ④ 纯过月无剧情日 → DayLog 照落（facts 空 + 规则日叙「本月平静」一行）
//   ⑤ split 模式「实质内容」判定不在本批次（LL-14 范围外）—— 本文件不做该判定，不预置钩子
//
// 红线（S-08）：结构判定零语义 —— narrative 文本不进任何分支；分支只看 op/kind 与字段值形状。
// 错误语义（S-07）：降级 —— 对话侧抽取失败/坏块 → 引擎侧 facts 照常（两侧独立，见 dialogFacts 处理）。

import type { DomainEffect } from '../validation/effects'
import { monthIndexFrom } from '../validation/calendar'

// ── 本地同构声明（S-07 形状；与 saveSchema.ts 的 DayLog/DayFact 结构等值）──────────
export interface DayFactPerson { kind: 'person'; name: string; note?: string }
export interface DayFactPromise { kind: 'promise'; from: string; to: string; dueDate?: string; what: string }
export interface DayFactDeal { kind: 'deal'; amount: number; counterparty: string; what: string }
export interface DayFactMove { kind: 'move'; from: string; to: string }
export interface DayFactSituation { kind: 'situation'; id: string; outcome?: string }
export interface DayFactNote { kind: 'note'; text: string }
export type DayFact = DayFactPerson | DayFactPromise | DayFactDeal | DayFactMove | DayFactSituation | DayFactNote

export interface DayLog {
  date: string // 游戏日（ISO）
  facts: DayFact[] // 全量，永不压缩（S-07 不变量 2）
  narrative: string // 日叙
  turnRange: [number, number]
  kind?: 'transit'
}

export const NARRATIVE_MAX = 500 // LL-13 截断上界（S-07 不变量 1）
const EMPTY_DAY_NARRATIVE = '本月平静。' // S-08 ④ 空日规则日叙（一行）

export interface DayCloseInput {
  readonly from: string // 推进前月份 YYYY-MM（= 被关闭的活跃月）
  readonly to: string // 推进后月份 YYYY-MM
  readonly turn: number // 本回合序号（turnRange 右端）
  readonly effects: readonly DomainEffect[] // 本回合提交的效果批（引擎侧 facts 唯一来源）
  readonly dayLogs: readonly DayLog[] // 既有日结（追加语义；既有条目只增不改）
  readonly dialogFacts?: readonly unknown[] // 对话侧（person/promise/note）；缺失/坏项 → 跳过并注记
}

export interface DayCloseResult {
  readonly dayLogs: DayLog[]
  readonly appended: DayLog | null // 本条落定的 DayLog（合并时 = 合并后条目）
  readonly monthClosed: string // 被关闭的月份（= from）
  readonly transit: boolean
  readonly notes: string[] // 降级/丢弃注记（不静默）
}

// ── 引擎侧 facts 导出（确定性、零 LLM；同 effects → 同 facts 序列）──────────────

/** 行程跨度（月）：>1 表示一回合跨多日（在途）→ 合并为一条 transit */
export function monthSpan(from: string, to: string): number {
  return monthIndexFrom(to) - monthIndexFrom(from)
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** 引擎侧 facts：move（在途）/ deal（结算过账）/ situation（处境入队）——按批内序导出，可重放 */
export function factsFromEffects(
  effects: readonly DomainEffect[],
  params: { readonly from: string; readonly to: string; readonly transit: boolean },
): DayFact[] {
  const facts: DayFact[] = []
  if (params.transit) {
    // move 记月粒度 canonical 日期的 ISO 日形（本仓引擎侧 ISO 日期约定 = `${YYYY-MM}-01`）
    facts.push({ kind: 'move', from: `${params.from}-01`, to: `${params.to}-01` })
  }
  for (const eff of effects) {
    if (eff.op === 'settlementPost') {
      const raw = eff.args.amount
      const amount = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw * 100) / 100 : 0
      // 对手方：引擎侧 ops 无该字段（compiler.ts:125 落 {month,amount,what}）→ 空串，
      // 不猜、不从叙事文本取（S-08 红线）。缺口如实登记于 docs/acceptance-vs02.md §5。
      const counterparty = str(eff.args.counterparty)
      facts.push({ kind: 'deal', amount, counterparty, what: str(eff.args.what) })
    } else if (eff.op === 'situationEnqueue') {
      const sit = eff.args.situation as { templateId?: unknown } | undefined
      const id = str(sit?.templateId)
      if (id) facts.push({ kind: 'situation', id })
    }
  }
  return facts
}

// ── 对话侧 facts（S-07 降级语义：抽不到/坏块 → 引擎侧照常）────────────────────

function isDialogFact(v: unknown): v is DayFactPerson | DayFactPromise | DayFactNote {
  if (!v || typeof v !== 'object') return false
  const f = v as Record<string, unknown>
  if (f.kind === 'person') return typeof f.name === 'string' && f.name.length > 0 && (f.note === undefined || typeof f.note === 'string')
  if (f.kind === 'note') return typeof f.text === 'string' && f.text.length > 0
  if (f.kind === 'promise') return typeof f.from === 'string' && typeof f.to === 'string' && typeof f.what === 'string'
  return false
}

// ── 规则日叙（零 LLM；纯函数拼装，超 NARRATIVE_MAX 按 LL-13 截断）───────────────

function describeFact(f: DayFact): string {
  switch (f.kind) {
    case 'move': return `行程 ${f.from} → ${f.to}`
    case 'deal': return `过账 ${f.amount}（${f.what}）`
    case 'situation': return `处境「${f.id}」待决`
    case 'person': return `人物 ${f.name}${f.note ? `：${f.note}` : ''}`
    case 'promise': return `与 ${f.to} 的约定：${f.what}（期限 ${f.dueDate ?? '未记'}）`
    case 'note': return f.text
  }
}

export function ruleNarrative(facts: readonly DayFact[]): string {
  if (facts.length === 0) return EMPTY_DAY_NARRATIVE
  const body = `${facts.map(describeFact).join('；')}。`
  return body.length > NARRATIVE_MAX ? `${body.slice(0, NARRATIVE_MAX)}…` : body
}

// ── 日结主体 ────────────────────────────────────────────────────────────────

/**
 * 关闭一个活跃日：产出/合并 DayLog（S-08 ①②③④）。
 * 合并语义（③）：同日（`${from}-01`）多回合 → 同一条，facts 追加、turnRange 右端推进；
 * 在途（transit）与非在途不同 kind，不互相合并。
 */
export function closeDay(input: DayCloseInput): DayCloseResult {
  const notes: string[] = []
  const span = monthSpan(input.from, input.to)
  const transit = span > 1
  const day = `${input.from}-01`

  const engineFacts = factsFromEffects(input.effects, { from: input.from, to: input.to, transit })

  // 对话侧：逐项形状校验，坏项丢弃 + 注记（S-07 降级 —— 引擎侧 facts 不受影响）
  const dialogFacts: DayFact[] = []
  for (const raw of input.dialogFacts ?? []) {
    if (isDialogFact(raw)) dialogFacts.push(raw)
    else notes.push('对话侧 facts 条目形状非法 —— 丢弃该条（引擎侧 facts 照常，S-07 降级语义）')
  }

  const newFacts: DayFact[] = [...engineFacts, ...dialogFacts]
  const narrative = ruleNarrative(newFacts)

  const prev = input.dayLogs[input.dayLogs.length - 1]
  const canMerge = !!prev && prev.date === day && (prev.kind === 'transit') === transit
  if (canMerge) {
    const merged: DayLog = {
      date: prev.date,
      facts: [...prev.facts, ...newFacts], // 只增不减（S-07 不变量 2 / SAV-2）
      narrative: mergeNarrative(prev.narrative, narrative),
      turnRange: [prev.turnRange[0], input.turn],
      ...(prev.kind ? { kind: prev.kind } : {}),
    }
    return {
      dayLogs: [...input.dayLogs.slice(0, -1), merged],
      appended: merged,
      monthClosed: input.from,
      transit,
      notes,
    }
  }

  const appended: DayLog = {
    date: day,
    facts: newFacts,
    narrative,
    turnRange: [input.turn, input.turn],
    ...(transit ? { kind: 'transit' as const } : {}),
  }
  return { dayLogs: [...input.dayLogs, appended], appended, monthClosed: input.from, transit, notes }
}

/** 日叙合并（确定性：空日叙述不覆盖既有正文） */
function mergeNarrative(prevText: string, nextText: string): string {
  if (nextText === EMPTY_DAY_NARRATIVE) return prevText
  if (prevText === EMPTY_DAY_NARRATIVE) return nextText
  const joined = `${prevText}${prevText.endsWith('。') ? '' : '；'}${nextText}`
  return joined.length > NARRATIVE_MAX ? `${joined.slice(0, NARRATIVE_MAX)}…` : joined
}
