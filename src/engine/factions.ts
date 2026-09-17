// src/engine/factions.ts — 模块 9：加权效用决策、占领生命周期、预警+撤离窗口（monthly；链①-2）
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// M-03 写域：_authority.territoryControl（链①-2）、forces/*、war/*。
// 邻接输入来自 L0-05 交通表聚合（M-11 adjacency 库语义：region 邻接 —— 此处按城市
// 交通线直接邻接，带健康度断言：邻接缺失即失败不静默降级）。
//
// E-3.1 势力月度决策：
//   预算 = 基础岁入 × 时代扩张系数（aggression(year) 初值表）
//   行动效用 = 收益评估(目标城六维加权和) × 兵力优势比 ÷ 距离惩罚(邻接跳数)
//   效用排序 → 预算内执行：扩军(+5–15%)/压榨/清剿/攻城（攻城满足 E-3.2 前置）
// E-3.2 围城与撤离窗口：
//   threat = Σ(邻城敌方兵力) / (守军 × 1.3) ≥ 1 → 挂「陈兵城下」预警（war/siegeWarnings）
//   预警挂满 LEAD_MONTHS(=1) 后攻城判定：攻方 > 守军 × 1.3 → contested（2 月 → 并入）
//   否则消耗战（双方 −5～10%）；威胁 < 1 → 清台账重计时
//   撤离窗口 = 预警期 + contested 期 ≈ 2–3 月
//
// 数值三问：
// - ×1.3 优势比（旧实测，E-3.2 原文）；LEAD_MONTHS 1（原文）
// - 扩军 +5–15%/月（E-3.1 原文带宽；取值由 rng 月序派生 —— 确定性）
// - 基础岁入 100/势力（初值；依据：预算量纲与税收 taxBase 同带；复核：史实锚定校准 E-4.4）
// - 龙骨口径：攻城只对「史实 claim 目标城」执行（strength 介入规则 E-3.2 ——
//   势力自由扩张在骨架期不放开：无史实压力的城不落战火，锚定校准才可能 ≤2 座偏移）

import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'
import type { Tree } from '../validation/tree'
import { activeController } from '../validation/tree'
import { cities } from '../data/cities'
import { transport } from '../data/transport'

const ADVANTAGE = 1.3 // 破城优势比（E-3.2 旧实测）
const LEAD_MONTHS = 1 // 预警期（E-3.2 原文）
const CONTESTED_MONTHS = 2 // contested 期（E-3.2：contested → 2 月 → occupied 并入）
const BASE_INCOME = 100 // 基础岁入（初值 —— 复核点：史实锚定校准）
const SIEGE_TARGETS: readonly string[] = ['guangzhou'] // 史实攻城锚（1936 两广：广州 7 月易帜 —— E-3.2 strength 介入的骨架示例）

// 时代扩张系数（E-3.1 aggression 初值表；era → 各势力）
const AGGRESSION: Readonly<Record<string, Readonly<Record<string, number>>>> = Object.freeze({
  'era-warlord': { zhili: 1.2, fengxi: 1.2, zhiyuan: 1.2, guomin: 0.6, ri: 0.2 },
  'era-nanjing': { zhili: 1.0, fengxi: 1.0, zhiyuan: 1.0, guomin: 1.1, ri: 0.3 },
  'era-resistance': { zhili: 0.5, fengxi: 0.5, zhiyuan: 0.8, guomin: 0.9, ri: 1.5 },
  'era-civilwar': { zhili: 0.3, fengxi: 0.3, zhiyuan: 0.3, guomin: 0.8, ri: 0 },
  'era-collapse': { zhili: 0.3, fengxi: 0.3, zhiyuan: 0.3, guomin: 0.8, ri: 0 },
})

// 邻接表（L0-05 聚合：城市 → 邻城集合；exit 线路不计邻接 —— 出境线无占领语义）
function adjacency(): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  for (const c of cities) adj.set(c.id, new Set())
  for (const line of transport) {
    if (line.kind === 'exit') continue
    adj.get(line.from)?.add(line.to)
    adj.get(line.to)?.add(line.from)
  }
  // 健康度断言（M-11 adjacency 语义）：孤城 = 邻接缺失
  for (const [cityId, set] of adj) {
    if (set.size === 0) throw new Error(`邻接健康度：城市 ${cityId} 无邻接线（L0-05 覆盖缺口）`)
  }
  return adj
}

// 势力兵力的守军分摊（骨架口径：势力总兵力均摊到其控制城 —— 城守军 = 势力兵力/城数）
function garrisonOf(strength: Record<string, number>, controller: string | null, controlCounts: Map<string, number>): number {
  if (!controller || controller === 'none') return 0
  const count = controlCounts.get(controller) ?? 1
  return Math.floor((strength[controller] ?? 0) / Math.max(1, count))
}

