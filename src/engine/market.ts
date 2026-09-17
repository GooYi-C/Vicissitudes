// src/engine/market.ts — 模块 3：十城特产 + 景气 + 战时系数定价（monthly；B-03 唯一发布）
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// M-03 写域：economy.commodities（Tier 0 —— market 独占）。
// 产出 MarketResult（marketPublish 效果）由编排器发布进 ctx.market（B-03：无第二获取路径）。
//
// §9.2 定价公式（标定五步第①步：specialty 等价口径起步）：
//   供给 = Σ 城市 specialty 命中该商品的 economy 六维加权供给
//   需求 = Σ 城市 population × 需求权重（民生/工业品两档）
//   供需比 → 价格（上限 3.0 钳制防炸价；下限 0.3 防崩盘）
//   price = basePrice × clamp(需求/供给, 0.3, 3.0) × 战时系数 × 季节因子(仅粮食)
// 数值三问：
// - 供需钳制 [0.3, 3.0] —— 依据 §9.2「上限 3.0 钳制防炸价」；下限对称补 0.3；复核点：标定快照。
// - 战时系数 1.0/×2.5 —— 依据附录 E「战时系数 ×2.5」初值；分期口径对齐时代（eraId）；
//   复核点：E-1.3 时代系数表（1937 起战时爬升，内容期按年插值）。
// - 季节粮价 —— 依据 §9.2「季节粮价进 market 一处」；因子来自 worldtick 上月落的
//   seasonal.grainFactor（worldtick 只产出参数值，改价动作在 market —— §9.2 分工原文）。
// - 景气（需求侧乘数）：六维 economy 均值/100 —— 繁荣市道需求旺；依据 §9.2「景气」；
//   复核点：与 E-1.4 实业收益率（繁荣 ≥60 取上沿）同源联动。

import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'
import type { Tree } from '../validation/tree'
import { commodities } from '../data/commodities'
import { cities } from '../data/cities'

// 民生刚需（需求权重 1.0）vs 工业原料（0.6）vs 奢侈（0.3）——初值；依据：需求弹性常识排序；
// 复核点：标定五步第⑤步价格快照（18 商品首月价与 basePrice 偏差带 ±30%）
const DEMAND_WEIGHT: Readonly<Record<string, number>> = Object.freeze({
  'cmd-grain': 1.0, 'cmd-salt': 0.9, 'cmd-cloth': 0.8, 'cmd-coal': 0.8,
  'cmd-kerosene': 0.7, 'cmd-cotton': 0.6, 'cmd-iron': 0.6, 'cmd-timber': 0.6,
  'cmd-paper': 0.5, 'cmd-wool': 0.5, 'cmd-cigarette': 0.4, 'cmd-matches': 0.4,
  'cmd-tea': 0.4, 'cmd-porcelain': 0.3, 'cmd-silk': 0.3, 'cmd-tungoil': 0.3,
  'cmd-medicine': 0.3, 'cmd-opium': 0.2,
})

// 供给强度（每产地基准供给权重）——初值 3.0；依据：需求/供给量纲配平（Σ需求 ≈ Σ供给
// 时 ratio ≈ 1 → 价格贴锚；刚需品需求权重高须有产地产能对冲，否则 18 商品整体顶到 3.0
// 钳制——首版实测暴露：供给 2.6 vs 需求 7.7 → 全表 ×2.98 钳制带贴顶）。复核点：标定快照。
const SUPPLY_UNIT = 3.0

// 战时系数（§9.2）：和平 1.0；战时 2.5（附录 E 初值）。分界对齐时代表：
// era-resistance(1937–1944) 全程战时；era-civilwar 回落 1.4（内战破坏仍在）。
// 复核点：E-1.3 时代经济系数表（内容期按年插值 1.6→2.5 爬升）
const WAR_FACTOR: Readonly<Record<string, number>> = Object.freeze({
  'era-warlord': 1.0,
  'era-nanjing': 1.0,
  'era-resistance': 2.5,
  'era-civilwar': 1.4,
  'era-collapse': 2.0,
})

const PRICE_CEILING = 3.0 // §9.2 钳制上限
const PRICE_FLOOR = 0.3 // 对称下限（防崩盘 —— 供给过剩不吃掉全部价值）
const GRAIN_IDS = new Set(['cmd-grain']) // 季节因子作用面（粮食；扩面走内容期）

