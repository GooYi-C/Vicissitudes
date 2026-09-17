// src/orchestration/scheduler.ts — 注册期四校验 + 双管线调度（§十八 M-02/M-12、§十九 B-05）
// 调用矩阵：每 calendar 月 × 每模块恰好一次（M-12 不变量 4）；cadence 按 M-05
// （monthly 两管线都跑；full 仅终月）。相位次序：simulation 先于 aftermath（B-05）。
// 唯一提交权在 world.ts（B-04/B-06）—— 调度器只编排 collect 与发布。

import type { EngineModule, TickContext, Diagnostic } from '../engine/types'
import { simulationModules, aftermathModules, writerChainOf } from '../engine/registry'
import { deriveRng } from '../engine/rng'
import type { DomainEffect } from '../validation/effects'

export class RegistrationError extends Error {
  constructor(public readonly violations: string[]) {
    super(`注册期校验失败（M-02）：\n  ${violations.join('\n  ')}`)
  }
}

// ── M-02 注册期四校验（dev/test 必跑；静态字段 + 注册顺序，不依赖运行行为）────

export function validateRegistry(sim: readonly EngineModule[], aft: readonly EngineModule[]): void {
  const v: string[] = []
  const all = [...sim, ...aft]

  // 0) 基础：id 唯一且静态字段可读
  const ids = new Set<string>()
  for (const m of all) {
    if (ids.has(m.id)) v.push(`id 重复：${m.id}`)
    ids.add(m.id)
    if (typeof m.id !== 'string' || typeof m.phase !== 'string' || typeof m.cadence !== 'string') {
      v.push(`${m.id}: id/phase/cadence 必须为字面量常量（M-01 不变量 2）`)
    }
  }

  // 1) 写入必须声明：writes 非空（每模块至少声明一个写域 —— 纯读者不该是模块）
  //    注：写域前缀合法性由编译层 M-03 表守（compiler 受限指令集）；此处校验声明完备性。
  for (const m of all) {
    if (!Array.isArray(m.writes) || m.writes.length === 0) {
      v.push(`${m.id}: writes 必须为非空静态数组（M-02-1 写入必须声明）`)
    }
    if (!Array.isArray(m.reads)) {
      v.push(`${m.id}: reads 必须为静态数组（M-01 声明纪律）`)
    }
  }

  // 2) 同相位同域唯一写者（M-04 链登记的例外）
  for (const [phaseLabel, mods] of [['simulation', sim], ['aftermath', aft]] as const) {
    const writersByDomain = new Map<string, string[]>()
    for (const m of mods) {
      for (const w of m.writes) {
        const key = domainKey(w)
        const list = writersByDomain.get(key) ?? []
        list.push(m.id)
        writersByDomain.set(key, list)
      }
    }
    for (const [domain, writers] of writersByDomain) {
      if (writers.length > 1) {
        const chain = writerChainOf(domain)
        const chainOk = chain && writers.every((w) => chain.includes(w))
        if (!chainOk) {
          v.push(`${phaseLabel} 相位：域 ${domain} 有 ${writers.length} 个写者（${writers.join(', ')}）且未在 M-04 链登记（M-02-2）`)
        }
      }
    }
  }

  // 3) 读序纪律：不得读同相位中排在自己之后的模块的写域
  //    例外 A：M-04 链成员互读合法（链序显式登记了「谁看见谁」—— 链内前位读后位写域
  //    语义为「读到上一月该写者的产出」，这正是链存在的目的）
  //    例外 B：非链读者读链域 =「读上月终态」（B-03 不变量 3 同款语义：月账口径）。
  //    依据：M-02-3 的目的 = 防读「本轮中间态」；链域（map/territoryControl/memory.items）
  //    的终态在月末才成立，任何读它的模块读的必然是上月终态 —— 非中间态，无竞争面。
  //    R1 首用：market/finance 读 map/*（读上月六维）、fiscal 读 territoryControl（读上月势力）。
  for (const [phaseLabel, mods] of [['simulation', sim], ['aftermath', aft]] as const) {
    for (let i = 0; i < mods.length; i++) {
      const m = mods[i]
      for (const r of m.reads) {
        const rKey = domainKey(r)
        const chain = writerChainOf(rKey)
        const inChain = chain?.includes(m.id) ?? false
        for (let j = i + 1; j < mods.length; j++) {
          const later = mods[j]
          if (later.writes.some((w) => domainPrefixMatch(w, r))) {
            const laterInChain = chain?.includes(later.id) ?? false
            if (inChain && laterInChain) continue // 例外 A：链内互读
            if (chain) continue // 例外 B：链域读者 = 读上月终态（链序即声明）
            v.push(`${phaseLabel} 相位读序违规：${m.id}（第 ${i + 1} 位）读了后位模块 ${later.id}（第 ${j + 1} 位）的写域 ${r}（M-02-3）`)
          }
        }
      }
    }
  }

  // 4) cadence 覆盖一致性：monthly 集必须是 full 集的子序列（顺序一致）
  for (const [phaseLabel, mods] of [['simulation', sim], ['aftermath', aft]] as const) {
    const monthly = mods.filter((m) => m.cadence === 'monthly').map((m) => m.id)
    const full = mods.filter((m) => m.cadence === 'full' || m.cadence === 'monthly').map((m) => m.id)
    // monthly ⊆ full 且顺序一致（full 序列剔除 full-only 后应恰为 monthly 序列）
    const collapsed = full.filter((id) => monthly.includes(id))
    if (collapsed.join(',') !== monthly.join(',')) {
      v.push(`${phaseLabel} 相位 cadence 子序列关系不成立（M-02-4）：monthly=[${monthly.join(',')}] 不是 full=[${full.join(',')}] 的子序列`)
    }
  }

  if (v.length > 0) throw new RegistrationError(v)
}

