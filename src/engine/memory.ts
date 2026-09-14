// src/engine/memory.ts — 模块 16：记忆规范化/衰减/归档（monthly；链③-1 管家——从不创造内容）。M-03 写域：memory.items、memories 索引。无内容创造权（保底在 resolves、补写在 TurnRunner）。骨架期零产出
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'

export const memory: EngineModule = {
  id: 'memory',
  phase: 'aftermath',
  cadence: 'monthly',
  reads: ['memory.items'],
  writes: ['memory.items'],
  collect(_state, _ctx: TickContext): DomainEffect[] {
    void _state
    void _ctx
    return []
  },
}
