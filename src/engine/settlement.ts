// src/engine/settlement.ts — 模块 5：按日折算收支（monthly）。M-03 写域：settlement/*。折算口径唯一（不重复计息）。骨架期零产出
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'

export const settlement: EngineModule = {
  id: 'settlement',
  phase: 'simulation',
  cadence: 'monthly',
  reads: ['settlement/*', 'world.date'],
  writes: ['settlement/*'],
  collect(_state, _ctx: TickContext): DomainEffect[] {
    void _state
    void _ctx
    return []
  },
}
