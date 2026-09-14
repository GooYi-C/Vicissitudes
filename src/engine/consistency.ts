// src/engine/consistency.ts — 模块 14：死亡/被捕一致性传播（full；传播收敛不死循环）。M-03 写域：relations/*。骨架期零产出
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'

export const consistency: EngineModule = {
  id: 'consistency',
  phase: 'aftermath',
  cadence: 'full',
  reads: ['relations/*'],
  writes: ['relations/*'],
  collect(_state, _ctx: TickContext): DomainEffect[] {
    void _state
    void _ctx
    return []
  },
}
