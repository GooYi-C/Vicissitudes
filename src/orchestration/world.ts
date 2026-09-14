// src/orchestration/world.ts — L3 编排：authority 投影 + 树校验（纯函数位）
// SK-05 层间修正后分工：月推进「收集→提交」住 L4 turn/monthRunner.ts
// （提交权 = TurnRunner 住 L4，依 L-01 单向 L4→L3 编排调度器）；
// 本文件保留：canonical 日期 re-export（L1 calendar）、authority 根只读投影、
// 树校验入口与深冻结 —— 全部纯函数，无调度无提交。
// canonical 日期唯一：全仓日期只存在 Tree.world.date 此一处。

import type { Tree } from '../validation/tree'
import { TreeSchema } from '../validation/tree'

// 日期换算纯函数住 L1（L2 temporal 与 L4 monthRunner 共用 —— L-05 纯工具住被依赖层）
export { monthIndexFrom, dateFromMonthIndex, advanceMonth, EPOCH_YEAR, EPOCH_MONTH } from '../validation/calendar'

// authority 根的只读投影（查询函数；写入走 L4 编译通道）
// activeOn（claim 层按当前日期查询投影；L0-04 升格：城市控制者不设时代默认字段，唯一事实源 = claim 层）
export function activeController(
  tree: Pick<Tree, '_authority'>,
  date: string,
): string | null {
  const iso = date.length === 7 ? `${date}-01` : date
  let active: string | null = null
  for (const claim of tree._authority.territoryControl.claims) {
    if (claim.interval.from <= iso && iso < claim.interval.to) active = claim.controller
  }
  return active // 空档 → null（与「无主」不可区分 —— 由合并器四守卫防，D-08）
}

// 深冻结（D-06 同款纪律：运行期对树的写入即抛错）
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      deepFreeze((obj as Record<string, unknown>)[key])
    }
    Object.freeze(obj)
  }
  return obj
}

// 校验入口（供 TurnRunner/存档层复用；越界形状即抛）
export function validateTree(candidate: unknown): Tree {
  return TreeSchema.parse(candidate)
}
