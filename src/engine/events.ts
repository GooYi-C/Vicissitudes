// src/engine/events.ts — 模块 13：三来源同池加权抽取——硬事件+模板（0.5×）+街谈（monthly）。M-03 写域：_authority.pendingSituations（入队）、events/*。rng 走 ctx.rng('events')（B-02 salt 契约）。入队与结算分属两半（B-08）。骨架期零产出
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'

export const events: EngineModule = {
  id: 'events',
  phase: 'aftermath',
  cadence: 'monthly',
  reads: ['_authority.pendingSituations', 'events/*'],
  writes: ['_authority.pendingSituations', 'events/*'],
  collect(_state, _ctx: TickContext): DomainEffect[] {
    void _state
    void _ctx
    return []
  },
}
