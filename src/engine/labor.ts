// src/engine/labor.ts — 模块 10：劳动力投影（full；幂等纯投影）。M-03 写域：_computed.labor。
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// full 仅终月跑（M-05 调度面保证——R4-1 出口判据「非终月零写入」由调用矩阵与幂等双侧锁）。
//
// 投影口径（骨架）：manpower = floor(人口维 × MANPOWER_FACTOR)。
//   人口维是 [0,100] 指数的人口面代表量（L0-04 同口径）；×10 把指数投回「营」量级（百位带，
//   与 E-2.3 兵力台阶量纲同带的预备口径——兵源/实业用工面复用此投影时再校准）。
//   取值：初值 10；依据：量纲带对齐；复核点：E-4.4 史实锚定校准。
// 幂等纯投影：输入（map 人口维 + world.date）不变 → 输出逐位不变；投影与现状全等 → 零产出。
// 数据缺口如实地留空：map 未播种（首月前）→ 空投影零写入，不造假数。

import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'
import type { Tree, LaborCity } from '../validation/tree'

export const MANPOWER_FACTOR = 10 // 人口维 → 可动员劳力（初值——复核点 E-4.4）

export const labor: EngineModule = {
  id: 'labor',
  phase: 'simulation',
  cadence: 'full',
  reads: ['map/*', 'world.date', '_computed.labor'],
  writes: ['_computed.labor'],
  collect(state, _ctx: TickContext): DomainEffect[] {
    void _ctx
    const tree = state as unknown as Tree
    const date = tree.world?.date ?? ''
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) return []

    const next: Record<string, LaborCity> = {}
    for (const [cityId, dims] of Object.entries(tree.map ?? {})) {
      next[cityId] = { manpower: Math.floor(dims.population * MANPOWER_FACTOR), asOfMonth: date }
    }

    // 幂等：与现状全等 → 零写入（终月重复跑不产 ops；键序稳定——map 播种序即城市表序）
    const prev = tree._computed?.labor ?? {}
    if (JSON.stringify(prev) === JSON.stringify(next)) return []
    return [{ op: 'laborPost', args: { labor: next } }]
  },
}