// 供给：城市 specialty 命中 → economy 权重供给（标定五步第①步 specialty 等价口径）
function nationalSupplyOf(commodityId: string, map: Readonly<Record<string, { economy: number }>>): number {
  let supply = 0
  for (const c of cities) {
    if (c.specialty !== commodityId) continue
    // 产地权重 = SUPPLY_UNIT × (1 + economy/50)（economy 80 的产地 ≈ 2.6 倍基准供给）——初值；
    // 依据：十城 economy 六维差（上海 95 vs 西安 45 应拉开供给差）；复核点：标定快照
    const dims = map[c.id]
    const economy = dims ? dims.economy : c.dims.economy // map 未播种前用 L0 初值
    supply += SUPPLY_UNIT * (1 + economy / 50)
  }
  return supply
}

// 需求：Σ population × 需求权重 × 景气（economy 均值/100）
function nationalDemandOf(commodityId: string, map: Readonly<Record<string, { economy: number; population: number }>>): number {
  const w = DEMAND_WEIGHT[commodityId] ?? 0.3
  let demand = 0
  let boom = 0
  for (const c of cities) {
    const dims = map[c.id]
    const economy = dims ? dims.economy : c.dims.economy
    const population = dims ? dims.population : c.dims.population
    demand += (population / 10) * w
    boom += economy
  }
  return demand * (boom / (cities.length * 100))
}

// 供需配平系数（单一校准点）：demand/supply 的总体水位校正 —— 特种商品
// （单产地）ratio 贴 1（贴锚）；多产地大宗（grain/iron）自然低于 1（丰产压价），
// 鸦片（双产地低需求）落 0.3 地板（禁运品贱卖）。初值 0.23 = 特种品供需比中位
// （cotton 4.36 / supply）的倒数；依据：十城 specialty × 需求权重量纲配平实测；
// 复核点：标定五步第⑤步快照（18 商品 12 月价/锚 ∈ [0.3, 3.0] 无贴顶常态）。
const BALANCE = 0.23

export const market: EngineModule = {
  id: 'market',
  phase: 'simulation',
  cadence: 'monthly',
  // 读 map/*：L0-04 初值兜底（M-02-3 —— market 前位无 map 写者，读到的是上月
  // worldtick 产出的运行态；首月 map 未播种直接用 L0 数据 —— 无前位依赖）
  reads: ['economy.commodities', 'world.date', 'map/*', 'era'],
  writes: ['economy.commodities'],
  collect(state, ctx: TickContext): DomainEffect[] {
    // rng 走 ctx.rng('market')（B-02 —— salt 稳定；首月播种 = 行情表从 L0 物价锚起步）
    const rng = ctx.rng('market')
    const tree = state as unknown as Tree
    const map = tree.map ?? {}
    const war = WAR_FACTOR[tree.era?.eraId] ?? 1.0
    const grainFactor = tree.seasonal?.grainFactor ?? 1
    const quotes: Record<string, { price: number; trend: number }> = {}
    for (const c of commodities) {
      const supply = nationalSupplyOf(c.id, map)
      const demand = nationalDemandOf(c.id, map) * BALANCE
      // 供需比 → 价格因子（钳制 [0.3, 3.0]；供需同 0 → 1.0 中性：无产地无需求不定价）
      const ratio = supply > 0 && demand > 0 ? demand / supply : 1
      const factor = Math.min(Math.max(ratio, PRICE_FLOOR), PRICE_CEILING)
      const seasonal = GRAIN_IDS.has(c.id) ? grainFactor : 1
      const noise = 1 + (rng.next() - 0.5) * 0.04 // ±2% 月噪声（同月同 rng 序 → 确定性）
      const next = Math.round(c.basePrice * factor * war * seasonal * noise * 100) / 100
      const prev = tree.economy?.commodities?.[c.id]?.price ?? c.basePrice
      const trend = prev > 0 ? Math.round(((next - prev) / prev) * 1000) / 10 : 0
      quotes[c.id] = { price: next, trend }
    }
    // B-03 唯一发布：单条 marketPublish 携带整份 MarketResult（编排器解析进 ctx.market）
    return [{ op: 'marketPublish', args: { quotes } }]
  },
}
