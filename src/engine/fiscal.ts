// src/engine/fiscal.ts — 模块 7：控制城税收；军费→治安（monthly；链②-1 先于 worldtick 写 map/*/security）。M-03 写域：fiscal/*、map/*/security。骨架期零产出
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'

export const fiscal: EngineModule = {
  id: 'fiscal',
  phase: 'simulation',
  cadence: 'monthly',
  reads: ['fiscal/*', 'map/*'],
  writes: ['fiscal/*', 'map/*'],
  collect(_state, _ctx: TickContext): DomainEffect[] {
    void _state
    void _ctx
    return []
  },
}
