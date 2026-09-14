// src/engine/market.ts — 模块 3：十城特产 + 景气 + 战时系数定价（monthly；B-03 唯一发布）
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// M-03 写域：economy.commodities（Tier 0 —— market 独占）。
// 产出 MarketResult 由编排器发布进 ctx.market（B-03：无第二获取路径）。
import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'

// 行情表写入的受限通道（骨架期：从 ctx 读旧价 → 漂移 → modifyCommodity 效果。
// 受限指令集在 R1 扩 marketEffect op；当前经 situationEnqueue/无 —— 用直接效果面留 R1）
export const market: EngineModule = {
  id: 'market',
  phase: 'simulation',
  cadence: 'monthly',
  reads: ['economy.commodities', 'world.date'],
  writes: ['economy.commodities'],
  collect(state, ctx: TickContext): DomainEffect[] {
    // 骨架期：行情表为空（SK-06 落 16 表后接十城特产定价）。
    // 确定性口径已立：一切随机走 ctx.rng('market')（B-02 —— salt 稳定，抽样次序属契约）。
    const rng = ctx.rng('market')
    void rng.next() // 派生序列占位（R1 接真实定价后此调用即序列一部分）
    void state
    return []
  },
}
