// src/engine/finance.ts — 模块 6：实业/账本/资金链忠诚度（monthly）。M-03 写域：finance/*。
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// 账本与实业双向可对账（M-10 不变量）：businesses.lastProfit 是唯一净利口径，
// settlement 消费同一字段过账（无第二笔账）。
//
// E-1.4 实业月净收益率（初值；依据「60 月回本」设计；复核点：标定快照）：
//   rate = 0.03 + (城市 economy − 40) / 20 × 0.03   → 繁荣 ≥60 取上沿（≈6%），≤40 亏损
//   即 economy 100 → 6%；60 → 4.2%；40 → 3%（不亏）；≤40 线性滑入负区（最低 −3%）
//   净利 = capital × rate；亏损侵蚀 capital（厂子变小），盈利不自动增资（增资走命令层）
// 资金链忠诚度（E-2.3 哗变公式接口）：连续亏损 −5/月；盈利 +2/月（上限 100）。
// rng 噪声：±10% 经营波动（ctx.rng('finance') —— 同月确定）。

import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'
import type { Tree, FinanceBiz } from '../validation/tree'
import { cities } from '../data/cities'

const RATE_FLOOR = -0.03 // 亏损下限（economy 0 时 ≈ −6% 被 floor 在 −3%？否 —— 见公式；floor 保底）
const VOLATILITY = 0.10 // ±10% 经营波动

// 城市繁荣（map 运行态优先，未播种用 L0-04 初值）
function economyOf(cityId: string, map: Readonly<Record<string, { economy: number }>>): number {
  const dims = map[cityId]
  if (dims) return dims.economy
  return cities.find((c) => c.id === cityId)?.dims.economy ?? 50
}

export const finance: EngineModule = {
  id: 'finance',
  phase: 'simulation',
  cadence: 'monthly',
  // 读 map/*：城市繁荣度（前位写者 worldtick 在后 —— 读到的是上月运行态，
  // 本月刚写的播种/漂移未生效；L0-04 初值兜底首月）。
  reads: ['finance/*', 'map/*'],
  writes: ['finance/*'],
  collect(state, ctx: TickContext): DomainEffect[] {
    const tree = state as unknown as Tree
    const businesses = tree.finance?.businesses ?? {}
    const entries = Object.values(businesses)
    if (entries.length === 0) return []

    const rng = ctx.rng('finance')
    const map = tree.map ?? {}
    const next: Record<string, FinanceBiz> = {}
    let consecutiveLoss = 0

    for (const [key, b] of Object.entries(businesses)) {
      const economy = economyOf(b.cityId, map)
      // 收益率：繁荣加权（E-1.4 带宽 3–6%；≤40 滑入亏损）
      const rate = Math.min(Math.max(0.03 + ((economy - 40) / 20) * 0.03, RATE_FLOOR), 0.06)
      const noise = 1 + (rng.next() - 0.5) * 2 * VOLATILITY
      const profit = Math.round(b.capital * rate * noise * 100) / 100
      // 亏损侵蚀本金（厂子变小）；盈利不动本金（增资走命令层 —— 资源前置校验）
      const capital = profit < 0 ? Math.max(0, Math.round((b.capital + profit) * 100) / 100) : b.capital
      next[key] = { ...b, capital, lastProfit: profit }
      if (profit < 0) consecutiveLoss++
    }

    // 资金链忠诚度：连续亏损 −5/月（E-2.3 哗变公式接口：≤30 触发处境 —— R2 接线）
    let loyalty = tree.finance?.loyalty ?? 100
    if (consecutiveLoss > 0) loyalty -= 5 * Math.min(consecutiveLoss, 3)
    else loyalty += 2
    loyalty = Math.min(100, Math.max(0, Math.round(loyalty)))

    return [{ op: 'financePost', args: { businesses: next, loyalty } }]
  },
}
