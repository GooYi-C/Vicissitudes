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
// activeController 本体住 L1 tree.ts（L2 引擎消费的纯投影 —— L-05 归属；SK-05 层间
// 修正 R1 复核：fiscal 需消费 → 本体下沉 L1，此处 re-export 保持既有引用面）
export { activeController } from '../validation/tree'

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
