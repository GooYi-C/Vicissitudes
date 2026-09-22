// src/engine/fiscal.ts — 模块 7：控制城税收；军费→治安（monthly；链②-1 先于 worldtick 写 map/*/security）。
// M-03 写域：fiscal/*、map/*/security（链②-1 —— 本模块是链②首位）。
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
//
// E-1.4 控城财政四项（结构继承；数值初值，复核点：E-1.4「繁荣 ≥55 ≈ +50–200/月」）：
//   税收 = taxBase × 六维均值% / 100（taxBase 骨架口径 = 城市表 economy × 2 —— 沪 ≈190/月）
//   净收益 = 税收 − (军费 + 行政费)；行政费 = 税收 × 20%
//   军费→治安灌注（链②）：security += 军费 / (军费 + taxBase × 0.5) × 15 − 5
//     （饱和曲线：小额军费高效、大额边际递减；基准线 −5 = 无军费时治安自然下滑，
//      灌注不足的城治安恶化 —— E-1.4「残城军费倒贴」的机制面）
// 撤离/易主：易手城自动从 cities 账剔除（R3 OccupationCommand 接线后由命令层维护；
// 引擎侧每月复核控制权 —— 现阶段无 claim 数据，全部城视为无主不入账）。
// 玩家不控城 = cities 空 → 零产出（骨架期常态）。

import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'
import type { Tree, FiscalCity } from '../validation/tree'
import { activeControllerForCity } from '../validation/tree'
import { cities } from '../data/cities'

// 玩家控制器标识（OccupationCommand 落 claim 的 controller 值 —— R3 前无玩家 claim，
// 控制权判定恒空 → 控城账恒空；公式就位，数据随 R3 通电）
const PLAYER_CONTROLLER = 'player' as const

export const fiscal: EngineModule = {
  id: 'fiscal',
  phase: 'simulation',
  cadence: 'monthly',
  // 读 _authority.territoryControl：链①前位（history 第 2 位）写者 —— 本月史实 claim
  // 已提交可见；factions（链①-2 后位）本月产出未生效 —— 读上月势力态，月度财政口径正确。
  reads: ['fiscal/*', 'map/*', '_authority.territoryControl'],
  writes: ['fiscal/*', 'map/*'],
  collect(state, _ctx: TickContext): DomainEffect[] {
    void _ctx
    const tree = state as unknown as Tree
    const current = tree.fiscal?.cities ?? {}
    const date = tree.world?.date ?? ''
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) return []
    const iso = `${date}-01`

    const effects: DomainEffect[] = []
    const next: Record<string, FiscalCity> = {}

    for (const [cityId, f] of Object.entries(current)) {
      const city = cities.find((c) => c.id === cityId)
      if (!city) continue // 未知城市：不入账（拒载不猜测 —— 数据面守 DAT 组）
      // 控制权复核：玩家仍控该城才续账（claim 层城级查询 —— 半开区间口径；
      // 必须逐城查：claim 的 polityId 是省 id，跨省时非城级查询会把别省控制者算到本城）
      const controller = activeControllerForCity(tree, cityId, iso)
      const stillOurs = controller === PLAYER_CONTROLLER || f.taxBase > 0 // 骨架：账在即续（R3 接真实复核）
      if (!stillOurs) continue // 易手城自动出账（军费停付 —— 撤离的财政面）

      const dims = tree.map?.[cityId]
      if (!dims) {
        // 城未播种（map 无此城）：本模块早于 worldtick（registry 序：fiscal #7 → worldtick #8），
        // 开局首月的 map 还是 initialTree 的空表。此前这里直接 continue ⇒ 该城从 next 消失，
        // 而 fiscalPost 是**全量 replace**，于是开局控城账在首月被清掉、此后无行可循环 ⇒ 终身零收益。
        // 故未播种月**原样留账**（不重算、不出账），待 map 播种后按公式接管。
        next[cityId] = f
        continue
      }
      const avg = (dims.economy + dims.security + dims.culture + dims.transport + dims.industry + dims.population) / 6
      const taxBase = f.taxBase > 0 ? f.taxBase : city.dims.economy * 2 // 骨架口径（城表 economy × 2）
      const revenue = Math.round(taxBase * (avg / 100) * 100) / 100
      const admin = Math.round(revenue * 0.2 * 100) / 100
      const net = Math.round((revenue - admin - f.militarySpend) * 100) / 100

      next[cityId] = {
        ...f,
        taxBase,
        lastRevenue: net, // 净收益口径（E-1.4：净收益非毛税收 —— settlement 消费同字段）
      }

      // 链②-1：军费→治安灌注（唯一写 map/*/security 的模块位；worldtick 后位读）
      // 基准 = 树内六维（与编译器重放同源 —— 不用 L0 兜底，防「模块按 L0 算、编译按树算」的基差）
      if (f.militarySpend > 0) {
        const infusion = (f.militarySpend / (f.militarySpend + taxBase * 0.5)) * 15 - 5
        const security = Math.min(100, Math.max(0, Math.round((dims.security + infusion) * 10) / 10))
        effects.push({ op: 'cityEffect', args: { cityId, dim: 'security', delta: Math.round((security - dims.security) * 10) / 10 } })
      }
    }

    effects.push({ op: 'fiscalPost', args: { cities: next } })
    return effects
  },
}
