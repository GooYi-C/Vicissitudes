// src/gameCommands/scout.ts — ScoutCommand（R3-3；侦察写入走命令层 —— M-10 intelligence）
// 命令层纯函数：(输入, state) → DomainEffect[]。
// 四级情报迷雾：0 无情报 / 1 风闻 / 2 驻军规模 / 3 城防部署（§二十二 IntelPanel 消费）
// 情报时效 3 月（E-2.4 眼线口径）；侦察写入 _authority.intelligenceObservations
// （M-03 双写者：intelligence 模块管衰减，命令层管写入 —— 各管一半）。
// E-2.4 数值：眼线月费 2–5/眼线（银带）；侦察本身免费一次（眼线 = 持续订阅，R4 接线）。

import type { DomainEffect } from '../validation/effects'
import type { Tree } from '../validation/tree'
import { cities } from '../data/cities'
import { buildAdjacency } from '../engine/adjacency'

export const INTEL_EXPIRY_MONTHS = 3 // E-2.4：情报时效 3 月（四级迷雾衰减窗）

export interface ScoutInput {
  readonly cityId: string
  /** 玩家驻地（邻接判定：侦察半径 ≤1 跳 —— 远城不派即知） */
  readonly fromCityId: string
}

export type ScoutResult =
  | { ok: true; effects: DomainEffect[]; level: number }
  | { ok: false; reason: 'no-city' | 'too-far'; message: string }

/** 侦察命令（纯函数）：邻接内城市 → 2 级情报观察写入（expiresAt = +3 月） */
export function scoutCommand(input: ScoutInput, tree: Readonly<Tree>): ScoutResult {
  const city = cities.find((c) => c.id === input.cityId)
  const from = cities.find((c) => c.id === input.fromCityId)
  if (!city || !from) return { ok: false, reason: 'no-city', message: '未知城市' }

  // 邻接判定：侦察半径 1 跳（同城 = 0 也合法 —— 摸自己脚下的情报）
  const adj = buildAdjacency()
  const hops = adj.hopDistance(input.fromCityId, input.cityId)
  if (hops > 1) return { ok: false, reason: 'too-far', message: `${city.name} 距 ${from.name} ${hops} 跳 —— 侦察半径只到邻城` }

  // 观察写入（id 稳定：scout-{cityId}-{monthIndex}；同月重侦察幂等覆盖）
  const monthIndex = monthOf(tree)
  const expiresAt = isoPlusMonths(tree.world.date, INTEL_EXPIRY_MONTHS)
  const observation = {
    id: `scout-${input.cityId}-${monthIndex}`,
    regionId: input.cityId,
    level: 2, // 侦察动作给到 2 级（驻军规模 —— Occupation 前置门槛）
    observedAt: `${tree.world.date}-01`,
    expiresAt,
  }

  // 观察表全量落账（命令层写 observations；intelligence 模块 R4 管过期衰减）
  const existing = tree._authority.intelligenceObservations.observations
    .filter((o) => o.regionId !== input.cityId || o.expiresAt > `${tree.world.date}-01`) // 去旧保未过期
    .concat([observation])

  return {
    ok: true,
    level: observation.level,
    effects: [{ op: 'intelPost', args: { observations: existing } }],
  }
}

function monthOf(tree: Readonly<Tree>): number {
  const y = Number(tree.world.date.slice(0, 4))
  const m = Number(tree.world.date.slice(5, 7))
  return (y - 1921) * 12 + (m - 1)
}

function isoPlusMonths(date: string, months: number): string {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  const total = y * 12 + (m - 1) + months
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}
