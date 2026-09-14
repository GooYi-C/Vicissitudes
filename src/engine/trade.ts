// src/engine/trade.ts — 模块 4：商路利润 + 饱和回压（monthly）。M-03 写域：trade/*。回压生而内置（非补丁）。骨架期零产出（R1 接 ctx.market 消费与饱和曲线）
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'

export const trade: EngineModule = {
  id: 'trade',
  phase: 'simulation',
  cadence: 'monthly',
  reads: ['trade/*', 'economy.commodities'],
  writes: ['trade/*'],
  collect(_state, _ctx: TickContext): DomainEffect[] {
    void _state
    void _ctx
    return []
  },
}
