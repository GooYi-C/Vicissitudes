// src/turn/monthRunner.ts — 世界推进月跑（SK-05：L3 调度 × L4 提交的编排点）
// EXEMPT:LAYER-004 见 §十六 L-07 豁免表（turn 管线组合，2026-09-15 登记）
// 住 L4 的理由：提交权 = TurnRunner（B-06 唯一提交点住 L4），月推进「收集→提交」
// 必然同时触 L3 调度器与 L4 TurnRunner —— 依 L-01 单向（L4 → L3 合法）住 L4。
// L3 world.ts 保留日期/投影纯函数与树校验；本文件是月推进的唯一入口（tickWorld）。

import { runMonth } from '../orchestration/scheduler'
import { monthIndexFrom } from '../validation/calendar'
import type { Tree } from '../validation/tree'
import type { Diagnostic } from '../engine/types'
import { TurnRunner } from './TurnRunner'

export interface WorldTickResult {
  ok: boolean
  state: Tree // 成功 = 新树；失败 = 原树（原子）
  callLog: string[] // 调用矩阵证据（MOD-5：每模块每月恰一次）
  writtenDomains: string[]
  diagnostics: Diagnostic[]
  error?: string
}

// 终月判定（M-05 full 管线月）：骨架期初值 = 每 12 个月（年关账月 12 月）。
// 真实口径（月关账/年关账边界）随 SK-06 日结规则落地校准。
export function isTerminalMonth(date: string): boolean {
  return date.endsWith('-12')
}

/** 世界推进一月：runMonth 收集（16 模块按双管线）→ TurnRunner 单次原子提交 */
export function tickWorld(state: Readonly<Tree>, opts?: { isTerminal?: boolean }): WorldTickResult {
  const date = state.world.date
  const monthIndex = monthIndexFrom(date)
  const isTerminal = opts?.isTerminal ?? isTerminalMonth(date)
  const run = runMonth({
    state: state as unknown as Readonly<Record<string, unknown>>,
    date,
    monthIndex,
    isTerminalMonth: isTerminal,
  })
  if (run.effects.length === 0) {
    // 零效果月（骨架期常态）：状态不变，但调用矩阵照记（幂等由调用矩阵承担）
    return { ok: true, state: state as Tree, callLog: run.callLog, writtenDomains: [], diagnostics: run.diagnostics }
  }
  const runner = new TurnRunner()
  const commit = runner.commit(run.effects, state)
  if (!commit.ok) {
    return {
      ok: false,
      state: state as Tree,
      callLog: run.callLog,
      writtenDomains: [],
      diagnostics: run.diagnostics,
      error: commit.error,
    }
  }
  return {
    ok: true,
    state: commit.state as Tree,
    callLog: run.callLog,
    writtenDomains: commit.writtenDomains,
    diagnostics: run.diagnostics,
  }
}
