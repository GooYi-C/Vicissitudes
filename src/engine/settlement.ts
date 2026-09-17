// src/engine/settlement.ts — 模块 5：按日折算收支（monthly）。M-03 写域：settlement/*。
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// 折算口径唯一（E-0.2：按日折算统一 settlement days/30，不出现第二个折算口径）。
// 生而 effect-only：月度过账 = 商路净利（trade 口径，经 routeEconomics 同公式）
// ＋ 控城净收益（fiscal 口径读上月落账）＋ 实业净利（finance 口径读上月落账）。
// 三处收支在此**汇总成一笔月度过账** —— 账本三件套的「收支」半边（§9.6）。
//
// 现金口径：settlement.cash 是玩家账本唯一现金（E-1.2 结余带落此）。
// 上月口径说明：settlement 在相位序中先于 finance/fiscal，本月读到的是它们上月落的
// lastProfit/lastRevenue（M-02-3 读序纪律：settlement 不读 finance/fiscal 写域 →
// 消费的是「上月账」快照，这正是月度过账的语义：上月经营，本月入账）。

import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'
import type { Tree } from '../validation/tree'
import { routeEconomics } from './trade'

export const settlement: EngineModule = {
  id: 'settlement',
  phase: 'simulation',
  cadence: 'monthly',
  // 读 trade/* 消费路线账（本月饱和度已由 trade 落账 —— 同相位前位，合法）
  reads: ['settlement/*', 'trade/*', 'world.date'],
  writes: ['settlement/*'],
  collect(state, ctx: TickContext): DomainEffect[] {
    const tree = state as unknown as Tree
    const month = tree.world?.date ?? ''
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return []

    let delta = 0
    const parts: string[] = []

    // ① 商路净利（trade 口径：routeEconomics 与 UI 同公式 —— §9.6「口径一致」）
    const routes = Object.values(tree.trade?.routes ?? {})
    let routeNet = 0
    for (const r of routes) {
      if (r.state !== 'open') continue
      routeNet += routeEconomics(r, ctx.market).monthNet
    }
    if (routeNet !== 0) {
      delta += routeNet
      parts.push(`商路${routeNet >= 0 ? '净入' : '净出'} ${Math.abs(routeNet).toFixed(2)}`)
    }

    // ② 实业净利（上月落账的 lastProfit —— finance 本月稍后再写本月值）
    let bizNet = 0
    for (const b of Object.values(tree.finance?.businesses ?? {})) {
      const p = typeof b.lastProfit === 'number' && Number.isFinite(b.lastProfit) ? b.lastProfit : 0
      bizNet += p
    }
    if (bizNet !== 0) {
      delta += bizNet
      parts.push(`实业${bizNet >= 0 ? '净入' : '净出'} ${Math.abs(bizNet).toFixed(2)}`)
    }

    // ③ 控城净收益（上月落账的 lastRevenue —— fiscal 同理）
    let cityNet = 0
    for (const f of Object.values(tree.fiscal?.cities ?? {})) {
      const rev = typeof f.lastRevenue === 'number' && Number.isFinite(f.lastRevenue) ? f.lastRevenue : 0
      cityNet += rev
    }
    if (cityNet !== 0) {
      delta += cityNet
      parts.push(`财政${cityNet >= 0 ? '净入' : '净出'} ${Math.abs(cityNet).toFixed(2)}`)
    }

    if (delta === 0 && parts.length === 0) return [] // 无经营活动：不过账（零流水不落档）
    const cash = (tree.settlement?.cash ?? 0) + delta
    return [{
      op: 'settlementPost',
      args: { month, amount: Math.round(delta * 100) / 100, cash: Math.round(cash * 100) / 100, what: parts.length > 0 ? parts.join('；') : '月度结转' },
    }]
  },
}
