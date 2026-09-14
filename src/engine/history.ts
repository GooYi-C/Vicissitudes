// src/engine/history.ts — 模块 2：史实 claim 落地（monthly；链①-1）
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// M-03 写域：_authority.territoryControl（三写者一通道 —— 与 factions/OccupationCommand 同一编译路径）
// 半开区间 (lastCursor, now] 查询 → claimTerritory；区间半开首尾相接不重不漏。
// SK-05 骨架：读 L0-09 political（SK-06 数据落地后接通）；当前消费树内已有 claims 做过期检查。
import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'

export const history: EngineModule = {
  id: 'history',
  phase: 'simulation',
  cadence: 'monthly',
  reads: ['_authority.territoryControl', 'world.date'],
  writes: ['_authority.territoryControl'],
  collect(state, ctx: TickContext): DomainEffect[] {
    // 骨架期：数据表未落（SK-06）；零产出 = 不添乱。L0-09 接通后此处做 (lastCursor, now] 查询。
    // 确定性：monthIndex 参与 rng 派生口径已在 ctx；本模块当前无随机需求。
    void state
    void ctx
    return []
  },
}
