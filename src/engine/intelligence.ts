// src/engine/intelligence.ts — 模块 11：四级情报迷雾、过期衰减（full）。M-03 写域：_authority.intelligenceObservations。侦察写入走命令层（模块只写 observations 域）。骨架期零产出
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'

export const intelligence: EngineModule = {
  id: 'intelligence',
  phase: 'simulation',
  cadence: 'full',
  reads: ['_authority.intelligenceObservations'],
  writes: ['_authority.intelligenceObservations'],
  collect(_state, _ctx: TickContext): DomainEffect[] {
    void _state
    void _ctx
    return []
  },
}
