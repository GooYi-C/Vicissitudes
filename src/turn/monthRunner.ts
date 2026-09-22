// src/turn/monthRunner.ts — 世界推进月跑（SK-05：L3 调度 × L4 提交的编排点）
// EXEMPT:LAYER-004 见 §十六 L-07 豁免表（turn 管线组合，2026-09-15 登记）
// 住 L4 的理由：提交权 = TurnRunner（B-06 唯一提交点住 L4），月推进「收集→提交」
// 必然同时触 L3 调度器与 L4 TurnRunner —— 依 L-01 单向（L4 → L3 合法）住 L4。
// L3 world.ts 保留日期/投影纯函数与树校验；本文件是月推进的唯一入口（tickWorld）。

import { runMonth } from '../orchestration/scheduler'
import { monthIndexFrom } from '../validation/calendar'
import type { Tree } from '../validation/tree'
import type { Diagnostic } from '../engine/types'
import type { DomainEffect } from '../validation/effects'
import { duePromiseSituations, type DuePromiseResult } from '../engine/events'
import { TurnRunner } from './TurnRunner'

export interface WorldTickResult {
  ok: boolean
  state: Tree // 成功 = 新树；失败 = 原树（原子）
  callLog: string[] // 调用矩阵证据（MOD-5：每模块每月恰一次）
  writtenDomains: string[]
  diagnostics: Diagnostic[]
  error?: string
  effects?: DomainEffect[] // 本次提交的效果批（S-08 日结 facts 的唯一来源；由组合根喂给 dayClose）
  dueInjected?: string[] // S-10 本轮机检注入的处境 key（证据面）
  dueNotes?: string[] // S-10 降级注记（dueDate 缺失/不可解析 —— 不猜日期）
}

export interface WorldTickOptions {
  isTerminal?: boolean
  // S-10 机检台账来源（L7 SaveRecord.dayLogs 的只读投影）：L4 不引 L7，故以结构类型入参
  dayLogs?: readonly { date: string; facts: readonly unknown[] }[]
}

// 终月判定（M-05 full 管线月）。
// 〔SK-05 注释预告的校准 —— 本批落码〕占位语义勘正：`endsWith('-12')` 判的是**年关账月**，
// 不是「唯一的关账月」。本批起月关账每月一次（src/turn/monthClose.ts），由组合根在日结之后调用；
// 年关账（full 管线）保留 12 月 —— 故本函数语义不变（回归面零改动），校准落在「月关账 ≠ 终月」这一分层上。
export function isTerminalMonth(date: string): boolean {
  return date.endsWith('-12')
}

/** 世界推进一月：runMonth 收集（16 模块按双管线）→ S-10 台账机检并批 → TurnRunner 单次原子提交 */
export function tickWorld(state: Readonly<Tree>, opts?: WorldTickOptions): WorldTickResult {
  const date = state.world.date
  const monthIndex = monthIndexFrom(date)
  const isTerminal = opts?.isTerminal ?? isTerminalMonth(date)
  const run = runMonth({
    state: state as unknown as Readonly<Record<string, unknown>>,
    date,
    monthIndex,
    isTerminalMonth: isTerminal,
  })

  // S-10 约定到期（L2 纯函数 duePromiseSituations；此处只做「并批」——
  // 台账驱动直入：不占合池配额（≤2 / 模板 ≤1），与月推进同批单次提交，B-06 不破）
  const ledger = state.events ?? { eventCD: {}, resolvedEvents: [] }
  const due = duePromiseSituations({
    date,
    monthIndex,
    dayLogs: opts?.dayLogs ?? [],
    queue: state._authority?.pendingSituations?.queue ?? {},
    eventCD: ledger.eventCD,
    resolvedEvents: ledger.resolvedEvents,
  })
  const effects = mergeDueEffects(run.effects, due, ledger)

  if (effects.length === 0) {
    // 零效果月（骨架期常态）：状态不变，但调用矩阵照记（幂等由调用矩阵承担）
    return {
      ok: true,
      state: state as Tree,
      callLog: run.callLog,
      writtenDomains: [],
      diagnostics: run.diagnostics,
      effects: [],
      dueInjected: due.injectedKeys,
      dueNotes: due.notes,
    }
  }
  const runner = new TurnRunner()
  const commit = runner.commit(effects, state)
  if (!commit.ok) {
    return {
      ok: false,
      state: state as Tree,
      callLog: run.callLog,
      writtenDomains: [],
      diagnostics: run.diagnostics,
      error: commit.error,
      effects,
      dueInjected: due.injectedKeys,
      dueNotes: due.notes,
    }
  }
  return {
    ok: true,
    state: commit.state as Tree,
    callLog: run.callLog,
    writtenDomains: commit.writtenDomains,
    diagnostics: run.diagnostics,
    effects,
    dueInjected: due.injectedKeys,
    dueNotes: due.notes,
  }
}

// 并批：机检新增的台账键必须并入**既有那条** eventsPost（compiler 侧是全量 replace，
// 第二条 replace 会覆盖掉事件冷却表 → 台账互吃）；无 eventsPost 时补一条（保留既有 eventCD）。
function mergeDueEffects(
  effects: readonly DomainEffect[],
  due: DuePromiseResult,
  ledger: { eventCD: Record<string, string>; resolvedEvents: readonly unknown[] },
): DomainEffect[] {
  if (due.injectedKeys.length === 0) return [...effects]
  const merged: DomainEffect[] = [...effects, ...due.effects]
  const idx = merged.findIndex((e) => e.op === 'eventsPost')
  if (idx >= 0) {
    const post = merged[idx]
    const baseCD = (post.args.eventCD ?? {}) as Record<string, string>
    merged[idx] = {
      op: 'eventsPost',
      args: {
        eventCD: { ...baseCD, ...due.ledgerAdditions },
        resolvedEvents: (post.args.resolvedEvents as readonly unknown[] | undefined) ?? ledger.resolvedEvents,
      },
    }
  } else {
    merged.push({
      op: 'eventsPost',
      args: { eventCD: { ...ledger.eventCD, ...due.ledgerAdditions }, resolvedEvents: ledger.resolvedEvents },
    })
  }
  return merged
}
