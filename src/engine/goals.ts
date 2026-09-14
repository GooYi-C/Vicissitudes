// src/engine/goals.ts — 模块 12：月度目标（monthly；aftermath 相位首位）。M-03 写域：goals/*。骨架期零产出
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'

export const goals: EngineModule = {
  id: 'goals',
  phase: 'aftermath',
  cadence: 'monthly',
  reads: ['goals/*'],
  writes: ['goals/*'],
  collect(_state, _ctx: TickContext): DomainEffect[] {
    void _state
    void _ctx
    return []
  },
}
