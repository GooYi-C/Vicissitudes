// src/engine/crisis.ts — 模块 15：破产/哗变/失城/死亡检测（full；只检测不改写其它模块域——触发经链/命令）。M-03 写域：crisis/*。骨架期零产出
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'

export const crisis: EngineModule = {
  id: 'crisis',
  phase: 'aftermath',
  cadence: 'full',
  reads: ['career/*', 'forces/*', 'map/*'],
  writes: ['crisis/*'],
  collect(_state, _ctx: TickContext): DomainEffect[] {
    void _state
    void _ctx
    return []
  },
}
