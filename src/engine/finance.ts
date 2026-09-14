// src/engine/finance.ts — 模块 6：实业/账本/资金链忠诚度（monthly）。M-03 写域：finance/*。账本与实业双向可对账。骨架期零产出
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'

export const finance: EngineModule = {
  id: 'finance',
  phase: 'simulation',
  cadence: 'monthly',
  reads: ['finance/*', 'settlement/*'],
  writes: ['finance/*'],
  collect(_state, _ctx: TickContext): DomainEffect[] {
    void _state
    void _ctx
    return []
  },
}