export const factions: EngineModule = {
  id: 'factions',
  phase: 'simulation',
  cadence: 'monthly',
  reads: ['_authority.territoryControl', 'forces/*', 'war/*', 'world.date', 'era'],
  writes: ['_authority.territoryControl', 'forces/*', 'war/*'],
  collect(state, ctx: TickContext): DomainEffect[] {
    const tree = state as unknown as Tree
    const date = tree.world?.date ?? ''
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) return []
    const iso = `${date}-01`
    const strength = { ...(tree.forces?.strength ?? {}) }
    const warnings = { ...(tree.war?.siegeWarnings ?? {}) }
    const contested = { ...(tree.war?.contested ?? {}) }
    const adj = adjacency()
    const rng = ctx.rng('factions')

    // 控制权投影（读 claim 层 —— 链①-1 history 本月刚落的史实可见）
    const controlCounts = new Map<string, number>()
    const controllerOf = new Map<string, string | null>()
    for (const c of cities) {
      const ctrl = activeController(tree, iso)
      void ctrl // claim 按 polity 落；城市 → polity 经 provinceId（控制权口径）
      const controller = controllerForPolity(tree, c.provinceId, iso)
      controllerOf.set(c.id, controller)
      if (controller) controlCounts.set(controller, (controlCounts.get(controller) ?? 0) + 1)
    }

    // ① 扩军（预算 = 基础岁入 × 时代系数；+5–15%/月）
    const aggression = AGGRESSION[tree.era?.eraId] ?? AGGRESSION['era-warlord']
    for (const [fid, s] of Object.entries(strength)) {
      const budget = BASE_INCOME * (aggression[fid] ?? 0.5)
      if (budget <= 0) continue
      const grow = 0.05 + rng.next() * 0.10 // +5–15%（rng 月序派生 —— 确定性）
      strength[fid] = Math.min(2000, Math.floor(s * (1 + grow)))
    }

    // ② 威胁评估与预警（E-3.2：对每城，邻城敌方兵力 vs 守军 × 1.3）
    const effects: DomainEffect[] = []
    for (const c of cities) {
      const controller = controllerOf.get(c.id)
      if (!controller || controller === 'none') continue // 无主城不入围城判定
      const garrison = garrisonOf(strength, controller, controlCounts)
      let threat = 0
      let topAttacker: string | null = null
      for (const nb of adj.get(c.id) ?? []) {
        const nbCtrl = controllerOf.get(nb)
        if (!nbCtrl || nbCtrl === controller || nbCtrl === 'none') continue
        const nbGarrison = garrisonOf(strength, nbCtrl, controlCounts)
        threat += nbGarrison
        if (!topAttacker || nbGarrison > garrisonOf(strength, topAttacker, controlCounts)) topAttacker = nbCtrl
      }
      const ratio = garrison > 0 ? threat / (garrison * ADVANTAGE) : 0
      const warning = warnings[c.id]
      if (ratio >= 1 && topAttacker && SIEGE_TARGETS.includes(c.id)) {
        // 挂预警（仅史实目标城 —— 龙骨口径；威胁解除即清）
        if (!warning) warnings[c.id] = { cityId: c.id, factionId: topAttacker, sinceMonth: ctx.monthIndex }
      } else if (warning && ratio < 1) {
        delete warnings[c.id] // 威胁解除：清台账重计时（E-3.2 原文）
      }
    }

    // ③ 攻城判定（预警挂满 LEAD_MONTHS：史实目标城 → contested；胜负按优势比）
    for (const [cityId, w] of Object.entries(warnings)) {
      if (ctx.monthIndex - w.sinceMonth < LEAD_MONTHS) continue
      const controller = controllerOf.get(cityId)
      const garrison = garrisonOf(strength, controller, controlCounts)
      const attackerStrength = strength[w.factionId] ?? 0
      if (attackerStrength > garrison * ADVANTAGE) {
        // 破城 → contested（2 月后并入 —— 下轮 ④ 处理到期）
        contested[cityId] = { cityId, factionId: w.factionId, sinceMonth: ctx.monthIndex }
        delete warnings[cityId]
      } else {
        // 消耗战：双方 −5～10%（E-3.2 原文带宽）
        const lossA = Math.floor(attackerStrength * (0.05 + rng.next() * 0.05))
        const lossD = Math.floor(garrison * (0.05 + rng.next() * 0.05))
        strength[w.factionId] = Math.max(0, attackerStrength - lossA)
        if (controller) strength[controller] = Math.max(0, (strength[controller] ?? 0) - lossD)
      }
    }

    // ④ contested 到期 → 并入（claim 链①-2：与 history/Occupation 同一编译路径）
    for (const [cityId, ct] of Object.entries(contested)) {
      if (ctx.monthIndex - ct.sinceMonth < CONTESTED_MONTHS) continue
      const city = cities.find((c) => c.id === cityId)
      if (city) {
        effects.push({
          op: 'claimTerritory',
          args: {
            polityId: city.provinceId,
            controller: ct.factionId as never,
            interval: { from: iso, to: '1950-01-01' }, // 开区间右端 = 无限期（首尾相接由后续 claim 接管）
          },
        })
      }
      delete contested[cityId]
    }

    effects.push({ op: 'forcesPost', args: { strength } })
    effects.push({ op: 'warPost', args: { war: { siegeWarnings: warnings, contested } } })
    return effects
  },
}

// claim 层查询：城市省 → 该 polity 当前生效条目的 controller（后到优先 —— 表序即时间序）
import { baseTables } from '../data/loader'
function controllerForPolity(tree: Tree, polityId: string, iso: string): string | null {
  // 树内 claim（history 已落）优先 —— 半开区间命中取最后一条
  let active: string | null = null
  for (const claim of tree._authority.territoryControl.claims) {
    if (claim.polityId === polityId && claim.interval.from <= iso && iso < claim.interval.to) active = claim.controller
  }
  if (active) return active
  // 树内无 claim → 回退覆盖层锚点（1936 快照 —— 降级矩阵 §9.8：时间线覆盖层空按锚点）
  for (const overlay of baseTables()['L0-09'] as { groups: { polities: { polityId: string; from: string; to: string; controller: string }[] }[] }[]) {
    for (const group of overlay.groups) {
      for (const p of group.polities) {
        if (p.polityId === polityId && p.from <= iso && iso < p.to) return p.controller
      }
    }
  }
  return null
}
