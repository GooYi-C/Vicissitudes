// src/orchestration/world.ts — L3 编排（SK-03 起步位：canonical 日期 + authority 三根投影）
// 完整职责（双管线调度/提交权/调用矩阵）在 SK-05 落地（§二十八 SK-03 范围外）。
// canonical 日期唯一（SK-03 出口判据）：全仓日期只存在 Tree.world.date 此一处，
// 引擎与状态层不得出现 new Date()/Date.now()（L-06 no-restricted-globals 拦截）。

import type { GameDate, ReadonlyTree, Tree } from '../validation/tree'
import { TreeSchema } from '../validation/tree'

// 月序号（monthIndex）：1921-01 = 0；rng 派生与审计共用（B-01）
export const EPOCH_YEAR = 1921
export const EPOCH_MONTH = 1 // 1921-01

export function monthIndexFrom(date: GameDate): number {
  const [y, m] = date.split('-').map(Number)
  return (y - EPOCH_YEAR) * 12 + (m - EPOCH_MONTH)
}

export function dateFromMonthIndex(idx: number): GameDate {
  const y = EPOCH_YEAR + Math.floor(idx / 12)
  const m = ((idx % 12) + 12) % 12 + 1
  return `${y}-${String(m).padStart(2, '0')}` as GameDate
}

// canonical 日期唯一推进（temporal 模块经此函数产出推进 op；M-03 行 world.date）
// 纯函数：同输入同输出，无 Date 依赖（B-02）
export function advanceMonth(date: GameDate): GameDate {
  return dateFromMonthIndex(monthIndexFrom(date) + 1)
}

// authority 根的只读投影（查询函数；写入走 L4 编译通道 —— 本文件在 SK-03 不写树）
// activeOn（claim 层按当前日期查询投影；L0-04 升格：城市控制者不设时代默认字段，唯一事实源 = claim 层）
export function activeController(
  tree: Pick<ReadonlyTree, '_authority'>,
  date: string,
): string | null {
  const iso = date.length === 7 ? `${date}-01` : date
  let active: string | null = null
  for (const claim of tree._authority.territoryControl.claims) {
    if (claim.interval.from <= iso && iso < claim.interval.to) active = claim.controller
  }
  return active // 空档 → null（与「无主」不可区分 —— 由合并器四守卫防（D-08））
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