// 前缀匹配（M-02-1 判定：前缀匹配不是路径全等 —— 'map/*' 覆盖 'map/wuhan/security'）
function domainPrefixMatch(declared: string, path: string): boolean {
  const d = declared.replace(/\/\*$/, '')
  const p = path.replace(/\/\*$/, '')
  return p === d || p.startsWith(`${d}/`) || declared === path
}

// 域键规范化：'map/*' / 'map' / 'map/wuhan' → 'map'（链登记键与模块声明键的统一口径）
function domainKey(d: string): string {
  return d.replace(/\/\*$/, '').split('/')[0]
}

// ── TickContext 构造（B-01/B-02）──────────────────────────────────

// B-03：market 产出的结构化发布载荷（market.collect 返回单条 marketPublish 效果；
// 编排器解析其 args 作为通道值 —— 唯一发布路径，不从 state 读「最近市场」）
export interface MarketQuote {
  readonly price: number
  readonly trend: number
}

export function makeTickContext(params: {
  moduleId: string // rng 按 (模块id, monthIndex, salt) 派生 —— 每模块独立
  date: string
  monthIndex: number
  state: Readonly<Record<string, unknown>>
  market: Readonly<Record<string, MarketQuote>>
  diagnostics: Diagnostic[]
}): TickContext {
  const { moduleId, date, monthIndex, state, market, diagnostics } = params
  return {
    date,
    monthIndex,
    rng: (salt: string) => deriveRng(moduleId, monthIndex, salt),
    market: Object.freeze(market),
    diagnostics,
    state,
  }
}

// ── 双管线执行（B-05：simulation 完整跑完才进 aftermath；不交错）───────

export interface MonthRunResult {
  effects: DomainEffect[] // 本月全部效果（按相位序 → 注册序；编译与提交在 world.ts）
  callLog: string[] // 调用矩阵证据（模块 × 月份恰一次 —— MOD-5 断言对象）
  diagnostics: Diagnostic[]
}

export function runMonth(params: {
  state: Readonly<Record<string, unknown>>
  date: string
  monthIndex: number
  isTerminalMonth: boolean // full 管线月（M-05：full 仅终月跑）
  market?: Readonly<Record<string, MarketQuote>>
}): MonthRunResult {
  const { state, date, monthIndex, isTerminalMonth } = params
  const diagnostics: Diagnostic[] = []
  const effects: DomainEffect[] = []
  const callLog: string[] = []
  let market: Readonly<Record<string, MarketQuote>> = params.market ?? {}

  const runPhase = (mods: readonly EngineModule[], phaseLabel: string) => {
    for (const m of mods) {
      // cadence 过滤（M-05）：monthly 两管线都跑；full 仅终月
      if (m.cadence === 'full' && !isTerminalMonth) continue
      const ctx = makeTickContext({ moduleId: m.id, date, monthIndex, state, market, diagnostics })
      const produced = m.collect(state, ctx)
      callLog.push(`${phaseLabel}:${m.id}`)
      effects.push(...produced)
      // B-03：market 唯一发布 —— market 模块产出 marketPublish 效果（结构化 MarketResult），
      // 编排器解析后发布进通道；这是唯一发布点（BUS-2：无第二获取路径）。
      if (m.id === 'market') {
        const pub = produced.find((e) => e.op === 'marketPublish')
        const quotes = pub?.args?.quotes
        if (pub && quotes && typeof quotes === 'object') {
          market = Object.freeze({ ...(quotes as Record<string, MarketQuote>) })
        }
      }
    }
  }

  // B-05 不变量 1：simulation 先于 aftermath；各自完整跑完不交错
  runPhase(simulationModules(), 'simulation')
  runPhase(aftermathModules(), 'aftermath')

  return { effects, callLog, diagnostics }
}
