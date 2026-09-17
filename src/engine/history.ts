// src/engine/history.ts — 模块 2：史实 claim 落地（monthly；链①-1）
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// M-03 写域：_authority.territoryControl（三写者一通道 —— 与 factions/OccupationCommand
// 同一编译路径 claimTerritory：史实不是特权公民）、timeline/*（游标）。
//
// 区间查询：半开区间 (lastCursor, now]（§5.1 原文）—— lastCursor 是 timeline 游标
// （已落地史实的右端）。首尾相接不重不漏：
//   覆盖层条目 [from, to) 语义（D-07）；本模块把 (lastCursor, now] 内**首次生效**
//   （from ∈ 查询区间）的条目落账；from ≤ lastCursor 的条目已落过账（「不重」半边）。
//
// 数据面：L0-09 political-1936（1936 锚点 + 覆盖层，覆盖 [1936-01, 1937-01)）——
// 1936 年开局的世界随史实动（7 月两广事变广东易帜：zhiyuan → guomin）；
// 区间外月份零产出（1921–35 覆盖层皮肉期补 —— 数据缺口如实为空，非引擎问题）。
// monthly 是设计红线（M-10：跨月 replay 漏史实的风险在 cadence 里锁死）。

import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'
import type { Tree } from '../validation/tree'
import { advanceMonth } from '../validation/calendar'
import { baseTables } from '../data/loader'

// 覆盖层展开（表序稳定 —— loader 的 L0-09 冻结数组 → groups → polities 扁平化）
function overlayEntries(): { polityId: string; from: string; to: string; controller: string }[] {
  const out: { polityId: string; from: string; to: string; controller: string }[] = []
  for (const overlay of baseTables()['L0-09'] as { groups: { polities: { polityId: string; from: string; to: string; controller: string }[] }[] }[]) {
    for (const group of overlay.groups) {
      for (const p of group.polities) out.push({ polityId: p.polityId, from: p.from, to: p.to, controller: p.controller })
    }
  }
  return out
}

export const history: EngineModule = {
  id: 'history',
  phase: 'simulation',
  cadence: 'monthly',
  reads: ['_authority.territoryControl', 'world.date', 'timeline/*'],
  writes: ['_authority.territoryControl', 'timeline/*'],
  collect(state, _ctx: TickContext): DomainEffect[] {
    void _ctx
    const tree = state as unknown as Tree
    const date = tree.world?.date ?? ''
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) return []

    // 查询右端 = 次月首（temporal 的 advanceDate 在同批：本模块读到推进前日期，
    // 落账目标是「tick 后世界所处的月份」的史实）
    const nextMonth = advanceMonth(date)
    const nowISO = `${nextMonth}-01`
    const lastCursor = tree.timeline?.lastCursor ?? `${date}-01`
    if (nowISO <= lastCursor) return [] // 游标已越查询右端（防重放：不重不漏的右闭端）

    // (lastCursor, now] 内首次生效的条目 → claimTerritory（链①-1：与 factions/Occupation 同通道）
    const effects: DomainEffect[] = []
    for (const e of overlayEntries()) {
      if (e.from <= lastCursor || e.from > nowISO) continue
      effects.push({
        op: 'claimTerritory',
        args: { polityId: e.polityId, controller: e.controller, interval: { from: e.from, to: e.to } },
      })
    }

    // 游标推进（无论有无条目 —— 游标是查询进度，不是产出计数）
    effects.push({ op: 'timelinePost', args: { lastCursor: nowISO } })
    return effects
  },
}
