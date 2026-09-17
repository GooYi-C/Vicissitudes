// src/engine/memory.ts — 模块 16：记忆规范化/衰减/归档（monthly；链③-1 管家——从不创造内容）
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// M-03 写域：memory.items、memories 索引。无内容创造权（保底在 resolves、补写在 TurnRunner）。
//
// 管家职责（§7.3 月度 tick）：
//   ① 规范化：补 id（缺 id 条目拒收 —— append-only 链的 id 是合并去重键）、去重（同 id 只保首条）
//   ② 衰减：按月龄（importance 越低越快 —— §7.4 衰减曲线）；pinned 豁免
//   ③ 归档：importance 衰减到 0 的条目 archived（不召回但可翻 —— 永不删除，事实不灭）
//   ④ 孤儿清理：order 索引指向不存在 item 的条目剔除（索引与本体一致）
// content 不可改（append-only —— U-05#4 同源）：维护只动 importance/pinned/archived 元数据。
//
// 数值三问（衰减曲线）：
// - 半衰月数 = importance × 6（importance 9 → 54 月 ≈ 4.5 年；importance 1 → 6 月）
//   依据：E-0.1 单局 60–120 月 —— 重要记忆（≥7）活过一局，琐事（≤3）半年淡忘；
//   复核点：§7.8-1 规则召回非空 + 老档翻阅体验
// - 衰减步长 1/月（连续线性 —— 离散树差分好断言）；pinned/archived 豁免
// - 归档线 0（importance 归零即归档；不删除 —— RelationsPanel 反查与旧账点名依赖存在性）

import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'
import type { Tree, MemoryItemTree } from '../validation/tree'

const DECAY_PER_MONTH = 1
const HALF_LIFE_FACTOR = 6 // importance × 6 = 半衰月数（见头注数值三问）

function decayed(item: MemoryItemTree, monthIndex: number): MemoryItemTree {
  if (item.pinned || item.archived) return item // 钉住/已归档豁免
  const age = Math.max(0, monthIndex - item.monthIndex)
  const halfLife = item.importance * HALF_LIFE_FACTOR
  if (age === 0 || halfLife === 0) return item
  // 线性近似半衰：每过 halfLife 月降 importance 的一半（向上取整 —— 琐事先淡）
  const loss = Math.ceil((age / halfLife) * (item.importance / 2)) * DECAY_PER_MONTH / Math.max(1, Math.ceil(age / halfLife))
  const importance = Math.max(0, item.importance - Math.max(1, Math.floor(loss)))
  return { ...item, importance, archived: importance <= 0 }
}

export const memory: EngineModule = {
  id: 'memory',
  phase: 'aftermath',
  cadence: 'monthly',
  reads: ['memory.items'],
  writes: ['memory.items'],
  collect(state, ctx: TickContext): DomainEffect[] {
    const tree = state as unknown as Tree
    const book = tree.memory ?? { items: {}, order: [] }
    const items = book.items ?? {}
    const ids = Object.keys(items)
    if (ids.length === 0 && book.order.length === 0) return []

    // ① 规范化 + ② 衰减 + ③ 归档（一次遍历；同 id 只保首条 —— order 首现优先）
    const seen = new Set<string>()
    const nextItems: Record<string, MemoryItemTree> = {}
    for (const id of book.order) {
      const item = items[id]
      if (!item || seen.has(id)) continue // 孤儿/重复剔除
      seen.add(id)
      nextItems[id] = decayed(item, ctx.monthIndex)
    }
    // order 未覆盖的 items（防御性：索引起点为空时按 items 键序补录 —— 字典序稳定）
    for (const id of ids.sort()) {
      if (!seen.has(id)) {
        seen.add(id)
        nextItems[id] = decayed(items[id], ctx.monthIndex)
      }
    }

    // 无变化 → 零产出（管家幂等：新入条目 age=0 不衰减，重复维护不产 ops）
    let changed = false
    for (const id of Object.keys(nextItems)) {
      const a = items[id] as unknown as Record<string, unknown> | undefined
      const b = nextItems[id] as unknown as Record<string, unknown>
      if (!a || a.importance !== b.importance || a.archived !== b.archived) { changed = true; break }
    }
    if (!changed && Object.keys(nextItems).length === Object.keys(items).length) return []

    // ④ 索引重建（与 items 一致；追加序保原序 —— append-only 的时序面）
    const order = [...book.order.filter((id) => id in nextItems), ...Object.keys(nextItems).filter((id) => !book.order.includes(id)).sort()]
    return [{
      op: 'memoryMaintain',
      args: { items: nextItems, order }, // order 随载荷（追加序时序面 —— 编译器整域落账）
    }]
  },
}
