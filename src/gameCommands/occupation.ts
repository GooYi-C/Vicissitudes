// src/gameCommands/occupation.ts — OccupationCommand（R3-3；链①第三写者 —— M-03）
// 命令层纯函数：(输入, state) → DomainEffect[]，不读 store、不发请求、不看时钟。
// E-3.3 玩家占领公式（开局静态版）：
//   前置：正规营伍(≥100) ∧ 邻接(claim 层控制区接触) ∧ 情报(目标城 ≥2 级)
//   胜负：玩家兵力 ≥ 守军 × 1.2 → 攻坚可行（旧公式继承）
//   伤亡 = 守军 × 0.15～0.3（守军防御/100 加权）
//   天数 = 7 + 守军/50（围城到破城 —— 命令返回预算给叙事层，不进树）
// 开战必经玩家确认（LL-09）：本命令由玩家点击触发 —— 确认门在 UI 侧，命令本身即确认后的动作。
// 链①：与 history/factions 同一编译路径 claimTerritory —— 史实不是特权公民，玩家也不是。

import type { DomainEffect } from '../validation/effects'
import type { Tree } from '../validation/tree'
import { buildAdjacency } from '../engine/adjacency'
import { cities } from '../data/cities'
// 城级控制权查询住 L1（被 L2/L5 共用 —— 两条路径同口径，不再各有副本）
import { activeControllerForCity } from '../validation/tree'

export const OCCUPATION_ADVANTAGE = 1.2 // E-3.3 旧公式继承
export const MIN_FORCES = 100 // 正规营伍门槛（E-2.3 三级台阶的第三级）

export interface OccupationInput {
  readonly cityId: string
  readonly playerForces: number // 玩家兵力（career.forces —— 命令层读自树外玩家域，UI 传入）
}

export type OccupationResult =
  | { ok: true; effects: DomainEffect[]; casualties: number; days: number; garrison: number }
  | { ok: false; reason: 'no-city' | 'no-forces' | 'no-adjacency' | 'no-intel' | 'lost'; message: string }

/** 占领判定（纯函数；E-3.3 全公式） */
export function occupationCommand(input: OccupationInput, tree: Readonly<Tree>): OccupationResult {
  const city = cities.find((c) => c.id === input.cityId)
  if (!city) return { ok: false, reason: 'no-city', message: `未知城市 ${input.cityId}` }

  // 前置①：正规营伍 ≥100
  if (input.playerForces < MIN_FORCES) {
    return { ok: false, reason: 'no-forces', message: `兵力 ${input.playerForces} 不足正规营伍门槛（${MIN_FORCES}）—— 民团攻不动省城` }
  }

  // 前置②：邻接（claim 层控制区接触 —— 玩家控制城与目标城邻接）
  const adj = buildAdjacency()
  // 玩家控制城 = claim 层 per-city 查询（activeControllerForCity —— 与本文件守军口径同源）
  const playerCities = cities.filter((c) => activeControllerForCity(tree, c.id, tree.world.date) === 'player')
  // R3 骨架：玩家无控制城即无邻接资格（亮出邻接前置，不静默放行）
  const hasAdjacency = playerCities.some((pc) => adj.hopDistance(pc.id, input.cityId) === 1)
  if (!hasAdjacency) {
    return { ok: false, reason: 'no-adjacency', message: '目标城不与你的控制区接壤（邻接前置不满足）' }
  }

  // 前置③：情报（目标城 ≥2 级 —— 情报观察在 _authority.intelligenceObservations）
  const intel = tree._authority.intelligenceObservations.observations.find((o) => o.regionId === input.cityId)
  if (!intel || intel.level < 2) {
    return { ok: false, reason: 'no-intel', message: `对 ${city.name} 的情报不足 2 级（当前 ${intel?.level ?? 0}）—— 盲攻不可行` }
  }

  // 守军（势力兵力均摊口径 —— 与 factions.garrisonOf 同源；玩家/无主城守军 = 民团基线）
  const controller = activeControllerForCity(tree, input.cityId, tree.world.date)
  const garrison = garrisonFor(tree, controller)
  if (input.playerForces < garrison * OCCUPATION_ADVANTAGE) {
    return { ok: false, reason: 'lost', message: `兵力 ${input.playerForces} 对守军 ${garrison} 不满足 1.2 优势比 —— 攻坚不可行` }
  }

  // 胜负通过 → claim 落账（链①通道）+ 伤亡/天数（叙事层消费，不进树）
  const casualties = Math.round(garrison * (0.15 + (garrison / 100) * 0.05))
  const days = 7 + Math.floor(garrison / 50)
  const iso = `${tree.world.date}-01`
  return {
    ok: true,
    effects: [{
      op: 'claimTerritory',
      args: { polityId: city.provinceId, controller: 'player', interval: { from: iso, to: '1950-01-01' } },
    }],
    casualties,
    days,
    garrison,
  }
}

// ── 与 factions 同口径的守军/控制权投影（控制权查询 = L1 tree.ts 的城级口径
// activeControllerForCity，不在此复制；factions 模块不可被 L5 import（L-01 越层），
// 故守军公式仍在本层按同一口径重算）────────────────────────────────
function garrisonFor(tree: Readonly<Tree>, controller: string | null): number {
  if (!controller || controller === 'none') return 150 // 无主城：民团基线（E-2.3 台阶中位）
  const strength = tree.forces.strength[controller] ?? 300
  const controlled = cities.filter((c) => activeControllerForCity(tree, c.id, tree.world.date) === controller).length
  return Math.floor(strength / Math.max(1, controlled))
}
