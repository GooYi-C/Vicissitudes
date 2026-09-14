// src/engine/factions.ts — 模块 9：加权效用决策、占领生命周期、预警+撤离窗口（monthly；链①-2）。M-03 写域：_authority.territoryControl、forces/*、war/*。邻接输入来自 L0 邻接数据。骨架期零产出
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'

export const factions: EngineModule = {
  id: 'factions',
  phase: 'simulation',
  cadence: 'monthly',
  reads: ['_authority.territoryControl', 'forces/*', 'war/*'],
  writes: ['_authority.territoryControl', 'forces/*', 'war/*'],
  collect(_state, _ctx: TickContext): DomainEffect[] {
    void _state
    void _ctx
    return []
  },
}
