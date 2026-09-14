// src/engine/worldtick.ts — 模块 8：月度漂移——map/* 六维、人口、季节粮价（monthly；链②-2 后于 fiscal）。M-03 写域：map/* 六维、人口、季节粮价。事件效果不直写（经 B-08 cityEffect 指令映射）。骨架期零产出
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'

export const worldtick: EngineModule = {
  id: 'worldtick',
  phase: 'simulation',
  cadence: 'monthly',
  reads: ['map/*', 'economy.commodities'],
  writes: ['map/*'],
  collect(_state, _ctx: TickContext): DomainEffect[] {
    void _state
    void _ctx
    return []
  },
}
