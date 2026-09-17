// src/engine/consistency.ts — 模块 14：人脉与记忆交叉一致（full；传播收敛不死循环）。
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// M-03 写域：relations/*。
//
// 交叉一致（R4-3 出口判据「无悬空引用」）：
//   记忆面 → 人脉面：memory.items[*].people 引用的每个人格 id 必须在 relations 有档；
//   缺档 → 自动注册 stub（status alive / tier 0 / propagated false）——引用以注册兜底，
//   不留悬空（RelationsPanel 反查与旧账点名依赖存在性）。
// 死亡/被捕传播（收敛口径；承 v1.0「死亡/被捕一致性传播」的骨架化）：
//   status ∈ {dead, arrested} 且未传播 → tier 落 0、propagated = true（一次到位；
//   再次运行零产出 = 收敛，不死循环）。人脉档本身是传播单点；幅度（关系网级联衰减等）
//   随内容期扩充，骨架先把「收敛 + 单点」的骨架立住。
// 幂等：无新引用且无待传播者 → 零产出。

import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'
import type { Tree, RelationPerson } from '../validation/tree'

export const consistency: EngineModule = {
  id: 'consistency',
  phase: 'aftermath',
  cadence: 'full',
  reads: ['relations/*', 'memory.items', 'world.date'],
  writes: ['relations/*'],
  collect(state, _ctx: TickContext): DomainEffect[] {
    void _ctx
    const tree = state as unknown as Tree
    const items = tree.memory?.items ?? {}
    const persons: Record<string, RelationPerson> = { ...(tree.relations?.persons ?? {}) }
    let changed = false

    // ① 注册兜底（记忆面 → 人脉面；无悬空引用）
    for (const item of Object.values(items)) {
      for (const pid of item.people ?? []) {
        if (!persons[pid]) {
          persons[pid] = { id: pid, status: 'alive', tier: 0, propagated: false }
          changed = true
        }
      }
    }

    // ② 死亡/被捕传播（收敛：一次到位 + propagated 标记；tier 落 0）
    for (const [pid, rec] of Object.entries(persons)) {
      if (rec.status !== 'alive' && !rec.propagated) {
        persons[pid] = { ...rec, tier: 0, propagated: true }
        changed = true
      }
    }

    if (!changed) return []
    return [{ op: 'relationsPost', args: { persons } }]
  },
}
