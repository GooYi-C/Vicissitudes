// src/engine/labor.ts — 模块 10：劳动力投影（full；幂等纯投影）。M-03 写域：_computed.labor。仅终月跑；非终月零写入。骨架期零产出
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'

export const labor: EngineModule = {
  id: 'labor',
  phase: 'simulation',
  cadence: 'full',
  reads: ['_computed.labor'],
  writes: ['_computed.labor'],
  collect(_state, _ctx: TickContext): DomainEffect[] {
    void _state
    void _ctx
    return []
  },
}
